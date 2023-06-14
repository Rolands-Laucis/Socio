//There has been no great wisdom without an element of madness. /Aristotle/
//And thus i present - Socio.

//libs
import { WebSocketServer } from 'ws'; //https://github.com/websockets/ws https://github.com/websockets/ws/blob/master/doc/ws.md

//mine
import { QueryIsSelect, ParseQueryTables, SocioStringParse, ParseQueryVerb, sleep, GetAllMethodNamesOf, MapReviver } from './utils.js';
import { E, LogHandler, err, log, info, done } from './logging.js';
import { UUID, SocioSecurity } from './secure.js';
import { SocioSession } from './core-session.js';
import { RateLimiter } from './ratelimit.js';

//NB! some fields in these variables are private for safety reasons, but also bcs u shouldnt be altering them, only if through my defined ways. They are mostly expected to be constants.
//whereas public variables are free for you to alter freely at any time during runtime.

//types
import type { ServerOptions, WebSocket, AddressInfo } from 'ws';
import type { IncomingMessage } from 'http';
import type { id, PropKey, PropValue, PropAssigner, CoreMessageKind, ClientMessageKind, SocioFiles, ClientID, FS_Util_Response } from './types.js';
import type { GenCLientID_Hook, Con_Hook, Msg_Hook, Sub_Hook, Upd_Hook, Auth_Hook, Blob_Hook, Serv_Hook, Admin_Hook, Unsub_Hook, Discon_Hook, GrantPerm_Hook, FileUpload_Hook, FileDownload_Hook } from './types.js';
import type { RateLimit } from './ratelimit.js';
export type MessageDataObj = { id?: id, sql?: string, params?: object | null | Array<any>, verb?: string, table?: string, unreg_id?: id, prop?: string, prop_val:PropValue, data?:any, rate_limit?:RateLimit, files?:SocioFiles };
export type QueryFuncParams = { id?: id, sql: string, params?: object | null };
export type QueryFunction = (client:SocioSession, id:id, sql:string, params?:object|null) => Promise<object>;
type SocioServerOptions = { DB_query_function?: QueryFunction, socio_security?: SocioSecurity | null, verbose?: boolean, decrypt_sql?: boolean, decrypt_prop?: boolean, hard_crash?: boolean, session_delete_delay_ms?: number, recon_ttl_ms?:number }
type AdminMessageDataObj = {function:string, args?:any[], secure_key:string};

export class SocioServer extends LogHandler {
    // private:
    #wss: WebSocketServer;
    #sessions: Map<ClientID, SocioSession> = new Map(); //client_id:SocioSession. Maps are quite more performant than objects

    //if constructor is given a SocioSecure object, then that will be used to decrypt all incomming messages, if the msg flag is set
    #secure: { socio_security: SocioSecurity | null, decrypt_sql: boolean, decrypt_prop:boolean};

    //backend props, e.g. strings for colors, that clients can subscribe to and alter
    #props: Map<PropKey, { val: PropValue, assigner: PropAssigner, updates: Map<ClientID, { id: id, rate_limiter?: RateLimiter | null }> }> = new Map();

    //rate limits server functions globally
    #ratelimits: { [key: string]: RateLimiter | null } = { con: null, upd:null};

    #lifecycle_hooks: { [f_name: string]: Function | null; } = { con: null as (Con_Hook | null), discon: null as (Discon_Hook | null), msg: null as (Msg_Hook | null), sub: null as (Sub_Hook | null), unsub: null as (Unsub_Hook | null), upd: null as (Upd_Hook | null), auth: null as (Auth_Hook | null), gen_client_id: null as (GenCLientID_Hook | null), grant_perm: null as (GrantPerm_Hook | null), serv: null as (Serv_Hook | null), admin: null as (Admin_Hook | null), blob: null as (Blob_Hook | null), file_upload: null as (FileUpload_Hook | null), file_download: null as (FileDownload_Hook | null) } //call the register function to hook on these. They will be called if they exist
    //If the hook returns a truthy value, then it is assumed, that the hook handled the msg and the lib will not. Otherwise, by default, the lib handles the msg.
    //msg hook receives all incomming msgs to the server. 
    //upd works the same as msg, but for everytime updates need to be propogated to all the sockets.
    //auth func can return any truthy or falsy value, the client will only receive a boolean, so its safe to set it to some credential or id or smth, as this would be accessible and useful to you when checking the session access to tables.
    //the grant_perm funtion is for validating that the user has access to whatever tables or resources the sql is working with. A client will ask for permission to a verb (SELECT, INSERT...) and table(s). If you grant access, then the server will persist it for the entire connection.
    //the admin function will be called, when a socket attempts to use an ADMIN msg kind. It receives the SocioSession instance, that has id, ip and last seen fields you can use. Also the data it sent, so u can check your own secure key or smth. Return truthy to allow access

    //stores active reconnection tokens
    #tokens: Set<string> = new Set();

    //public:
    Query: QueryFunction; //you can change this at any time
    session_delete_delay_ms:number;
    recon_ttl_ms:number;

    constructor(opts: ServerOptions | undefined = {}, { DB_query_function = undefined, socio_security = null, decrypt_sql = true, decrypt_prop = false, verbose = false, hard_crash = false, session_delete_delay_ms = 1000 * 5, recon_ttl_ms=1000*60*60 }: SocioServerOptions){
        super({ verbose, hard_crash, prefix:'SocioServer'});
        //verbose - print stuff to the console using my lib. Doesnt affect the log handlers
        //hard_crash will just crash the class instance and propogate (throw) the error encountered without logging it anywhere - up to you to handle.
        //both are public and settable at runtime

        //private:
        this.#wss = new WebSocketServer({ ...opts, clientTracking: true }); //take a look at the WebSocketServer docs - the opts can have a server param, that can be your http server
        this.#secure = { socio_security, decrypt_sql, decrypt_prop}

        //public:
        //@ts-expect-error
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

    async #Connect(conn: WebSocket, request: IncomingMessage){
        try{
            //construct the new session with a unique client ID
            let client_id: string = (this.#lifecycle_hooks.gen_client_id ? this.#lifecycle_hooks.gen_client_id() : UUID())?.toString();
            while (this.#sessions.has(client_id)) //avoid id collisions
                client_id = (this.#lifecycle_hooks.gen_client_id ? this.#lifecycle_hooks.gen_client_id() : UUID())?.toString();

            //get the IP. Gets either from a reverse proxy header (like if u have nginx) or just straight off the http meta
            //@ts-ignore
            const client_ip = 'x-forwarded-for' in request?.headers ? request.headers['x-forwarded-for'].split(',')[0].trim() : request.socket.remoteAddress;

            //create the socio session class and save down the client id ref for convenience later
            const client = new SocioSession(client_id, conn, client_ip, { verbose: this.verbose });
            this.#sessions.set(client_id, client);

            //pass the object to the connection hook, if it exists. It cant take over
            if (this.#lifecycle_hooks.con)
                await this.#lifecycle_hooks.con(client, request); //u can get the client_id and client_ip off the client object

            //notify the client of their ID
            client.Send('CON', client_id);
            this.HandleInfo('CON', client_id); //, this.#wss.clients

            //set this client websockets event handlers
            conn.on('message', (req: Buffer | ArrayBuffer | Buffer[], isBinary: Boolean) => {
                if (this.#sessions.has(client_id))//@ts-expect-error
                    this.#Message.bind(this)(this.#sessions.get(client_id), req, isBinary);
                else conn?.close();
            });
            conn.on('close', async () => {
                //trigger hook
                if (this.#lifecycle_hooks.discon)
                    await this.#lifecycle_hooks.discon(client);

                client.Destroy(() => {
                    //for each prop itereate its update obj and delete the keys with this client_id
                    for (const p of this.#props.values()){
                        for (const c_id of p.updates.keys()){
                            if (c_id == client_id)
                                p.updates.delete(c_id);
                        }
                    }
                    //Update() only works on session objects, and if we delete this one, then its query subscriptions should also be gone.

                    //delete the connection object and the subscriptions of this client
                    this.#sessions.delete(client_id);
                    this.HandleInfo('Session Destroyed', client_id);
                }, this.session_delete_delay_ms);

                this.HandleInfo('DISCON', client_id);
            });
        } catch (e: err) { this.HandleError(e); }
    }

    async #Message(client:SocioSession, req: Buffer | ArrayBuffer | Buffer[], isBinary: Boolean){
        try{
            //handle binary data and return
            if(isBinary){
                this.HandleInfo(`recv: BLOB from ${client.id}`)
                if (this.#lifecycle_hooks.blob) {
                    if (await this.#lifecycle_hooks.blob(client, req))
                        client.Send('RES', { id:'BLOB', result: 1 });
                    else client.Send('RES', { id: 'BLOB', result: 0 });
                }
                else client.Send('ERR', { id: 'BLOB', result: 'Server does not handle the BLOB hook.' });
                return;
            }

            const { kind, data }: { kind: CoreMessageKind; data: MessageDataObj } = JSON.parse(req.toString(), MapReviver);
            const client_id = client.id;

            //if the socio security instance exists and either sql or/and prop was recieved and they are to be decrypted, then do so here
            //this assumes that the incoming message doesnt have both sql and prop in data at the same time.
            if (this.#secure.socio_security && ((data?.sql && this.#secure.decrypt_sql) || (data?.prop && this.#secure.decrypt_prop))) {
                let str: string = (data?.sql ? data.sql : data?.prop) || '', markers:string[]|undefined;

                //check crypt format "[iv_base64] [encrypted_text_base64] [auth_tag_base64]" where each part is base64 encoded
                if (!str.includes(' '))
                    throw new E('encrypted query string does not contain a space, therefor is not of format "iv_base64 original_query_base64 auth_tag_base64" and cannot be processed. [#enc-wrong-format]', { client_id, kind, data });

                const parts = str.split(' '); 
                if (parts.length != 3)
                    throw new E('the cipher text does not contain exactly 3 space seperated parts, therefor is invalid. [#cipher-text-invalid-format]', parts);

                //decrypt
                str = this.#secure.socio_security.DecryptString(parts[0], parts[1], parts[2]);
                str = this.#secure.socio_security.RemoveRandInts(str);
                ;({ str, markers } = SocioStringParse(str));
                
                //assign it back like nothing happened
                if(data?.sql) data.sql = str; 
                else data.prop = str;

                //perform marker checks
                // if (!markers?.includes('socio')) //secured sql queries must end with the marker, to validate that they havent been tampered with and are not giberish.
                //     throw new E('Decrypted string does not end with the --socio marker, therefor is invalid. [#marker-issue]', client_id, kind, data, markers);

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
                            throw new E(`Client ${client_id} tried to execute a perms query without having the required permissions. [#perm-issue]`, {verb, tables});
                    }else if (data?.prop) throw new E('Perm checking for server props is currently unsupported! #[unsupported-feature]', {data, markers})
                }
            }
            
            this.HandleInfo(`recv: ${kind} from ${client_id}`, kind != 'UP_FILES' ? data : true);

            //let the developer handle the msg
            if (this.#lifecycle_hooks.msg)
                if(await this.#lifecycle_hooks.msg(client, kind, data))
                    return;

            switch (kind) {
                case 'SUB':
                    if (this.#lifecycle_hooks.sub)
                        if (await this.#lifecycle_hooks.sub(client, kind, data))
                            return;

                    if (QueryIsSelect(data.sql || '')) {
                        //set up hook
                        const tables = ParseQueryTables(data.sql || '');
                        if (tables)
                            client.RegisterHook(tables, data.id as id, data.sql as string, data.params || null, data?.rate_limit || null);

                        //send response
                        client.Send('UPD', {
                            id: data.id,
                            result: await this.Query(client, data.id || 0, data.sql || '', data.params),
                            status: 'success'
                        });
                    } else
                        //send response
                        client.Send('ERR', {
                            id: data.id,
                            result: 'Only SELECT queries may be subscribed to! [#reg-not-select]',
                            status:'error'
                        });

                    break;
                case 'UNSUB':
                    if (this.#lifecycle_hooks.unsub)
                        if (await this.#lifecycle_hooks.unsub(client, kind, data))
                            return;

                    client.Send('RES', { id: data.id, result: client.UnRegisterHook(data?.unreg_id || '') });
                    break;
                case 'SQL':
                    //have to do the query in every case
                    const res = this.Query(client, data.id || 0, data.sql || '', data.params);
                    client.Send('RES', { id: data.id, result: await res }); //wait for result and send it back

                    //if the sql wasnt a SELECT, but altered some resource, then need to propogate that to other connection hooks
                    if (!QueryIsSelect(data.sql || ''))
                        this.Update(ParseQueryTables(data?.sql || ''));
                    
                    break;
                case 'PING': 
                    client.Send('PONG', { id: data?.id }); 
                    break;
                case 'AUTH'://client requests to authenticate itself with the server
                    if (client.authenticated) //check if already has auth
                        client.Send('AUTH', { id: data.id, result: 1 });
                    else if (this.#lifecycle_hooks.auth){
                        const res = await client.Authenticate(this.#lifecycle_hooks.auth, data.params) //bcs its a private class field, give this function the hook to call and params to it. It will set its field and give back the result. NOTE this is safer than adding a setter to a private field
                        client.Send('AUTH', { id: data.id, result: res == true ? 1 : 0 }) //authenticated can be any truthy or falsy value, but the client will only receive a boolean, so its safe to set this to like an ID or token or smth for your own use
                    }else{
                        this.HandleError('AUTH function hook not registered, so client not authenticated. [#no-auth-func]')
                        client.Send('AUTH', { id: data.id, result: 0 })
                    }
                    break;
                case 'GET_PERM':
                    if (client.HasPermFor(data?.verb, data?.table))//check if already has the perm
                        client.Send('GET_PERM', { id: data.id, result: 1 });
                    else if (this.#lifecycle_hooks.grant_perm) {//otherwise try to grant the perm
                        const granted:boolean = await this.#lifecycle_hooks.grant_perm(client, data);
                        client.Send('GET_PERM', { id: data.id, result: granted === true ? 1 : 0 }) //the client will only receive a boolean, but still make sure to only return bools as well
                    }
                    else {
                        this.HandleError('grant_perm function hook not registered, so client not granted perm. [#no-grant_perm-func]')
                        client.Send('GET_PERM', { id: data.id, result: 0 })
                    }
                    break;
                case 'PROP_SUB':
                    this.#CheckPropExists(data?.prop, client, data.id as id, 'Prop key does not exist on the backend! [#prop-reg-not-found]')
                    
                    if (this.#lifecycle_hooks.sub)
                        if (await this.#lifecycle_hooks.sub(client, kind, data))
                            return;
                    
                    //set up hook
                    this.#props.get(data.prop as PropKey)?.updates.set(client_id, { id: data.id as id, rate_limiter: data?.rate_limit ? new RateLimiter(data.rate_limit) : null })

                    //send response
                    client.Send('PROP_UPD', {
                        id: data.id,
                        prop: data.prop,
                        result: this.GetPropVal(data.prop as PropKey)
                    })
                    break;
                case 'PROP_UNSUB':
                    this.#CheckPropExists(data?.prop, client, data?.id as id, 'Prop key does not exist on the backend! [#prop-reg-not-found]')
                    
                    if (this.#lifecycle_hooks.unsub)
                        if (await this.#lifecycle_hooks.unsub(client, kind, data))
                            return;

                    //remove hook
                    try{
                        client.Send('RES', {
                            id: data?.id,
                            result: this.#props.get(data.prop as PropKey)?.updates.delete(client_id) ? 1 : 0
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
                        //UpdatePropVal does not set the new val, rather it calls the assigner, which is responsible for setting the new value.
                        this.UpdatePropVal(data.prop as string, data?.prop_val, client.id);
                        client.Send('RES', { id: data.id, result:1}); //resolve this request to true, so the client knows everything went fine.
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
                    if (this.#lifecycle_hooks.serv)
                        await this.#lifecycle_hooks.serv(client, data);
                    else throw new E('Client sent generic data to the server, but the hook for it is not registed. [#no-serv-hook]', client_id);
                    break;
                case 'ADMIN':
                    if(this.#lifecycle_hooks.admin)
                        if (await this.#lifecycle_hooks.admin(client, data)) //you get the client, which has its ID, ipAddr and last_seen fields, that can be used to verify access. Also data should contain some secret key, but thats up to you
                            client.Send('RES', { id: data?.id, result: await this.#Admin(((data as unknown) as AdminMessageDataObj)?.function, ((data as unknown) as AdminMessageDataObj)?.args) });
                        else throw new E('A non Admin send an Admin message, but was not executed.', kind, data, client_id);
                    break;
                case 'RECON': //client attempts to reconnect to its previous session
                    if(!this.#secure){
                        client.Send('ERR', { id: data.id, result: 'Cannot reconnect on this server configuration!', status: 0 });
                        throw new E(`RECON requires SocioServer to be set up with the Secure class! [#recon-needs-secure]`, {kind, data});
                    }

                    if (data?.data?.type == 'GET'){
                        //@ts-expect-error
                        const token = this.#secure.socio_security.EncryptString([this.#secure.socio_security?.GenRandInt(100_000, 1_000_000), client.ipAddr, client.id, (new Date()).getTime(), this.#secure.socio_security?.GenRandInt(100_000, 1_000_000)].join(' ')); //creates string in the format "[iv_base64] [encrypted_text_base64] [auth_tag_base64]" where encrypted_text_base64 is a token of format "[rand] [ip] [client_id] [ms_since_epoch] [rand]"
                        this.#tokens.add(token);
                        client.Send('RES', { id: data.id, result: token, status: 1 }); //send the token to the client for one-time use to reconnect to their established client session
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

                        const [r1, ip, old_c_id, time_stamp, r2] = token.split(' '); //decrypted payload parts
                        //safety check race conditions
                        if (!(r1 && ip && old_c_id && time_stamp && r2)){
                            client.Send('RECON', { id: data.id, result: 'Invalid token format', status: 0 });
                            return;
                        }
                        if (client.ipAddr !== ip) {
                            client.Send('RECON', { id: data.id, result: 'IP address changed between reconnect', status: 0 });
                            return;
                        }
                        else if ((new Date()).getTime() - parseInt(time_stamp) > this.recon_ttl_ms){
                            client.Send('RECON', { id: data.id, result: 'Token has expired', status: 0 });
                            return;
                        }
                        else if (!(this.#sessions.has(old_c_id))) {
                            client.Send('RECON', { id: data.id, result: 'Old session ID was not found', status: 0 });
                            return;
                        }

                        //recon procedure
                        const old_client = this.#sessions.get(old_c_id) as SocioSession;
                        old_client.Restore();//stop the old session deletion, since a reconnect was actually attempted
                        client.CopySessionFrom(old_client);

                        //clear the subscriptions on the sockets, since the new instance will define new ones on the new page. Also to avoid ID conflicts
                        this.#ClearClientSessionSubs(old_c_id);
                        this.#ClearClientSessionSubs(client.id);

                        //delete old session for good
                        old_client.Destroy(() => {
                            this.#sessions.delete(old_c_id);
                        }, this.session_delete_delay_ms);

                        //notify the client 
                        client.Send('RECON', { id: data.id, result: { old_client_id: old_c_id, auth: client.authenticated }, status: 1 });
                        this.HandleInfo(`RECON ${old_c_id} -> ${client.id} (old client ID -> new/current client ID)`);
                    }
                    break;
                case 'UP_FILES':
                    if (this.#lifecycle_hooks?.file_upload)
                        client.Send('RES', { id: data.id, result: await this.#lifecycle_hooks.file_upload(client, data?.files, data?.data) ? 1 : 0 });
                    else{
                        this.HandleError('file_upload hook not registered. [#no-file_upload-hook]');
                        client.Send('RES', { id: data.id, result: 0 });
                    }
                    break;
                case 'GET_FILES':
                    if (this.#lifecycle_hooks?.file_download){
                        const response = await this.#lifecycle_hooks.file_download(client, data?.data) as FS_Util_Response;
                        if (!response?.result)
                            this.HandleError(new E('file_download hook returned unsuccessful result.', response?.error));
                        client.Send('RECV_FILES', { id: data.id, files: response.files, result: response.result });
                    }
                    else {
                        this.HandleError('file_download hook not registered. [#no-file_download-hook]');
                        client.Send('RES', { id: data.id, result: 0 });
                    }
                    break;
                // case '': break;
                default: throw new E(`Unrecognized message kind! [#unknown-msg-kind]`, {kind, data});
            }
        } catch (e: err) { this.HandleError(e); }
    }

    async Update(tables:string[]=[]){
        if(!tables.length) return;
        
        //rate limit check
        if(this.#ratelimits.upd)
            if(this.#ratelimits.upd.CheckLimit())
                return;

        //hand off to hook
        if (this.#lifecycle_hooks.upd)
            if (await this.#lifecycle_hooks.upd(this.#sessions, tables))
                return;

        //or go through each session's every hook and query the DB for its result, then send it to the client
        try{
            for (const client of this.#sessions.values()){
                client.GetHooksForTables(tables).forEach(hook => { //for each hook. GetHooksForTables always returns array. If empty, then the foreach wont run, so each sql guaranteed to have hooks array
                    //rate limit check
                    if (hook?.rate_limiter && hook.rate_limiter.CheckLimit()) return;

                    this.Query(client, hook.id, hook.sql, hook.params)
                        .then(res => client.Send('UPD', {
                            id: hook.id,
                            result: res,
                            status: 'success'
                        }))
                        .catch(err => client.Send('UPD', {
                            id: hook.id,
                            result: err,
                            status: 'error'
                        }));
                });
            }
        } catch (e:err) { this.HandleError(e) }
    }

    #CheckPropExists(prop: PropKey | undefined, client: SocioSession, msg_id:id, error_msg: string){
        if (!prop || !(this.#props.has(prop))){
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
            else throw new E(`Lifecycle hook [${f_name}] does not exist! Settable: ${this.LifecycleHookNames}`);
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

    GetClientSession(client_id=''){
        return this.#sessions.get(client_id);
    }

    //assigner defaults to basic setter
    RegisterProp(key: PropKey, val: PropValue, assigner: PropAssigner = (key: PropKey, new_val: PropValue) => this.SetPropVal(key, new_val)){
        try{
            if (this.#props.has(key))
                throw new E(`Prop key [${key}] has already been registered and for client continuity is forbiden to over-write at runtime. [#prop-key-exists]`)
            else
                this.#props.set(key, { val, assigner, updates: new Map() });
        } catch (e: err) { this.HandleError(e) }
    }
    UnRegisterProp(key: PropKey){
        try {
            //TODO more graceful unregister, bcs the clients dont know about this, and their queries will just fail, which is needless traffic.
            if (!this.#props.delete(key))
                throw new E(`Prop key [${key}] hasnt been registered. [#prop-key-not-exists]`);
        } catch (e: err) { this.HandleError(e) }
    }
    GetPropVal(key: PropKey){
        return this.#props.get(key)?.val;
    }
    //UpdatePropVal does not set the new val, rather it calls the assigner, which is responsible for setting the new value.
    UpdatePropVal(key: PropKey, new_val: PropValue, client_id: id | null):void{//this will propogate the change, if it is assigned, to all subscriptions
        const prop = this.#props.get(key);
        if (!prop) throw new E(`Prop key [${key}] not registered! [#prop-update-not-found]`);

        if (prop?.assigner(key, new_val)) {//if the prop was passed and the value was set successfully, then update all the subscriptions
            for (const [client_id, args] of prop.updates.entries()) {
                if (args?.rate_limiter && args.rate_limiter?.CheckLimit()) return; //ratelimit check

                //do the thing
                if (this.#sessions.has(client_id))
                    this.#sessions.get(client_id)?.Send('PROP_UPD', { id: args.id, prop: key, prop_val: this.GetPropVal(key) }); //should be GetPropVal, bcs i cant know how the assigner changed the val
                else {//the client_id doesnt exist anymore for some reason, so unsubscribe
                    prop.updates.delete(client_id);
                    this.#sessions.delete(client_id);
                }
            }
        }
        else
            throw new E(`Tried to set an invalid prop value! [#prop-set-not-valid].`, { key, new_val, client_id });
    }
    SetPropVal(key: PropKey, new_val: PropValue): boolean { //this hard sets the value without checks or updating clients
        try{
            if (this.#props.has(key)) //@ts-expect-error
                this.#props.get(key).val = new_val;
            else throw new E(`Prop key [${key}] not registered! [#prop-set-not-found]`);
            return true;
        } catch (e: err) { this.HandleError(e); return false; }
    }

    //send some data to all clients by their ID. By default emits to all connected clients
    SendToClients(client_ids: string[] = [], data: object = {}, kind: ClientMessageKind = 'CMD'){
        if(!client_ids.length)
            for (const s of this.#sessions.values())
                s.Send(kind, data);
        else
            client_ids.forEach(c_id => this.#sessions.get(c_id)?.Send(kind, data));
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

    #ClearClientSessionSubs(client_id:string){
        this.#sessions.get(client_id)?.ClearHooks(); //clear query subs
        for (const prop of this.#props.values()) { prop.updates.delete(client_id); }; //clear prop subs
    }
}