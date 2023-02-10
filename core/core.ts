//There has been no great wisdom without an element of madness. /Aristotle/
//And thus i present - Socio.

//libs
import { WebSocketServer } from 'ws'; //https://github.com/websockets/ws https://github.com/websockets/ws/blob/master/doc/ws.md

//mine
import { QueryIsSelect, ParseQueryTables, SocioStringParse, ParseQueryVerb, sleep, GetAllMethodNamesOf } from './utils.js'
import { E, LogHandler, err, log, info, done } from './logging.js'
import { UUID, SocioSecurity } from './secure.js'
import { SocioSession } from './core-session.js'
import { RateLimiter } from './ratelimit.js'

//NB! some fields in these variables are private for safety reasons, but also bcs u shouldnt be altering them, only if through my defined ways. They are mostly expected to be constants.
//whereas public variables are free for you to alter freely at any time during runtime.

//types
import type { ServerOptions, WebSocket, AddressInfo } from 'ws';
import type { IncomingMessage } from 'http'
import type { id, PropKey, PropValue, PropAssigner, CoreMessageKind, ClientMessageKind } from './types.js'
import type { RateLimit } from './ratelimit.js'
export type MessageDataObj = { id?: id, sql?: string, params?: object | null, verb?: string, table?: string, unreg_id?: id, prop?: string, prop_val:PropValue, data?:any, rate_limit?:RateLimit };
export type QueryFuncParams = { id?: id, sql: string, params?: object | null };
export type QueryFunction = (obj: QueryFuncParams | MessageDataObj) => Promise<object>;
type QueryObject = { id: id, params: object | null, session: SocioSession }; //for grouping hooks
type SocioServerOptions = { DB_query_function?: QueryFunction, socio_security?: SocioSecurity | null, verbose?: boolean, decrypt_sql?: boolean, decrypt_prop?: boolean, hard_crash?: boolean, session_delete_delay_ms?: number, recon_ttl_ms?:number }
type AdminMessageDataObj = {function:string, args?:any[], secure_key:string}

export class SocioServer extends LogHandler {
    // private:
    #wss: WebSocketServer;
    #sessions: { [key: id]: SocioSession } = {}; //client_id:SocioSession

    //if constructor is given a SocioSecure object, then that will be used to decrypt all incomming messages, if the msg flag is set
    #secure: { socio_security: SocioSecurity | null, decrypt_sql: boolean, decrypt_prop:boolean};

    //backend props, e.g. strings for colors, that clients can subscribe to and alter
    #props: { [key: PropKey]: { val: PropValue, assigner: PropAssigner, updates: { [client_id: string]: { id: id, rate_limiter?: RateLimiter | null }} } } = {};

    //rate limits server functions globally
    #ratelimits: { [key: string]: RateLimiter | null } = { con: null, upd:null};

    #lifecycle_hooks: { [key: string]: Function | null; } = { con: null, discon: null, msg: null, upd: null, auth: null, gen_client_id:null, grant_perm:null, serv:null, admin:null } //call the register function to hook on these. They will be called if they exist
    //If the hook returns a truthy value, then it is assumed, that the hook handled the msg and the lib will not. Otherwise, by default, the lib handles the msg.
    //msg hook receives all incomming msgs to the server. 
    //upd works the same as msg, but for everytime updates need to be propogated to all the sockets.
    //auth func can return any truthy or falsy value, the client will only receive a boolean, so its safe to set it to some credential or id or smth, as this would be accessible and useful to you when checking the session access to tables.
    //the grant_perm funtion is for validating that the user has access to whatever tables or resources the sql is working with. A client will ask for permission to a verb (SELECT, INSERT...) and table(s). If you grant access, then the server will persist it for the entire connection.
    //the admin function will be called, when a socket attempts to use an ADMIN msg kind. It receives the SocioSession instance, that has id, ip and last seen fields you can use. Also the data it sent, so u can check your own secure key or smth. Return truthy to allow access

    //stores active reconnection tokens
    #tokens: Set<string> = new Set()

    //public:
    Query: QueryFunction; //you can change this at any time
    session_delete_delay_ms:number;
    recon_ttl_ms:number;

    constructor(opts: ServerOptions | undefined = {}, { DB_query_function = undefined, socio_security = null, decrypt_sql = true, decrypt_prop = false, verbose = true, hard_crash = false, session_delete_delay_ms = 1000 * 5, recon_ttl_ms=1000*5 }: SocioServerOptions){
        super({ verbose, hard_crash, prefix:'SocioServer'});
        //verbose - print stuff to the console using my lib. Doesnt affect the log handlers
        //hard_crash will just crash the class instance and propogate (throw) the error encountered without logging it anywhere - up to you to handle.
        //both are public and settable at runtime

        //private:
        this.#wss = new WebSocketServer({ ...opts, clientTracking: true }); //take a look at the WebSocketServer docs - the opts can have a server param, that can be your http server
        this.#secure = { socio_security, decrypt_sql, decrypt_prop}

        //public:
        //@ts-ignore
        this.Query = DB_query_function || (() => {})
        this.session_delete_delay_ms = session_delete_delay_ms;
        this.recon_ttl_ms = recon_ttl_ms;

        this.#wss.on('connection', this.#Connect.bind(this)); //https://thenewstack.io/mastering-javascript-callbacks-bind-apply-call/ have to bind 'this' to the function, otherwise it will use the .on()'s 'this', so that this.[prop] are not undefined
        this.#wss.on('close', (...stuff) => { this.HandleInfo('WebSocketServer close event', ...stuff) });
        this.#wss.on('error', (...stuff) => { this.HandleError(new E('WebSocketServer error event', ...stuff))});

        const addr: AddressInfo = this.#wss.address() as AddressInfo;
        this.done(`Created SocioServer on `, addr);
        // if (addr.family == 'ws')
        //     this.HandleInfo('WARNING! Your server is using an unsecure WebSocket protocol, setup wss:// instead, when you can!');
    }

    #Connect(conn: WebSocket, request: IncomingMessage){
        try{
            //construct the new session with a unique client ID
            let client_id: string = (this.#lifecycle_hooks.gen_client_id ? this.#lifecycle_hooks.gen_client_id() : UUID())?.toString();
            while (client_id in this.#sessions) //avoid id collisions
                client_id = (this.#lifecycle_hooks.gen_client_id ? this.#lifecycle_hooks.gen_client_id() : UUID())?.toString();

            //get the IP. Gets either from a reverse proxy header (like if u have nginx) or just straight off the http meta
            //@ts-ignore
            const client_ip = 'x-forwarded-for' in request?.headers ? request.headers['x-forwarded-for'].split(',')[0].trim() : request.socket.remoteAddress;

            //create the socio session class and save down the client id ref for convenience later
            const client = new SocioSession(client_id, conn, client_ip, { verbose: this.verbose });
            this.#sessions[client_id] = client;

            //pass the object to the connection hook, if it exists. It cant take over
            if (this.#lifecycle_hooks.con)
                this.#lifecycle_hooks.con(client, request); //u can get the client_id and client_ip off the client object

            //notify the client of their ID
            client.Send('CON', client_id);
            this.HandleInfo('CON', client_id); //, this.#wss.clients

            //set this client websockets event handlers
            conn.on('message', (req: Buffer | ArrayBuffer | Buffer[], isBinary: Boolean) => {
                if(client_id in this.#sessions)
                    this.#Message.bind(this)(this.#sessions[client_id], req, isBinary);
                else
                    conn?.close();
            });
            conn.on('close', () => {
                //trigger hook
                if (this.#lifecycle_hooks.discon)
                    this.#lifecycle_hooks.discon(client);

                client.Destroy(() => {
                    //for each prop itereate its update obj and delete the keys with this client_id
                    Object.values(this.#props).forEach(p => {
                        Object.keys(p.updates).forEach(c_id => {
                            if (c_id == client_id)
                                delete p.updates[c_id];
                        })
                    })
                    //Update() only works on session objects, and if we delete this one, then its query subscriptions should also be gone.

                    //delete the connection object and the subscriptions of this client
                    delete this.#sessions[client_id];
                    this.HandleInfo('Session Destroyed', client_id);
                }, this.session_delete_delay_ms);

                this.HandleInfo('DISCON', client_id);
            });
        } catch (e: err) { this.HandleError(e); }
    }

    async #Message(client:SocioSession, req: Buffer | ArrayBuffer | Buffer[], isBinary: Boolean){
        try{
            const { kind, data }: { kind: CoreMessageKind; data: MessageDataObj } = JSON.parse(req.toString());
            const client_id = client.id;

            //if the socio security instance exists and either sql or/and prop was recieved and they are to be decrypted, then do so here
            //this assumes that the incoming message doesnt have both sql and prop in data at the same time.
            if (this.#secure.socio_security && ((data?.sql && this.#secure.decrypt_sql) || (data?.prop && this.#secure.decrypt_prop))) {
                let str: string = (data?.sql ? data.sql : data?.prop) || '', markers:string[]|undefined;

                //check crypt format "[iv_base64] [encrypted_text_base64] [auth_tag_base64]" where each part is base64 encoded
                if (!str.includes(' '))
                    throw new E('encrypted query string does not contain a space, therefor is not of format "iv_base64 original_query_base64" and cannot be processed. [#enc-wrong-format]', client_id, kind, data);

                const parts = str.split(' '); 
                if (parts.length != 3)
                    throw new E('the cipher text does not contain exactly 3 space seperated parts, therefor is invalid. [#cipher-text-invalid-format]', parts);

                //decrypt
                str = this.#secure.socio_security.DecryptString(parts[0], parts[1], parts[2]);
                ;({ str, markers } = SocioStringParse(str));
                
                //assign it back like nothing happened
                if(data?.sql) data.sql = str; 
                else data.prop = str;

                //perform marker checks
                if (!markers?.includes('socio')) //secured sql queries must end with the marker, to validate that they havent been tampered with and are not giberish.
                    throw new E('Decrypted string does not end with the --socio marker, therefor is invalid. [#marker-issue]', client_id, kind, data, markers);

                if (markers?.includes('auth'))//query requiers auth to execute
                    if (!client.authenticated)
                        throw new E(`Client ${client_id} tried to execute an auth query without being authenticated. [#auth-issue]`);

                if (markers?.includes('perm')) {//query requiers perm to execute
                    if(data?.sql){
                        const verb = ParseQueryVerb(data.sql);
                        if (!verb)
                            throw new E(`Client ${client_id} sent an unrecognized SQL query first clause. [#verb-issue]`, data.sql);

                        const tables = ParseQueryTables(data.sql);
                        if (!tables)
                            throw new E(`Client ${client_id} sent an SQL query without table names. [#table-name-issue]`, data.sql);

                        if (!tables.every((t) => client.HasPermFor(verb, t)))
                            throw new E(`Client ${client_id} tried to execute a perms query without having the required permissions. [#perm-issue]`, verb, tables);
                    }else if (data?.prop) throw new E('Perm checking for server props is currently unsupported! #[unsupported-feature]', data, markers)
                }
            }
            this.HandleInfo(`recv: ${kind} from ${client_id}`, data);
            // await sleep(2);

            //let the developer handle the msg
            if (this.#lifecycle_hooks.msg)
                if(this.#lifecycle_hooks.msg(client, kind, data))
                    return;

            switch (kind) {
                case 'REG':                    
                    if (QueryIsSelect(data.sql || '')) {
                        //set up hook
                        const tables = ParseQueryTables(data.sql || '')
                        if (tables)
                            client.RegisterHook(tables, data.id as id, data.sql as string, data.params || null, data?.rate_limit || null);

                        //send response
                        client.Send('UPD', {
                            id: data.id,
                            result: await this.Query(data),
                            status: 'success'
                        })
                    } else
                        //send response
                        client.Send('ERR', {
                            id: data.id,
                            result: 'Only SELECT queries may be subscribed to! [#reg-not-select]'
                        })

                    break;
                case 'UNREG':
                    const res_1 = client.UnRegisterHook(data.unreg_id || '');
                    client.Send('RES', { id: data.id, result: res_1 === true })
                    break;
                case 'SQL':
                    const is_select = QueryIsSelect(data.sql || '')

                    //have to do the query in every case
                    const res = this.Query(data)
                    if (is_select) //wait for result, if a result is expected, and send it back
                        client.Send('RES', { id: data.id, result: await res })

                    //if the sql wasnt a SELECT, but altered some resource, then need to propogate that to other connection hooks
                    if (!is_select)
                        this.Update(ParseQueryTables(data?.sql || ''))
                    
                    break;
                case 'PING': 
                    client.Send('PONG', { id: data?.id }); 
                    break;
                case 'AUTH'://client requests to authenticate itself with the server
                    if (this.#lifecycle_hooks.auth){
                        await client.Authenticate(this.#lifecycle_hooks.auth, client, data.params) //bcs its a private class field, give this function the hook to call and params to it. It will set its field and we can just read that off and send it back as the result
                        client.Send('AUTH', { id: data.id, result: client.authenticated == true }) //authenticated can be any truthy or falsy value, but the client will only receive a boolean, so its safe to set this to like an ID or token or smth for your own use
                    }else{
                        this.HandleError('Auth function hook not registered, so client not authenticated. [#no-auth-func]')
                        client.Send('AUTH', { id: data.id, result: false })
                    }
                    break;
                case 'GET_PERM':
                    //check if already has the perm
                    if (client.HasPermFor(data?.verb, data?.table)){
                        client.Send('GET_PERM', { id: data.id, result: true, verb: data.verb, table: data.table });
                    }
                    //otherwise try to grant the perm
                    else if(this.#lifecycle_hooks?.grant_perm){
                        const granted:boolean = await this.#lifecycle_hooks?.grant_perm(client_id, data)
                        client.Send('GET_PERM', { id: data.id, result: granted === true, verb: data.verb, table: data.table }) //the client will only receive a boolean, but still make sure to only return bools as well
                    }
                    else {
                        this.HandleError('grant_perm function hook not registered, so client not granted perm. [#no-grant_perm-func]')
                        client.Send('GET_PERM', { id: data.id, result: false })
                    }
                    break;
                case 'PROP_REG':
                    this.#CheckPropExists(data?.prop, client, data.id as id, 'Prop key does not exist on the backend! [#prop-reg-not-found]')
                    //set up hook
                    this.#props[data.prop as PropKey].updates[client_id] = { id: data.id as id, rate_limiter: data?.rate_limit ? new RateLimiter(data.rate_limit) : null}

                    //send response
                    client.Send('PROP_UPD', {
                        id: data.id,
                        prop: data.prop,
                        result: this.GetPropVal(data.prop as PropKey)
                    })
                    break;
                case 'PROP_UNREG':
                    this.#CheckPropExists(data?.prop, client, data?.id as id, 'Prop key does not exist on the backend! [#prop-reg-not-found]')
                    //remove hook
                    try{
                        delete this.#props[data.prop as string].updates[client_id]

                        //send response
                        client.Send('RES', {
                            id: data?.id,
                            result: true
                        });
                    } catch (e: err) {
                        //send response
                        client.Send('ERR', {
                            id: data?.id,
                            result: e?.msg
                        });
                        throw e; //report on the server as well
                    }
                    break;
                case 'PROP_GET':
                    this.#CheckPropExists(data?.prop, client, data.id as id, 'Prop key does not exist on the backend! [#prop-reg-not-found]')
                    client.Send('RES', {
                        id: data.id,
                        result: this.GetPropVal(data.prop as string)
                    })
                    break;
                case 'PROP_SET':
                    this.#CheckPropExists(data?.prop, client, data.id as id, 'Prop key does not exist on the backend! [#prop-reg-not-found]')
                    try {
                        this.UpdatePropVal(data.prop as string, data?.prop_val, client.id);
                        if(client_id in this.#sessions)
                            client.Send('RES', { id: data.id, result:true}); //resolve this request to true, so the client knows everything went fine.
                    } catch (e: err) {
                        //send response
                        client.Send('ERR', {
                            id: data.id,
                            result: e?.msg
                        });
                        throw e; //report on the server as well
                    }
                    break;
                case 'SERV': 
                    if (this.#lifecycle_hooks?.serv)
                        this.#lifecycle_hooks.serv(client, data);
                    else throw new E('Client sent generic data to the server, but the hook for it is not registed. [#no-serv-hook]', client_id);
                    break;
                case 'ADMIN':
                    if(this.#lifecycle_hooks.admin)
                        if (this.#lifecycle_hooks.admin(client, data)) //you get the client, which has its ID, ipAddr and last_seen fields, that can be used to verify access. Also data should contain some secret key, but thats up to you
                            client.Send('RES', await this.#Admin(((data as unknown) as AdminMessageDataObj)?.function, ((data as unknown) as AdminMessageDataObj)?.args));
                        else throw new E('A non Admin send an Admin message, but was not executed.', kind, data, client_id);
                    break;
                case 'RECON': //client attempts to reconnect to its previous session
                    if(!this.#secure){
                        client.Send('ERR', { id: data.id, result: 'Cannot reconnect on this server configuration!', status: 0 });
                        throw new E(`RECON requires SocioServer to be set up with the Secure class! [#recon-needs-secure]`, kind, data);
                    }

                    if (data?.data?.type == 'GET'){
                        //@ts-expect-error
                        const token = this.#secure.socio_security.EncryptString([client.ipAddr, client.id, (new Date()).getTime()].join(' ')); //creates string in the format "[iv_base64] [encrypted_text_base64] [auth_tag_base64]" where encrypted_text_base64 is a token of format "[ip] [client_id] [ms_since_epoch]"
                        this.#tokens.add(token);
                        client.Send('RES', { id: data.id, result: token }); //send the token to the client for one-time use to reconnect to their established client session
                    }
                    else if (data?.data?.type == 'POST'){
                        //check for valid token to begin with
                        if (!data?.data?.token || !this.#tokens.has(data.data.token)) {
                            client.Send('RECON', { id: data.id, result: 'Invalid token', status: 0 });
                            return;
                        }
                        this.#tokens.delete(data.data.token); //single use token, so delete

                        let [iv, token, auth_tag] = data.data.token.split(' '); //split the format into encryption parts
                        try {
                            if (iv && token && auth_tag)
                                token = this.#secure.socio_security?.DecryptString(iv, token, auth_tag); //decrypt the payload
                            else
                                client.Send('RECON', { id: data.id, result: 'Invalid token', status: 0 });
                        } catch (e: err) {
                            client.Send('RECON', { id: data.id, result: 'Invalid token', status: 0 });
                            return;
                        }

                        const [ip, old_c_id, time_stamp] = token.split(' '); //decrypted payload parts
                        //safety check race conditions
                        if (client.ipAddr !== ip) {
                            client.Send('RECON', { id: data.id, result: 'IP address changed between reconnect', status: 0 });
                            return;
                        }
                        else if ((new Date()).getTime() - time_stamp > this.recon_ttl_ms){
                            client.Send('RECON', { id: data.id, result: 'Token has expired', status: 0 });
                            return;
                        }
                        else if (!(old_c_id in this.#sessions)) {
                            client.Send('RECON', { id: data.id, result: 'Old session ID was not found', status: 0 });
                            return;
                        }

                        //recon procedure
                        const old_client = this.#sessions[old_c_id];
                        old_client.Restore();//stop the old session deletion, since a reconnect was actually attempted
                        client.CopySessionFrom(old_client);

                        //clear the subscriptions on the sockets, since the new instance will define new ones on the new page. Also to avoid ID conflicts
                        this.#ClearClientSessionSubs(old_c_id);
                        this.#ClearClientSessionSubs(client.id);

                        //delete old session for good
                        old_client.Destroy(() => {
                            delete this.#sessions[old_c_id];
                        }, this.session_delete_delay_ms);

                        //notify the client 
                        client.Send('RECON', { id: data.id, result: { old_client_id: old_c_id, auth: client.authenticated }, status: 1 });
                        this.HandleInfo(`RECON ${old_c_id} -> ${client.id} (old client ID -> new/current client ID)`);
                    }
                    break;
                    // case '': break;
                default: throw new E(`Unrecognized message kind! [#unknown-msg-kind]`, kind, data);
            }
        } catch (e: err) { this.HandleError(e); }
    }

    Update(tables:string[]=[]){
        if(!tables.length) return;
        
        //rate limit check
        if(this.#ratelimits.upd)
            if(this.#ratelimits.upd.CheckLimit())
                return;

        //hand off to hook
        if (this.#lifecycle_hooks.upd)
            if (this.#lifecycle_hooks.upd(this.#sessions, tables))
                return;

        //try the logic myself
        try{
            //gather all sessions hooks sql queries that involve the altered tables, and who's ratelimit has not been exceeded
            const queries: { [key: string]: QueryObject[]} = {}
            Object.values(this.#sessions).forEach(s => {
                s.GetHooksForTables(tables).forEach(h => { //GetHooksQueriesForTables always returns array. If empty, then the foreach wont run, so each sql guaranteed to have hooks array
                    //rate limit check
                    if (h?.rate_limiter && h?.rate_limiter.CheckLimit()) return;

                    const obj: QueryObject = { id: h.id, params: h.params, session: s }
                    if(h.sql in queries)
                        queries[h.sql].push(obj)
                    else
                        queries[h.sql] = [obj]
                })
            })

            //asyncronously bombard the DB with queries. When they resolve, send the client the result.
            for (const [sql, hooks] of Object.entries(queries)){
                try{
                    //group the hooks based on SQL + PARAMS (to optimize DB mashing), since those queries would be identical, but the recipients most likely arent, so cant just dedup the array.
                    for (const group_hooks of GroupHooks(sql, hooks)){ //not using for await, bcs there is no need to block the thread. Instead we can queue up all the queries and they will continue, once DB returns value.
                        this.Query({ sql: sql, params: group_hooks[0].params }) //grab the first ones params, since all params of hooks of a group should be the same. Seeing as this query is done on behalf of a bunch of sessions, then the other args cannot be provided.
                        .then(res => { //once the query completes, send out this result to all sessions that are subed to it
                            group_hooks.forEach(h => {
                                h.session.Send('UPD', {
                                    id: h.id,
                                    result: res,
                                    status:'success'
                                })
                            })
                        })
                        .catch(err => { //otherwise an error occured with that particular query and we send that out
                            group_hooks.forEach(h => {
                                h.session.Send('UPD', {
                                    id: h.id,
                                    result: err,
                                    status: 'error'
                                })
                            })
                        })
                    }
                } catch (e:err) { this.HandleError(e) }
            }
        } catch (e:err) { this.HandleError(e) }
    }

    #CheckPropExists(prop: PropKey | undefined, client: SocioSession, msg_id:id, error_msg: string){
        if (!prop || !(prop in this.#props)){
            client.Send('ERR', {
                id: msg_id,
                result: error_msg
            });
            throw new E(error_msg, prop, client.id)
        }
    }

    RegisterLifecycleHookHandler(f_name:string, handler:Function|null=null){
        try{
            if (f_name in this.#lifecycle_hooks)
                this.#lifecycle_hooks[f_name] = handler;
            else throw new E(`Lifecycle hook [${f_name}] does not exist! Settable: ${this.LifecycleHookNames}`)
        } catch (e:err) { this.HandleError(e) }
    }
    UnRegisterLifecycleHookHandler(name = '') {
        try{
            if (name in this.#lifecycle_hooks)
                this.#lifecycle_hooks[name] = null;
            else throw new E(`Lifecycle hook [${name}] does not exist!`)
        } catch (e:err) { this.HandleError(e) }
    }
    get LifecycleHookNames(){return Object.keys(this.#lifecycle_hooks)}

    RegisterRateLimit(f_name: string, ratelimit: RateLimit | null = null){
        try {
            if (f_name in this.#ratelimits){
                if (ratelimit) {
                    this.#ratelimits[f_name] = new RateLimiter(ratelimit);
                    log('registered')
                }
            }
            else throw new E(`Rate Limits hook [${f_name}] is not settable! Settable: ${this.RateLimitNames}`)
        } catch (e: err) { this.HandleError(e) }
    }
    UnRegisterRateLimit(f_name: string) {
        try {
            if (f_name in this.#ratelimits)
                this.#ratelimits[f_name] = null;
            else throw new E(`Rate Limits hook [${f_name}] is not settable! Settable: ${this.RateLimitNames}`)
        } catch (e: err) { this.HandleError(e) }
    }
    get RateLimitNames() { return Object.keys(this.#ratelimits) }

    GetClientSession(client_id=''): SocioSession | null{
        return client_id in this.#sessions ? this.#sessions[client_id] : null
    }

    //assigner defaults to basic setter
    RegisterProp(key: PropKey, val: PropValue, assigner: PropAssigner = (key: PropKey, new_val: PropValue) => this.SetPropVal(key, new_val)){
        try{
            if (key in this.#props)
                throw new E(`Prop key [${key}] has already been registered and for client continuity is forbiden to over-write at runtime. [#prop-key-exists]`)
            else
                this.#props[key] = { val, assigner, updates: {} }
        } catch (e: err) { this.HandleError(e) }
    }
    UnRegisterProp(key: PropKey){
        try {
            //TODO more graceful unregister, bcs the clients dont know about this, and their queries will just fail, which is needless traffic.
            if (key in this.#props)
                delete this.#props[key];
            else
                throw new E(`Prop key [${key}] hasnt been registered. [#prop-key-not-exists]`);
        } catch (e: err) { this.HandleError(e) }
    }
    GetPropVal(key: PropKey){
        if (key in this.#props)
            return this.#props[key].val || null
        else return null;
    }
    UpdatePropVal(key: PropKey, new_val: PropValue, client_id: id | null):void{//this will propogate the change, if it is assigned, to all subscriptions
        if(key in this.#props){
            if (this.#props[key].assigner(key, new_val)) {//if the prop was passed and the value was set successfully, then update all the subscriptions
                Object.entries(this.#props[key].updates).forEach(([client_id, args]) => {
                    //ratelimit check
                    if (args?.rate_limiter && args?.rate_limiter?.CheckLimit())
                        return;
                    
                    //do the thing
                    if (client_id in this.#sessions)
                        this.#sessions[client_id].Send('PROP_UPD', { id: args.id, prop: key, result: this.GetPropVal(key) }); //should be GetPropVal, bcs i cant know how the assigner changed the val
                    else {//the client_id doesnt exist anymore for some reason, so unsubscribe
                        delete this.#props[key].updates[client_id];
                        delete this.#sessions[client_id];
                    }
                });
            } 
            else
                throw new E(`Prop key [${key}] tried to set an invalid value! [#prop-set-not-valid]. Key, val, client_id`, key, new_val, client_id);
        }else
            throw new E(`Prop key [${key}] not registered! [#prop-set-not-found]`);
    }
    SetPropVal(key: PropKey, new_val: PropValue): boolean { //this hard sets the value without checks or updating clients
        try{
            this.#props[key].val = new_val;
            return true;
        } catch (e: err) { this.HandleError(e); return false; }
    }

    //send some data to all clients by their ID. By default emits to all connected clients
    SendToClients(client_ids: id[] = [], data: object = {}, kind: ClientMessageKind = 'CMD'){
        if(!client_ids.length)
            Object.values(this.#sessions).forEach(s => s.Send(kind, data));
        else
            client_ids.forEach(c_id => this.#sessions[c_id].Send(kind, data));
    }

    //https://stackoverflow.com/a/54875979/8422448
    async #Admin(function_name:string = '', args:any[] = []){
        try{
            if (GetAllMethodNamesOf(this).includes(function_name))
                return this[function_name].call(this, ...args); //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/call
            else
                return `[${function_name}] is not a name of a function on the SocioServer instance`;
        }catch(e){return e;}
    }
    get methods() { return GetAllMethodNamesOf(this) }

    #ClearClientSessionSubs(client_id:id){
        this.#sessions[client_id].ClearHooks(); //clear query subs
        Object.values(this.#props).forEach(prop => { if (client_id in prop.updates) delete prop.updates[client_id]; }); //clear prop subs
    }
}

//group the hooks based on SQL + PARAMS (to optimize DB mashing), since those queries would be identical, but the recipients most likely arent, so cant just dedup the array.
//the key is only needed for grouping into arrays. So returns just the values of the final object. Array of arrays (hooks).
function GroupHooks(sql = '', hooks: QueryObject[]=[]){
    const grouped: { [key: string]: QueryObject[] } = {}
    for(const h of hooks){
        const key = sql + JSON.stringify(h.params)
        if(key in grouped)
            grouped[key].push(h)
        else
            grouped[key] = [h]
    }
    return Object.values(grouped)
}