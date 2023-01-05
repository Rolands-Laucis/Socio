//Nullum magnum ingenium sine mixture dementia fuit. - There has been no great wisdom without an element of madness.

//libs
import { WebSocketServer, ServerOptions, WebSocket } from 'ws'; //https://github.com/websockets/ws https://github.com/websockets/ws/blob/master/doc/ws.md
import { IncomingMessage } from 'http'

//mine
import { log, soft_error, error, info, setPrefix, setShowTime } from '@rolands/log'; setPrefix('SocioServer'); setShowTime(false); //for my logger
import { QueryIsSelect, ParseQueryTables, SocioArgsParse, SocioArgHas, ParseQueryVerb, sleep } from './utils.js'
import { E, LogHandler, err } from './logging.js'
import { UUID, SocioSecurity } from './secure.js'
import { SocioSession } from './core-session.js'

//NB! some fields in these variables are private for safety reasons, but also bcs u shouldnt be altering them, only if through my defined ways. They are mostly expected to be constants.
//whereas public variables are free for you to alter freely at any time during runtime.

//types
import { id, PropKey, PropValue, PropAssigner, CoreMessageKind } from './types.js'
export type MessageDataObj = { id?: id, sql?: string, params?: object | null, verb?: string, table?: string, unreg_id?: id, prop?: string, prop_val:PropValue, data?:any };
export type QueryFuncParams = { id?: id, sql: string, params?: object | null };
export type QueryFunction = (obj: QueryFuncParams | MessageDataObj) => Promise<object>;
type QueryObject = { id: id, params: object | null, session: SocioSession }; //for grouping hooks

export class SocioServer extends LogHandler {
    // private:
    #wss: WebSocketServer;
    #sessions: { [key: string]: SocioSession } = {}; //client_id:SocioSession
    #secure: SocioSecurity | null;  //if constructor is given a SocioSecure object, then that will be used to decrypt all incomming messages
    #props: { [key: PropKey]: { val: PropValue, assigner: PropAssigner, updates:{[client_id:string]: id} } } = {}; //backend props, e.g. strings for colors, that clients can subscribe to and alter

    #lifecycle_hooks: { [key: string]: Function | null; } = { con: null, discon: null, msg: null, upd: null, auth: null, gen_client_id:null, grant_perm:null, serv:null } //call the register function to hook on these. They will be called if they exist
    //msg hook receives all incomming msgs to the server. If the hook returns a truthy value, then it is assumed, that the hook handled the msg and the lib will not. Otherwise, by default, the lib handles the msg.
    //upd works the same as msg, but for everytime updates need to be propogated to all the sockets.
    //auth func can return any truthy or falsy value, the client will only receive a boolean, so its safe to set it to some credential or id or smth, as this would be accessible and useful to you when checking the session access to tables.
    //the grant_perm funtion is for validating that the user has access to whatever tables or resources the sql is working with. A client will ask for permission to a verb (SELECT, INSERT...) and table(s). If you grant access, then the server will persist it for the entire connection.

    //public:
    Query: QueryFunction; //you can change this at any time

    constructor(opts: ServerOptions | undefined = {}, DB_query_function: QueryFunction, { secure = null, verbose = true, hard_crash=false }: {secure?:SocioSecurity|null, verbose?:boolean, hard_crash?:boolean} = {}){
        super(info, soft_error, {verbose, hard_crash});
        //verbose - print stuff to the console using my lib. Doesnt affect the log handlers
        //hard_crash will just crash the class instance and propogate (throw) the error encountered without logging it anywhere - up to you to handle.
        //both are public and settable at runtime

        //private:
        this.#wss = new WebSocketServer({ ...opts, clientTracking: true }); //take a look at the WebSocketServer docs - the opts can have a server param, that can be your http server
        this.#secure = secure

        //public:
        this.Query = DB_query_function

        this.#wss.on('connection', this.#Connect.bind(this)); //https://thenewstack.io/mastering-javascript-callbacks-bind-apply-call/ have to bind 'this' to the function, otherwise it will use the .on()'s 'this', so that this.[prop] are not undefined
        this.#wss.on('close', (...stuff) => { this.HandleInfo('WebSocketServer close event', ...stuff) });
        this.#wss.on('error', (...stuff) => { this.HandleError(new E('WebSocketServer error event', ...stuff))});
    }

    #Connect(conn: WebSocket, req: IncomingMessage){
        try{
            //construct the new session with a unique client ID
            let client_id: string = (this.#lifecycle_hooks.gen_client_id ? this.#lifecycle_hooks.gen_client_id() : UUID())?.toString()
            while (client_id in this.#sessions) //avoid id collisions
                client_id = (this.#lifecycle_hooks.gen_client_id ? this.#lifecycle_hooks.gen_client_id() : UUID())?.toString()

            //create the socio session class and save down the client id ref for convenience later
            const client = new SocioSession(client_id, conn, { verbose: this.verbose })
            this.#sessions[client_id] = client

            //pass the object to the connection hook, if it exists
            if (this.#lifecycle_hooks.con)
                this.#lifecycle_hooks.con(client, client_id, req)

            //notify the client of their ID
            client.Send('CON', client_id);
            this.HandleInfo('CON', client_id) //, this.#wss.clients

            //set this client websockets event handlers
            conn.on('message', (req: Buffer | ArrayBuffer | Buffer[], isBinary: Boolean) => this.#Message.bind(this)(client, req, isBinary));
            conn.on('close', () => {
                //trigger hook
                if (this.#lifecycle_hooks.discon)
                    this.#lifecycle_hooks.discon(client)

                //delete the connection object
                delete this.#sessions[client_id] //cant delete private properties, even if this is a key in an obj. IDK js, wtf... Could assign to new dup object without this key, but ehhh
                
                this.HandleInfo('DISCON', client_id)
            });
        } catch (e: err) { this.HandleError(e); }
    }

    async #Message(client:SocioSession, req: Buffer | ArrayBuffer | Buffer[], isBinary: Boolean){
        try{
            const { kind, data }: { kind: CoreMessageKind; data: MessageDataObj } = JSON.parse(req.toString());
            const client_id = client.id;
            if (this.#secure && data?.sql) {//if this is supposed to be secure and sql was received, then decrypt it before continuing
                if(!data.sql.includes(' ')) //format check
                    throw new E('encrypted query string does not contain a space, therefor is not of format "iv_base64 original_query_base64" and cannot be processed. [#enc-wrong-format]', client_id, kind, data);

                const parts = data.sql.split(' '); // format - "iv_base64 original_query_base64". IV is not secret, just to scramble the output
                if(parts.length != 3)
                    throw new E('the cipher text does not contain exactly 3 space seperated parts, therefor is invalid. [#cipher-text-invalid-format]', parts)
                
                data.sql = this.#secure.DecryptString(parts[0], parts[1], parts[2])
                const socio_args = SocioArgsParse(data.sql) //speed optimization

                if (!SocioArgHas('socio', { parsed: socio_args })) //secured sql queries must end with the marker, to validate that they havent been tampered with and are not giberish.
                    throw new E('Decrypted sql string does not end with the --socio marker, therefor is invalid. [#marker-issue]', client_id, kind, data, socio_args);

                if (SocioArgHas('auth', { parsed: socio_args }))//query requiers auth to execute
                    if(!client.authenticated)
                        throw new E (`Client ${client_id} tried to execute an auth query without being authenticated. [#auth-issue]`);
                
                if (SocioArgHas('perm', { parsed: socio_args })) {//query requiers perm to execute
                    const verb = ParseQueryVerb(data.sql);
                    if(!verb)
                        throw new E (`Client ${client_id} sent an unrecognized SQL query first clause. [#verb-issue]`, data.sql);
                    
                    const tables = ParseQueryTables(data.sql);
                    if (!tables)
                        throw new E (`Client ${client_id} sent an SQL query without table names. [#table-name-issue]`, data.sql);
                    
                    if (!tables.every((t) => client.HasPermFor(verb, t)))
                        throw new E (`Client ${client_id} tried to execute a perms query without having the required permissions. [#perm-issue]`, verb, tables);
                }
            }
            this.HandleInfo(`recv ${kind} from ${client_id}`, data);
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
                            client.RegisterHook(tables, data.id as id, data.sql as string, data.params || null);

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
                    if(this.#lifecycle_hooks?.grant_perm){
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
                    this.#props[data.prop as PropKey].updates[client_id] = data.id as id

                    //send response
                    client.Send('PROP_UPD', {
                        id: data.id,
                        prop: data.prop,
                        result: this.GetPropVal(data.prop as PropKey)
                    })
                    break;
                case 'PROP_UNREG':
                    this.#CheckPropExists(data?.prop, client, data.id as id, 'Prop key does not exist on the backend! [#prop-reg-not-found]')
                    //remove hook
                    try{
                        delete this.#props[data.prop as string].updates[client_id]

                        //send response
                        client.Send('RES', {
                            id: data.id,
                            result: true
                        });
                    } catch (e: err) {
                        //send response
                        client.Send('ERR', {
                            id: data.id,
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
                        this.UpdatePropVal(data.prop as string, data?.prop_val, client);
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
                // case '': break;
                default: throw new E(`Unrecognized message kind! [#unknown-msg-kind]`, kind, data);
            }
        } catch (e: err) { this.HandleError(e); }
    }

    Update(tables:string[]=[]){
        if (this.#lifecycle_hooks.upd)
            if (this.#lifecycle_hooks.upd(this.#sessions, tables))
                return;

        try{
            //gather all sessions hooks sql queries that involve the altered tables
            const queries: { [key: string]: QueryObject[]} = {}
            Object.values(this.#sessions).forEach(s => {
                s.GetHooksForTables(tables).forEach(h => { //GetHooksQueriesForTables always returns array. If empty, then the foreach wont run, so each sql guaranteed to have hooks array
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

    RegisterLifecycleHookHandler(name='', handler:Function|null=null){
        try{
            if (name in this.#lifecycle_hooks)
                this.#lifecycle_hooks[name] = handler
            else throw new E(`Lifecycle hook [${name}] does not exist!`)
        } catch (e:err) { this.HandleError(e) }
    }
    UnRegisterLifecycleHookHandler(name = '') {
        try{
            if (name in this.#lifecycle_hooks)
                this.#lifecycle_hooks[name] = null;
            else throw new E(`Lifecycle hook [${name}] does not exist!`)
        } catch (e:err) { this.HandleError(e) }
    }
    get LifecycleHookNames(){
        return Object.keys(this.#lifecycle_hooks)
    }

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
    UpdatePropVal(key: PropKey, new_val: PropValue, client: SocioSession):void{//this will propogate the change, if it is assigned, to all subscriptions
        if(key in this.#props){
            if (this.#props[key].assigner(key, new_val)) {//if the prop was passed and the value was set successfully, then update all the subscriptions
                Object.entries(this.#props[key].updates).forEach(([client_id, id]) => {
                    if (client_id in this.#sessions)
                        this.#sessions[client_id].Send('PROP_UPD', { id: id, prop: key, result: this.GetPropVal(key) }); //should be GetPropVal, bcs i cant know how the assigner changed the val
                    else {//the client_id doesnt exist anymore for some reason, so unsubscribe
                        delete this.#props[key].updates[client_id];
                        delete this.#sessions[client_id];
                    } 
                        
                });
            } 
            else
                throw new E(`Prop key [${key}] tried to set an invalid value! [#prop-set-not-valid]. Key, val, client_id`, key, new_val, client.id);
        }else
            throw new E(`Prop key [${key}] not registered! [#prop-set-not-found]`);
    }
    SetPropVal(key: PropKey, new_val: PropValue): boolean { //this hard sets the value without checks or updating clients
        try{
            this.#props[key].val = new_val;
            return true;
        } catch (e: err) { this.HandleError(e); return false; }
    }

    // Emit(data = {}) {
    //     switch (true) {
    //         case data instanceof Blob: this.#wss.emit(data); break;
    //         // case data instanceof Object || data instanceof Array: this.#wss.emit(JSON.stringify({ kind: 'EMIT', data: data })); break;
    //         // case data instanceof Blob: this.#wss.emit(data); break;
    //         default: this.#wss.emit(JSON.stringify({ kind: 'EMIT', data: data })); break;
    //     }
    // }
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

//@ts-ignore
// Set.prototype.Find = (predicate: (ws:WebSocket) => boolean):WebSocket | undefined => {
//     if(this)
//         for(const ws of this)
//             if(predicate(ws))
//                 return ws;
//     return undefined
// }