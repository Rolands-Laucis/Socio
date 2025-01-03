//There has been no great wisdom without an element of madness. /Aristotle/
//And thus i present - Socio.

//libs
import { WebSocketServer } from 'ws'; //https://github.com/websockets/ws https://github.com/websockets/ws/blob/master/doc/ws.md
import * as diff_lib from 'recursive-diff'; //https://www.npmjs.com/package/recursive-diff

//mine
import { QueryIsSelect, ParseQueryTables, ParseQueryVerb } from './sql-parsing.js';
import { SocioStringParse, GetAllMethodNamesOf, yaml_parse, initLifecycleHooks } from './utils.js';
import { E, LogHandler, err, log, info, done, ErrorOrigin } from './logging.js';
import { UUID, type SocioSecurity } from './secure.js';
import { SocioSession, type SubObj } from './core-session.js';
import { RateLimiter } from './ratelimit.js';
import { ServerMessageKind, ClientMessageKind } from './utils.js';

//types
import type { ServerOptions, WebSocket, AddressInfo } from 'ws';
import type { IncomingMessage } from 'http';

// cross network data objects
// server data msg
import type { data_base, S_SUB_data, ServerMessageDataObj, S_UNSUB_data, S_SQL_data, S_AUTH_data, S_GET_PERM_data, S_PROP_SUB_data, S_PROP_UNSUB_data, S_PROP_GET_data, S_PROP_SET_data, S_PROP_REG_data, S_RECON_GET_data, S_RECON_USE_data, S_UP_FILES_data, S_GET_FILES_data, S_RPC_data } from './types.d.ts';
// client data msg
import type { C_RES_data, C_CON_data, C_UPD_data, C_AUTH_data, C_GET_PERM_data, C_PROP_UPD_data, C_RECON_Data, C_RECV_FILES_Data } from './types.d.ts'; //types over network for the data object

import type { id, PropKey, PropValue, PropAssigner, PropOpts, ClientID, FS_Util_Response, ServerLifecycleHooks, LoggingOpts, Bit, SessionOpts, data_result_block, ServerHookDefinitions } from './types.d.ts';
import type { RateLimit } from './ratelimit.js';
import type { SocioStringObj } from './sql-parsing.js';
export type QueryFuncParams = { id?: id, sql: string, params?: any };
export type QueryFunction = (client: SocioSession, id: id, sql: string, params?: any) => Promise<object>;

type SessionsDefaults = { 
    timeouts: boolean, 
    timeouts_check_interval_ms?: number, 
    session_delete_delay_ms?: number, 
    recon_ttl_ms?: number 
} & SessionOpts;
type DecryptOptions = { decrypt_sql: boolean, decrypt_prop: boolean, decrypt_endpoint: boolean };
type DBOpts = { 
    Query?: QueryFunction, 
    Arbiter?: (initiator: { client: SocioSession, sql: string, params: any }, current: { client: SocioSession, hook: SubObj }) => boolean | Promise<boolean>, 
    allowed_SQL_verbs?: string[] 
};
type SocioServerOptions = { 
    db: DBOpts, 
    socio_security?: SocioSecurity | null, 
    decrypt_opts?: DecryptOptions,
    allow_discovery?: boolean,
    allow_rpc?:boolean,
    hard_crash?: boolean, 
    session_defaults?: SessionsDefaults, 
    prop_upd_diff?: boolean, 
    auto_recon_by_ip?: boolean, 
    send_sensitive_error_msgs_to_client?:boolean,
    hooks?: Partial<ServerLifecycleHooks> 
    [key:string]:any 
} & LoggingOpts;
type AdminServerMessageDataObj = {function:string, args?:any[], secure_key:string};


//NB! some fields in these variables are private for safety reasons, but also bcs u shouldnt be altering them, only if through my defined ways. They are mostly expected to be constants.
//whereas public variables are free for you to alter freely at any time during runtime.
export class SocioServer extends LogHandler {
    //---private:
    #wss: WebSocketServer;
    #sessions: Map<ClientID, SocioSession> = new Map(); //Maps are quite more performant than objects. And their keys dont overlap with Object prototype.

    //if constructor is given a SocioSecure object, then that will be used to decrypt all incomming messages, if the msg flag is set
    #secure: { socio_security: SocioSecurity | null, allow_discovery: boolean, allow_rpc:boolean } & DecryptOptions;
    #cypther_text_cache: Map<string, SocioStringObj> = new Map(); //decyphering at runtime is costly, so cache validated, secure results.

    //backend props, e.g. strings for colors, that clients can subscribe to and alter
    #props: Map<PropKey, { val: PropValue, assigner: PropAssigner, updates: Map<ClientID, { id: id, rate_limiter?: RateLimiter }> } & PropOpts> = new Map();

    //rate limits server functions globally
    #ratelimits: { [key: string]: RateLimiter | null } = { con: null, upd:null};

    //If the hook returns a truthy value, then it is assumed, that the hook handled the msg and the lib will not. Otherwise, by default, the lib handles the msg.
    //msg hook receives all incomming msgs to the server. 
    //upd works the same as msg, but for every time that updates need to be propogated to all the sockets.
    //auth func has to return only a boolean
    //the grant_perm funtion is for validating that the user has access to whatever tables or resources the sql is working with. A client will ask for permission to a verb (SELECT, INSERT...) and table(s). If you grant access, then the server will persist it for the entire connection.
    //the admin function will be called, when a socket attempts to use an ADMIN msg kind. It receives the SocioSession instance, that has id, ip and last seen fields you can use. Also the data it sent, so u can check your own secure key or smth. Return truthy to allow access

    //stores active reconnection tokens
    #tokens: Set<string> = new Set();

    //global flag to send prop obj diffs using the diff lib instead of the full object every time.
    #prop_upd_diff = false;

    #global_largest_id: number = 0;
    #client_queries: Map<id, { for_msg_kind: ServerMessageKind, resolve: (value: any | PromiseLike<any>) => void }> = new Map();

    //---public:
    db!: DBOpts;
    session_defaults: SessionsDefaults = { timeouts: false, timeouts_check_interval_ms: 1000 * 60, session_timeout_ttl_ms: Infinity, session_delete_delay_ms: 1000 * 5, recon_ttl_ms: 1000 * 60 * 60 };
    lifecycle_hooks!: ServerLifecycleHooks; //Add your callback to a valid hook key here. They will be called if they exist
    prop_reg_timeout_ms!: number;
    auto_recon_by_ip:boolean = false;
    send_sensitive_error_msgs_to_client!:boolean;
    allow_rpc!:boolean;

    constructor(opts: ServerOptions | undefined = {}, { 
            db, 
            socio_security = null, 
            allow_discovery = false, 
            allow_rpc = false,
            logging = { verbose: false, hard_crash: false }, 
            decrypt_opts = { decrypt_sql: true, decrypt_prop: false, decrypt_endpoint: false }, 
            session_defaults = undefined, 
            prop_upd_diff = false, 
            prop_reg_timeout_ms = 1000 * 10, 
            auto_recon_by_ip = false, 
            send_sensitive_error_msgs_to_client = true,
            hooks = {},
         }: SocioServerOptions){
        super({ ...logging, prefix:'SocioServer'});
        //verbose - print stuff to the console using my lib. Doesnt affect the log handlers
        //hard_crash will just crash the class instance and propogate (throw) the error encountered without logging it anywhere - up to you to handle.
        //both are public and settable at runtime
        
        //private:
        this.#wss = new WebSocketServer({ ...opts, clientTracking: true }); //take a look at the WebSocketServer docs - the opts can have a server param, that can be your http server
        this.#secure = { socio_security, ...decrypt_opts, allow_discovery, allow_rpc };
        this.#prop_upd_diff = prop_upd_diff;
        this.lifecycle_hooks = { ...initLifecycleHooks<ServerLifecycleHooks>(), ...hooks };

        //public:
        if (!db.hasOwnProperty('allowed_SQL_verbs')) db.allowed_SQL_verbs = ['SELECT', 'INSERT', 'UPDATE']; //add in defaults for DB, since cant seem to do it in the constructor args
        this.db = db;
        this.session_defaults = Object.assign(this.session_defaults, session_defaults);
        this.prop_reg_timeout_ms = prop_reg_timeout_ms;
        this.auto_recon_by_ip = auto_recon_by_ip;
        this.send_sensitive_error_msgs_to_client = send_sensitive_error_msgs_to_client;

        this.#wss.on('connection', this.#Connect.bind(this)); //https://thenewstack.io/mastering-javascript-callbacks-bind-apply-call/ have to bind 'this' to the function, otherwise it will use the .on()'s 'this', so that this.[prop] are not undefined
        this.#wss.on('close', (...stuff) => { this.HandleInfo('WebSocketServer close event', ...stuff) });
        this.#wss.on('error', (...stuff) => { this.HandleError(new E('WebSocketServer error event', ...stuff))});

        //set up interval timer to check if sessions are timed out.
        if (this.session_defaults.timeouts)
            setInterval(this.#CheckSessionsTimeouts.bind(this), this.session_defaults.timeouts_check_interval_ms);

        // log info for the dev
        if (this.verbose){
            const addr: AddressInfo = this.#wss.address() as AddressInfo;
            this.done(`Created SocioServer on`, addr);
            if (addr.family == 'ws')
                this.HandleInfo('WARNING! Your server is using an unsecure WebSocket protocol, setup wss:// instead, when you can!');
            if (!socio_security)
                this.HandleInfo('WARNING! Please use the SocioSecurity class in production to securely de/encrypt Socio strings from clients!');
            if (this.send_sensitive_error_msgs_to_client) 
                this.HandleInfo('WARNING! send_sensitive_error_msgs_to_client field IS TRUE, which means server error messages are sent to the client as is. They might include sesitive info. If false, the server will only send a generic error message.')
        }
    }

    async #Connect(conn: WebSocket, request: IncomingMessage){
        try{
            //construct the new session with a unique client ID
            let client_id: ClientID = (this.lifecycle_hooks.gen_client_id ? await this.lifecycle_hooks.gen_client_id() : UUID())?.toString();
            while (this.#sessions.has(client_id)) //avoid id collisions
                client_id = (this.lifecycle_hooks.gen_client_id ? await this.lifecycle_hooks.gen_client_id() : UUID())?.toString();

            //get the IP. Gets either from a reverse proxy header (like if u have nginx) or just straight off the http meta
            //@ts-ignore
            const client_ip = 'x-forwarded-for' in request?.headers ? request.headers['x-forwarded-for'].split(',')[0].trim() : request.socket.remoteAddress;

            //create the socio session class and save down the client id ref for convenience later
            const client = new SocioSession(client_id, conn, client_ip, { logging: { verbose: this.verbose }, session_opts: { session_timeout_ttl_ms: this.session_defaults.session_timeout_ttl_ms, max_payload_size: this.session_defaults.max_payload_size} });
            this.#sessions.set(client_id, client);

            //pass the object to the connection hook, if it exists. It cant take over
            if (this.lifecycle_hooks.con)
                await this.lifecycle_hooks.con(client, request); //u can get the client_id and client_ip off the client object

            //set this client websockets event handlers
            // have to .bind(this), bcs this is inside a callback with its own this in the lib and bcs js closures
            conn.on('message', (req: Buffer | ArrayBuffer | Buffer[], isBinary: Boolean) => {
                if (this.#sessions.has(client_id))//@ts-expect-error
                    this.#Message.bind(this)(this.#sessions.get(client_id), req, isBinary);
                else conn?.close();
            });
            conn.on('close', (code:number, reason:Buffer) => { this.#SocketClosed.bind(this)(client, {code, reason:reason.toString('utf8')}) });
            conn.on('error', (error: Error) => { this.#SocketClosed.bind(this)(client, error) }); //https://github.com/websockets/ws/blob/master/doc/ws.md#event-error-1
        
            // socio can recognize that the IP matches an existing session, so it can reconnect to it, keeping the old sessions data
            if(this.auto_recon_by_ip){
                // find an IP matching session
                for (const [id, ses] of this.#sessions.entries()){
                    if(id !== client_id && ses.ipAddr === client_ip){
                        //recon procedure
                        const old_client = this.#sessions.get(id) as SocioSession;
                        this.ReconnectClientSession(client, old_client);
                        this.HandleInfo(`AUTO IP RECON | old id:  ${id} -> new id:  ${client.id} | IP: ${client_ip}`);
                        break;
                    }
                }
            }

            //notify the client of their ID
            client.Send(ClientMessageKind.CON, client_id as C_CON_data);
            this.HandleInfo('CON', { id: client_id, ip: client_ip }); //, this.#wss.clients
        } catch (e: err) { this.HandleError(e); }
    }

    async #SocketClosed(client:SocioSession, event_args:any){
        //trigger hook
        if (this.lifecycle_hooks.discon)
            await this.lifecycle_hooks.discon(client);

        const client_id = client.id;
        this.HandleInfo('DISCON', client_id, event_args);

        client.Destroy(() => {
            this.#ClearClientSessionSubs(client_id);
            //Update() only works on session objects, and if we delete this one, then its query subscriptions should also be gone.

            //delete the connection object and the subscriptions of this client
            this.#sessions.delete(client_id);
            this.HandleInfo('Session destroyed on disconnect.', client_id);
        }, this.session_defaults.session_delete_delay_ms as number);
    }

    get new_global_id(){return ++this.#global_largest_id}
    async #Message(client:SocioSession, req: Buffer | ArrayBuffer | Buffer[], isBinary: Boolean){
        // general try for crashes. 
        // The catch just notifies the server of the error, 
        // but the client cannot be notified, since at that time the message ID might not be known
        try{
            //handle binary data and return
            if(isBinary){
                this.HandleInfo(`recv: BLOB from ${client.id}`)
                if (this.lifecycle_hooks.blob) {
                    if (await this.lifecycle_hooks.blob(client, req))
                        client.Send(ClientMessageKind.RES, { id: 'BLOB', result: { success: 1 } } as C_RES_data);
                    else client.Send(ClientMessageKind.RES, { id: 'BLOB', result: { success: 0 } } as C_RES_data);
                }
                else client.Send(ClientMessageKind.RES, { id: 'BLOB', result: { success: 0, error: 'Server does not handle the BLOB hook.' } } as C_RES_data);
                return;
            }

            const { kind, data }: { kind: ServerMessageKind; data: ServerMessageDataObj } = yaml_parse(req.toString());
            const client_id = client.id; //cache the ID, since its used so much here
            // save the biggest ID found to avoid ID collisions when sending msgs between clients, since they all have their own ID counter
            if (typeof data.id === 'number' && data.id > this.#global_largest_id) this.#global_largest_id = data.id;

            // this try catch allows the body to freely throw E or strings or crash in any other way, 
            // and the client will still receive a RES with success:0, since now it has the message ID from data
            // it will then throw again to the outter try
            try{
                //if the socio security instance exists and some specific string fields was recieved and they are to be decrypted, then do so here
                if (this.#secure.socio_security) {
                    for (const field of ['sql', 'prop', 'endpoint'])
                        if (data[field] && this.#secure['decrypt_' + field])
                            data[field] = this.#Decrypt(client, data[field], field === 'sql');
                }

                if (kind !== ServerMessageKind.OK) //this 
                this.HandleInfo(`recv: [${ServerMessageKind[kind]}] from [${client.name ? client.name + ' | ' : ''}${client_id}]`, kind != ServerMessageKind.UP_FILES ? data : `File count: ${(data as S_UP_FILES_data).files?.size}`);

                //let the developer handle the msg
                if (this.lifecycle_hooks.msg)
                    if (await this.lifecycle_hooks.msg(client, kind, data))
                        return;

                switch (kind) {
                    case ServerMessageKind.SUB: {
                        if (this.lifecycle_hooks.sub)
                            if (await this.lifecycle_hooks.sub(client, kind, (data as S_SUB_data)))
                                return;

                        if (!this.db.Query)
                            throw new E('This action requires a Database Query function on SocioServer! [#no-db-query-SUB]', { kind, data });

                        //if the client happens to want to use an endpoint keyname instead of SQL, retrieve the SQL string from a hook call and procede with that.
                        if ((data as S_SUB_data).endpoint && !(data as S_SUB_data).sql) {
                            if (this.lifecycle_hooks.endpoint)
                                //@ts-expect-error
                                (data as S_SUB_data).sql = await this.lifecycle_hooks.endpoint(client, (data as S_SUB_data).endpoint);
                            else throw new E('Client sent endpoint instead of SQL, but its hook is missing, so cant resolve it. [#no-endpoint-hook-SUB]', {kind, data});
                        }

                        // check that there is sql to work with; the verb can be parsed; verb is allowed
                        if (!(data as S_SQL_data)?.sql) throw new E('SQL or endpoint field missing in request. [#no-sql]', { kind, data });
                        const query_verb = ParseQueryVerb((data as S_SQL_data).sql);
                        if ((data as S_SQL_data)?.sql && !query_verb) throw new E('Could not parse query verb. [#parse-verb-SUB]', { kind, data, query_verb });
                        if (query_verb && this.db?.allowed_SQL_verbs && !this.db.allowed_SQL_verbs?.includes(query_verb)) throw new E('Server doesnt allow this query verb. (case-sensitive) [#verb-not-allowed-SUB]', { kind, data, query_verb, allowed: this.db.allowed_SQL_verbs });

                        if (query_verb === 'SELECT') {
                            //set up hook
                            const tables = ParseQueryTables((data as S_SUB_data).sql || '');
                            if (tables)
                                //@ts-expect-error
                                client.RegisterSub(tables, data.id as id, (data as S_SUB_data).sql || '', (data as S_SUB_data)?.params, (data as S_SUB_data)?.rate_limit);

                            //send response
                            const res = await this.db.Query(client, data.id || 0, (data as S_SUB_data).sql || '', (data as S_SUB_data)?.params);
                            client.Send(ClientMessageKind.UPD, {
                                id: data.id,
                                result: { success: 1, res }
                            } as C_UPD_data);
                        } else throw new E('Only SELECT queries may be subscribed to! [#reg-not-select]', { kind, data });
                        break;
                    }
                    case ServerMessageKind.UNSUB: {
                        if (this.lifecycle_hooks.unsub)
                            if (await this.lifecycle_hooks.unsub(client, kind, data))
                                return;

                        client.Send(ClientMessageKind.RES, { id: data.id, result: { success: client.UnRegisterSub((data as S_UNSUB_data)?.unreg_id || '') } } as C_RES_data);
                        break;
                    }
                    case ServerMessageKind.SQL: {
                        if (!this.db.Query)
                            throw 'This action requires a Database Query function on SocioServer! [#no-db-query-SQL]';

                        //if the client happens to want to use an endpoint keyname instead of SQL, retrieve the SQL string from a hook call and procede with that.
                        if ((data as S_SQL_data)?.sql_is_endpoint && (data as S_SQL_data).sql) {
                            if (this.lifecycle_hooks.endpoint)
                                (data as S_SQL_data).sql = await this.lifecycle_hooks.endpoint(client, (data as S_SQL_data).sql);
                            else throw new E('Client sent endpoint instead of SQL, but its hook is missing. [#no-endpoint-hook-SQL]');
                        }

                        // check that there is sql to work with; the verb can be parsed; verb is allowed
                        if (!(data as S_SQL_data)?.sql) throw new E('SQL or endpoint field missing in request. [#no-sql]', { kind, data });
                        const query_verb = ParseQueryVerb((data as S_SQL_data).sql);
                        if ((data as S_SQL_data)?.sql && !query_verb) throw new E('Could not parse query verb. [#parse-verb-SUB]', { kind, data, query_verb });
                        if (query_verb && this.db?.allowed_SQL_verbs && !this.db.allowed_SQL_verbs?.includes(query_verb)) throw new E('Server doesnt allow this query verb. (case-sensitive) [#verb-not-allowed-SUB]', { kind, data, query_verb, allowed: this.db.allowed_SQL_verbs });

                        //do the query and send reply, then run the updates
                        const res = this.db.Query(client, data.id || 0, (data as S_SQL_data).sql || '', (data as S_SQL_data).params);
                        client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 1, res: await res } } as C_RES_data); //wait for result and send it back

                        //if the sql wasnt a SELECT, but altered some resource, then need to propogate that to other connection hooks
                        if (query_verb !== 'SELECT'){
                            if(query_verb === 'DROP'){
                                //to avoid problems for the dev, Socio will auto unsub all subs to the dropped table. The clients needn't be notified, since they just wont ever receive and UPD for it anymore. Which isnt an issue. 
                                const dropped_table = ParseQueryTables((data as S_SQL_data).sql);
                                if(dropped_table){
                                    for(const session of this.#sessions.values())
                                        for (const sub of session.GetSubsForTables(dropped_table))
                                            session.UnRegisterSub(sub.id);
                                }
                                else throw new E('Failed to parse table of a client DROP query', {kind, data});
                            }else
                                this.Update(client, (data as S_SQL_data).sql || '', (data as S_SQL_data)?.params);
                        }
                        break;
                    }
                    case ServerMessageKind.PING: {
                        client.Send(ClientMessageKind.PONG, { id: data?.id } as data_base);
                        break;
                    }
                    case ServerMessageKind.AUTH: {//client requests to authenticate itself with the server
                        if (client.authenticated) //check if already has auth
                            client.Send(ClientMessageKind.AUTH, { id: data.id, result: { success: 1 } } as C_AUTH_data);
                        else if (this.lifecycle_hooks.auth) {
                            const res = await client.Authenticate(this.lifecycle_hooks.auth, (data as S_AUTH_data).params); //bcs its a private class field, give this function the hook to call and params to it. It will set its field and give back the result. NOTE this is safer than adding a setter to a private field
                            client.Send(ClientMessageKind.AUTH, { id: data.id, result: { success: 1, res: res === true ? 1 : 0 } } as C_AUTH_data); //authenticated can be any truthy or falsy value, but the client will only receive a boolean, so its safe to set this to like an ID or token or smth for your own use
                        } else {
                            const error = 'AUTH function hook not registered, so client not authenticated. [#no-auth-func]';
                            this.HandleError(error);
                            client.Send(ClientMessageKind.AUTH, { id: data.id, result: { success: 0, error } } as C_AUTH_data);
                        }
                        break;
                    }
                    case ServerMessageKind.GET_PERM: {
                        if (client.HasPermFor((data as S_GET_PERM_data)?.verb, (data as S_GET_PERM_data)?.table))//check if already has the perm
                            client.Send(ClientMessageKind.GET_PERM, { id: data.id, result: { success: 1 } } as C_GET_PERM_data);
                        else if (this.lifecycle_hooks.grant_perm) {//otherwise try to grant the perm
                            const granted: boolean = await this.lifecycle_hooks.grant_perm(client, data);
                            client.Send(ClientMessageKind.GET_PERM, { id: data.id, result: granted === true ? 1 : 0 }) //the client will only receive a boolean, but still make sure to only return bools as well
                        }
                        else {
                            const error = 'grant_perm function hook not registered, so client not granted perm. [#no-grant_perm-func]';
                            this.HandleError(error);
                            client.Send(ClientMessageKind.GET_PERM, { id: data.id, result: { success: 0, error } } as C_GET_PERM_data)
                        }
                        break;
                    }
                    case ServerMessageKind.PROP_SUB: {
                        this.#CheckPropExists((data as S_PROP_SUB_data)?.prop, client, data.id, `Prop key [${(data as S_PROP_SUB_data)?.prop}] does not exist on the backend! [#prop-reg-not-found-sub]`)

                        if (this.lifecycle_hooks.sub)
                            if (await this.lifecycle_hooks.sub(client, kind, data))
                                return;

                        //set up hook
                        this.#props.get((data as S_PROP_SUB_data).prop)?.updates.set(client_id, { id: data.id as id, rate_limiter: (data as S_PROP_SUB_data)?.rate_limit ? new RateLimiter(((data as S_PROP_SUB_data).rate_limit as RateLimit)) : undefined })

                        //send response
                        if ((data as S_PROP_SUB_data)?.data?.receive_initial_update)
                            await client.Send(ClientMessageKind.PROP_UPD, {
                                id: data.id,
                                prop: (data as S_PROP_SUB_data).prop,
                                prop_val: this.GetPropVal((data as S_PROP_SUB_data).prop)
                            } as C_PROP_UPD_data);

                        // resolve the sub promise on client side
                        client.Send(ClientMessageKind.RES, {
                            id: data.id,
                            result: { success: 1 }
                        } as C_RES_data);
                        break;
                    }
                    case ServerMessageKind.PROP_UNSUB: {
                        this.#CheckPropExists((data as S_PROP_UNSUB_data)?.prop, client, data.id, `Prop key [${(data as S_PROP_UNSUB_data)?.prop}] does not exist on the backend! [#prop-reg-not-found-unsub]`)

                        if (this.lifecycle_hooks.unsub)
                            if (await this.lifecycle_hooks.unsub(client, kind, data))
                                return;

                        //remove hook
                        const prop = this.#props.get((data as S_PROP_UNSUB_data).prop);
                        const del_success = prop?.updates.delete(client_id) ? 1 : 0;
                        client.Send(ClientMessageKind.RES, {
                            id: data?.id,
                            result: { success: del_success, res: del_success }
                        } as C_RES_data);

                        // check the prop is observationaly_temporary, meaning should be deleted when there no more subs on it
                        if (prop?.observationaly_temporary && prop.updates.size === 0) {
                            this.UnRegisterProp((data as S_PROP_UNSUB_data).prop);
                            this.HandleDebug('Temporary Prop UNregistered!', (data as S_PROP_UNSUB_data).prop);
                        }
                        break;
                    }
                    case ServerMessageKind.PROP_GET: {
                        this.#CheckPropExists((data as S_PROP_GET_data)?.prop, client, data.id as id, `Prop key [${(data as S_PROP_GET_data)?.prop}] does not exist on the backend! [#prop-reg-not-found-get]`);
                        const prop_val = this.GetPropVal((data as S_PROP_GET_data)?.prop);
                        client.Send(ClientMessageKind.RES, {
                            id: data.id,
                            result: { success: prop_val !== undefined ? 1 : 0, res: prop_val, error: prop_val === undefined ? 'Server couldnt find prop' : ''}
                        } as data_result_block);
                        break;
                    }
                    case ServerMessageKind.PROP_SET: {
                        this.#CheckPropExists((data as S_PROP_SET_data)?.prop, client, data.id as id, `Prop key [${(data as S_PROP_SET_data)?.prop}] does not exist on the backend! [#prop-reg-not-found-set]`);
                        if (this.#props.get((data as S_PROP_SET_data).prop as string)?.client_writable) {
                            //UpdatePropVal does not set the new val, rather it calls the assigner, which is responsible for setting the new value.
                            const result = this.UpdatePropVal((data as S_PROP_SET_data).prop as string, (data as S_PROP_SET_data)?.prop_val, client.id, data.hasOwnProperty('prop_upd_as_diff') ? (data as S_PROP_SET_data).prop_upd_as_diff : this.#prop_upd_diff); //the assigner inside Update dictates, if this was a successful set.
                            client.Send(ClientMessageKind.RES, { id: data.id, result: { success: result } } as data_result_block); //resolve this request to true, so the client knows everything went fine.
                        } 
                        else throw new E('Prop is not client_writable.', data);
                        break;
                    }
                    case ServerMessageKind.PROP_REG: {
                        // checks
                        if ((data as S_PROP_REG_data)?.prop && this.#props.has((data as S_PROP_REG_data)?.prop || '')) {
                            client.Send(ClientMessageKind.RES, {
                                id: data.id,
                                result: { success: 0, error: `Prop name "${(data as S_PROP_REG_data).prop}" already registered on server! Choose a different name.` }
                            } as C_RES_data);
                            return;
                        }
                        // if a name hasnt been supplied, then generate a unique prop name and return it
                        if (!(data as S_PROP_REG_data)?.prop) {
                            (data as S_PROP_REG_data).prop = this.lifecycle_hooks.gen_prop_name ? await this.lifecycle_hooks.gen_prop_name() : UUID();
                            while (this.#props.has((data as S_PROP_REG_data).prop as PropKey)) (data as S_PROP_REG_data).prop = UUID();
                        }

                        // create the new prop on the server
                        // @ts-expect-error
                        this.RegisterProp((data as S_PROP_REG_data).prop, (data as S_PROP_REG_data).initial_value || null, {
                            ...(((data as S_PROP_REG_data)?.opts) || {}), observationaly_temporary: true //these as the last to overwrite the data?.opts value. client_writable: true,
                        });

                        // notify the client of success with the created prop name
                        client.Send(ClientMessageKind.RES, {
                            id: data.id,
                            result: { success: 1, res: { prop: (data as S_PROP_REG_data).prop } },
                        } as C_RES_data);

                        // check after timeout, if there are no observers, then unreg this prop. In case a user spams regs and nobody subs them
                        if (this.prop_reg_timeout_ms > 0) //can set this.prop_reg_timeout_ms to 0 or negative to skip this logic
                            setTimeout(() => {
                                //it might have already been deleted
                                if (this.#props.has((data as S_PROP_REG_data).prop as PropKey)) {
                                    // @ts-expect-error
                                    if (this.#props.get((data as S_PROP_REG_data).prop).updates.size === 0) { //if no subs, then delete it
                                        this.UnRegisterProp((data as S_PROP_REG_data).prop as PropKey);
                                        this.HandleDebug(`Temporary Prop UNregistered, because nobody subbed it before prop_reg_timeout_ms (${this.prop_reg_timeout_ms}ms)!`, (data as S_PROP_REG_data).prop);
                                    }
                                }
                            }, this.prop_reg_timeout_ms);
                        break;
                    }
                    case ServerMessageKind.SERV: {
                        if (this.lifecycle_hooks.serv)
                            await this.lifecycle_hooks.serv(client, data);
                        else throw new E('Client sent generic data to the server, but the hook for it is not registed. [#no-serv-hook]', client_id);
                        break;
                    }
                    case ServerMessageKind.ADMIN: {
                        if (this.lifecycle_hooks.admin)
                            if (await this.lifecycle_hooks.admin(client, data)) //you get the client, which has its ID, ipAddr and last_seen fields, that can be used to verify access. Also data should contain some secret key, but thats up to you
                                client.Send(ClientMessageKind.RES, { id: data?.id, result: await this.#Admin(((data as unknown) as AdminServerMessageDataObj)?.function, ((data as unknown) as AdminServerMessageDataObj)?.args) });
                            else throw new E('A non Admin send an Admin message, but was not executed.', kind, data, client_id);
                        break;
                    }
                    case ServerMessageKind.RECON: {//client attempts to reconnect to its previous session
                        if (!this.#secure.socio_security) {
                            client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 0, error: 'Cannot reconnect on this server configuration!' } } as C_RES_data);
                            throw new E(`RECON requires SocioServer to be set up with the Secure class! [#recon-needs-secure]`, { kind, data });
                        }

                        // CLIENT ASKS FOR A TOKEN
                        if ((data as S_RECON_GET_data)?.type === 'GET') {
                            const token = this.#secure.socio_security.EncryptString([this.#secure.socio_security?.GenRandInt(100_000, 1_000_000), client.ipAddr, client.id, (new Date()).getTime(), this.#secure.socio_security?.GenRandInt(100_000, 1_000_000)].join(' ')); //creates string in the format "[iv_base64] [encrypted_text_base64] [auth_tag_base64]" where encrypted_text_base64 is a token of format "[rand] [ip] [client_id] [ms_since_epoch] [rand]"
                            this.#tokens.add(token);
                            client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 1, res: token } } as C_RES_data); //send the token to the client for one-time use to reconnect to their established client session
                        }

                        // CLIENT USES A TOKEN
                        else if ((data as S_RECON_USE_data)?.type === 'USE') {
                            //check for valid token to begin with
                            if (!(data as S_RECON_USE_data)?.token || !this.#tokens.has((data as S_RECON_USE_data).token)) {
                                client.Send(ClientMessageKind.RECON, { id: data.id, result: { success: 0, error: 'Invalid token' } } as C_RECON_Data);
                                return;
                            }
                            this.#tokens.delete((data as S_RECON_USE_data).token); //single use token, so delete

                            let [iv, token, auth_tag] = (data as S_RECON_USE_data).token.split(' '); //split the format into encryption parts
                            try {
                                if (iv && token && auth_tag)
                                    token = this.#secure.socio_security.DecryptString(iv, token, auth_tag); //decrypt the payload
                                else
                                    client.Send(ClientMessageKind.RECON, { id: data.id, result: { success: 0, error: 'Invalid token' } } as C_RECON_Data);
                            } catch (e: err) {
                                client.Send(ClientMessageKind.RECON, { id: data.id, result: { success: 0, error: 'Invalid token' } } as C_RECON_Data);
                                return;
                            }

                            const [r1, ip, old_c_id, time_stamp, r2] = token.split(' '); //decrypted payload parts
                            //safety check race conditions
                            if (!(r1 && ip && old_c_id && time_stamp && r2)) {
                                client.Send(ClientMessageKind.RECON, { id: data.id, result: { success: 0, error: 'Invalid token format' } } as C_RECON_Data);
                                return;
                            }
                            if (client.ipAddr !== ip) {
                                client.Send(ClientMessageKind.RECON, { id: data.id, result: { success: 0, error: 'IP address changed between reconnect' } } as C_RECON_Data);
                                return;
                            }
                            else if ((new Date()).getTime() - parseInt(time_stamp) > (this.session_defaults.recon_ttl_ms as number)) {
                                client.Send(ClientMessageKind.RECON, { id: data.id, result: { success: 0, error: 'Token has expired' } } as C_RECON_Data);
                                return;
                            }
                            else if (!(this.#sessions.has(old_c_id))) {
                                client.Send(ClientMessageKind.RECON, { id: data.id, result: { success: 0, error: 'Old session ID was not found' } } as C_RECON_Data);
                                return;
                            }

                            //recon procedure
                            const old_client = this.#sessions.get(old_c_id) as SocioSession;
                            this.ReconnectClientSession(client, old_client, data.id as id);
                            this.HandleInfo(`RECON | old id:  ${old_c_id} -> new id:  ${client.id}`);
                        }
                        break;
                    }
                    case ServerMessageKind.UP_FILES: {
                        if (this.lifecycle_hooks?.file_upload)
                            client.Send(ClientMessageKind.RES, { id: data.id, result: { success: await this.lifecycle_hooks.file_upload(client, (data as S_UP_FILES_data)?.files, (data as S_UP_FILES_data)?.data) ? 1 : 0 } } as C_RES_data);
                        else {
                            const error = 'file_upload hook not registered. [#no-file_upload-hook]';
                            this.HandleError(error);
                            client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 0, error } } as C_RES_data);
                        }
                        break;
                    }
                    case ServerMessageKind.GET_FILES: {
                        if (this.lifecycle_hooks?.file_download) {
                            const response = await this.lifecycle_hooks.file_download(client, (data as S_GET_FILES_data)?.data) as FS_Util_Response;
                            if (!response?.result)
                                this.HandleError(new E('file_download hook returned unsuccessful result.', response?.error));
                            client.Send(ClientMessageKind.RECV_FILES, { id: data.id, files: response.files, result: { success: response.result ? 1 : 0 } } as C_RECV_FILES_Data);
                        }
                        else {
                            this.HandleError('file_download hook not registered. [#no-file_download-hook]');
                            client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 0 } } as C_RES_data);
                        }
                        break;
                    }
                    case ServerMessageKind.IDENTIFY: { //use for session to identify itself with a unique human-readable string
                        const name = (data as { id: id, name: string }).name;
                        
                        if (Object.values(this.GetSessionsInfo()).some(s => s.name === name)){
                            client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 0, error: 'A session already has this name!' } });
                        }else{
                            client.name = name;

                            if (this.lifecycle_hooks?.identify)
                                await this.lifecycle_hooks.identify(client, name);

                            client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 1 } });
                        }

                        break;
                    }
                    case ServerMessageKind.DISCOVERY: {
                        if(this.#secure.allow_discovery === true){
                            // let the dev hook handle the discovery logic of what info to get and send from sessions to client
                            if (this.lifecycle_hooks?.discovery)
                                if (await this.lifecycle_hooks.discovery(client, data)) 
                                    return;

                            // or use my provided basic info response
                            client.Send(ClientMessageKind.RES, {id: data.id, result: {success:1, res: this.GetSessionsInfo()}})
                        }
                        break;
                    }
                    case ServerMessageKind.RPC: {
                        // rpc must be enabled
                        if(this.#secure.allow_rpc !== true){
                            const error = 'Client tried RPC, but the server hasnt enabled it. [#rpc-not-enabled]';
                            this.HandleDebug(error, client, data);
                            client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 0, error }});
                            return;
                        }

                        // let the RPC hook handle it. If it returns anything other than undefined, that will be sent back as the result early
                        if (this.lifecycle_hooks.rpc) {
                            const res = await this.lifecycle_hooks.rpc((data as S_RPC_data).target_client, (data as S_RPC_data).f_name, (data as S_RPC_data).args);
                            if(res !== undefined){
                                client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 1, res } });
                                return;
                            }
                        }

                        // hook didnt handle it, so do some magic
                        // if its null, then assume its meant for the server functions
                        if ((data as S_RPC_data).target_client === null){
                            if ((data as S_RPC_data).f_name in this){
                                const res = this[(data as S_RPC_data).f_name](...(data as S_RPC_data).args);
                                client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 1, res } });
                                return;
                            }
                            else throw new E(`Client RPC to server, but there is no [${(data as S_RPC_data).f_name}] function on the SocioServer class instance! [#unknown-server-func-rpc]`, { client_id: client.id, data });
                        }else{
                            const target_c = this.#sessions.get((data as S_RPC_data).target_client!);
                            if (!target_c) {
                                const error = 'Client tried RPC, but the target client doesnt exist. [#rpc-no-target]';
                                this.HandleDebug(error, client, data);
                                client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 0, error } });
                                return;
                            }

                            // call the function on the other client
                            // 2nd client msg needs a new ID, that it wouldnt already have, bcs ID conflicts - they have their own counters
                            const new_id = this.new_global_id;
                            target_c.Send(ClientMessageKind.RPC, { ...(data as S_RPC_data), id: new_id });

                            // await the clients response, that will resolve this promise in the OK case with a return value
                            // 2nd client will respond to the new ID query, which is this promise:
                            this.#CreateClientQueryPromise(new_id, ServerMessageKind.RPC)
                                .then(res => {
                                    //respond with the original ID of the 1st client
                                    client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 1, res }}); 
                                })
                                // ive set up a timeout for this promise, but it might fail for other reasons too
                                .catch(reason => {
                                    //respond with the original ID of the 1st client
                                    client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 0, error: reason } })
                                })
                        }
                        break;
                    }
                    case ServerMessageKind.OK: {
                        const q = this.#client_queries.get(data.id);
                        if(q){
                            this.HandleInfo(`recv: [OK ${ServerMessageKind[q.for_msg_kind]}] from [${client.name ? client.name + ' | ' : ''}${client_id}]`, data);
                            q.resolve((data as data_base & {return:any}).return); //resolve the promise thats being awaited in some other kind case
                            this.#client_queries.delete(data.id); //remove it
                        } 
                        else throw new E(`Received OK from client for an unknown client query. [#client-query-not-found]`, {sender:client.id, data});
                        break;
                    }
                    // case ServerMessageKind: { break;}
                    default: {
                        const exhaustiveCheck: never = kind; // This ensures that if a new enum value is added and not handled, it will result in a compile-time error
                        throw new E(`Unrecognized message kind! [#unknown-msg-kind]`, { kind, data });
                    }
                }
            }catch(e:err){
                client.Send(ClientMessageKind.RES, {
                    id: data.id,
                    result: { success: 0, error: this.send_sensitive_error_msgs_to_client ? String(e) : 'Server had an error with this request.' }
                } as C_UPD_data);
                this.HandleError(e);
            }
        } catch (e: err) { this.HandleError(e); }
    }

    //this assumes that this.#secure.socio_security is properly assigned
    #Decrypt(client:SocioSession, str:string, is_sql:boolean):string{
        let socio_string_obj: SocioStringObj;

        // first check the cache, if this cyphertext has already been verified as valid and secure
        if (this.#cypther_text_cache.has(str))
            socio_string_obj = this.#cypther_text_cache.get(str) as SocioStringObj;
        // otherwise decrypt
        else{
            //check crypt format "[iv_base64] [encrypted_text_base64] [auth_tag_base64]" where each part is base64 encoded
            const parts = str.includes(' ') ? str.split(' ') : [];
            if (parts.length != 3)
                throw new E('the cipher text does not contain exactly 3 space seperated parts, therefor is invalid. [#cipher-text-invalid-format]', { client, str });

            const cypher_text = str; //save for cache key
            str = (this.#secure.socio_security as SocioSecurity).DecryptString(parts[0], parts[1], parts[2]);
            str = (this.#secure.socio_security as SocioSecurity).RemoveRandInts(str);

            //get markers from string, if they exist. Can be done for SQL, props, endpoints
            socio_string_obj = SocioStringParse(str);

            // save this decyphered result in the cache
            this.#cypther_text_cache.set(cypher_text, socio_string_obj);
        }

        //perform marker checks on every request
        if (socio_string_obj.markers?.includes('auth'))//requiers auth to execute
            if (!client.authenticated)
                throw new E(`Client tried to execute an auth query without being authenticated. [#auth-issue]`, { client });

        if (is_sql && socio_string_obj.markers?.includes('perm')) { //SQL requiers perms on tables to execute
            const verb = ParseQueryVerb(socio_string_obj.str);
            if (!verb)
                throw new E(`Client sent an unrecognized SQL query verb. [#verb-issue]`, { client, str: socio_string_obj.str });

            const tables = ParseQueryTables(socio_string_obj.str);
            if (!tables)
                throw new E(`Client sent an SQL query without table names. [#table-names-not-found]`, { client, str: socio_string_obj.str });

            if (!tables.every((t) => client.HasPermFor(verb, t)))
                throw new E(`Client tried to execute a perms query without having the required permissions. [#perm-issue]`, { client, str: socio_string_obj.str, verb, tables });
        }

        return socio_string_obj.str;
    }

    async Update(initiator:SocioSession, sql:string, params:object | null){        
        //rate limit check
        if(this.#ratelimits.upd)
            if(this.#ratelimits.upd.CheckLimit())
                return;

        //hand off to hook
        if (this.lifecycle_hooks.upd)
            if (await this.lifecycle_hooks.upd(this.#sessions, initiator, sql, params))
                return;

        if (!this.db.Query)
            throw 'SocioServer.Update requires a Database Query function on SocioServer! [#no-db-query-UPDATE]';

        //or go through each session's every hook and query the DB for its result, then send it to the client
        try{
            const tables = ParseQueryTables(sql);
            if (tables.length == 0) throw new E('Update ParseQueryTables didnt find any table names in the SQL. Something must be wrong.', { initiator, sql, params})
            
            const cache: Map<number, object> = new Map(); //cache the queries to not spam the DB in this loop

            for (const client of this.#sessions.values()){
                for (const hook of client.GetSubsForTables(tables)){ //GetSubsForTables always returns array. If empty, then the foreach wont run, so each sql guaranteed to have hooks array
                    //rate limit check
                    if (hook.rate_limiter && hook.rate_limiter.CheckLimit()) return;

                    //Arbiter decides if this query needs be updated. Can do WHERE clause checking yourself here as an optimization for large projects.
                    if (this.db?.Arbiter)
                        if (await this.db.Arbiter({ client: initiator, sql, params }, { client, hook }) === false) //if Arbiter returns false, we skip this hook
                            continue;

                    if (cache.has(hook.cache_hash))
                        client.Send(ClientMessageKind.UPD, {
                            id: hook.id,
                            result: { success: 1, res: cache.get(hook.cache_hash) }
                        } as C_UPD_data);
                    else
                        this.db.Query(client, hook.id, hook.sql, hook.params)
                            .then(res => {
                                client.Send(ClientMessageKind.UPD, {
                                    id: hook.id,
                                    result: { success: 1, res}
                                } as C_UPD_data);
                                cache.set(hook.cache_hash, res);
                            })
                            .catch(error => client.Send(ClientMessageKind.UPD, {
                                id: hook.id,
                                result: {success: 0, error},
                            } as C_UPD_data));
                };
            }
        } catch (e:err) { this.HandleError(e) }
    }

    #CheckPropExists(prop: PropKey | undefined, client: SocioSession, msg_id:id, error_msg: string){
        if (!prop || !(this.#props.has(prop))){
            client.Send(ClientMessageKind.RES, {
                id: msg_id,
                result: {success:0, error:error_msg}
            } as C_RES_data);
            throw new E(error_msg, prop, client.id);
        }
    }

    // SetLifecycleHookHandler<K extends keyof ServerLifecycleHooks>(f_name: K, handler?: ServerLifecycleHooks[K]){
    //     this.lifecycle_hooks[f_name] = handler;
    // }

    RegisterRateLimit(f_name: string, ratelimit: RateLimit | null = null){
        try {
            if (f_name in this.#ratelimits){
                if (ratelimit) {
                    this.#ratelimits[f_name] = new RateLimiter(ratelimit);
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
    RegisterProp(key: PropKey, val: PropValue, { assigner = this.SetPropVal.bind(this), client_writable = true, send_as_diff = undefined, emit_to_sender = false, observationaly_temporary=false }: { assigner?: PropAssigner } & PropOpts = {}){
        try{
            if (this.#props.has(key))
                throw new E(`Prop key [${key}] has already been registered and for client continuity is forbiden to over-write at runtime. [#prop-key-exists]`);
            else
                this.#props.set(key, { val, assigner, updates: new Map(), client_writable, send_as_diff, emit_to_sender, observationaly_temporary });
            if(observationaly_temporary)
                this.HandleDebug('Temporary Prop registered!', key);

        } catch (e: err) { this.HandleError(e) }
    }
    UnRegisterProp(key: PropKey){
        try {
            const prop = this.#props.get(key);
            if (!prop) throw new E(`Prop key [${key}] not registered! [#UnRegisterProp-prop-not-found]`);
            
            //drop the prop first, so that it cant be subbed to while informing clients - a rare but potential issue
            if (!this.#props.delete(key))
                throw new E(`Error deleting prop key [${key}]. [#prop-key-del-error]`);

            //inform all subbed clients that this prop has been dropped
            for (const [client_id, args] of prop.updates.entries()) {
                if (this.#sessions.has(client_id))
                    this.#sessions.get(client_id)?.Send(ClientMessageKind.PROP_DROP, { id: args.id, prop: key });
                else this.#sessions.delete(client_id); //the client_id doesnt exist anymore for some reason, so unsubscribe
            }
        } catch (e: err) { this.HandleError(e) }
    }
    GetPropVal(key: PropKey): PropValue | undefined{
        return this.#props.get(key)?.val;
    }
    //UpdatePropVal does not set the new val, rather it calls the assigner, which is responsible for setting the new value.
    UpdatePropVal(key: PropKey, new_val: PropValue, sender_client_id: ClientID | null, send_as_diff = this.#prop_upd_diff):Bit{//this will propogate the change, if it is assigned, to all subscriptions
        const prop = this.#props.get(key);
        if (!prop) throw new E(`Prop key [${key}] not registered! [#prop-update-not-found]`);
        
        const old_prop_val = prop.val; //bcs the assigner somehow changes this property. Weird. 
        //Dont think JS allows such ref pointers to work. But this then keeps the correct val. 
        //This idea works bcs the mutator of the data should be the first to run this and all other session will get informed here with that sessions diff.

        if (prop.assigner(key, new_val, sender_client_id ? this.#sessions.get(sender_client_id) : undefined)) {//if the prop was passed and the value was set successfully, then update all the subscriptions
            const new_assigned_prop_val = this.GetPropVal(key); //should be GetPropVal, bcs i cant know how the assigner changed the val. But since it runs once per update, then i can cache this call here right after the assigner.
            const prop_val_diff = diff_lib.getDiff(old_prop_val, new_assigned_prop_val);
            if (prop_val_diff.length === 0) return 1; //dont do anything further, if the prop val didnt actually change. This is efficient and removes long feedback loops for global props across many users

            for (const [client_id, args] of prop.updates.entries()) {
                if (args?.rate_limiter && args.rate_limiter?.CheckLimit()) continue; //ratelimit check for this client
                if (sender_client_id === client_id && prop.emit_to_sender === false) continue; //prop can be set to not emit an update back to the initiator of this prop set.

                //do the thing
                if (this.#sessions.has(client_id)){
                    //prepare object of both cases
                    const upd_data = { id: args.id, prop:key };

                    //overload the global Socio Server flag with a per prop flag
                    if (prop?.send_as_diff && typeof prop?.send_as_diff == 'boolean') send_as_diff = prop.send_as_diff;

                    //construct either concrete value or diff of it.
                    if (send_as_diff)
                        upd_data['prop_val_diff'] = prop_val_diff; //this was already computed for other reasons
                    else
                        upd_data['prop_val'] = new_assigned_prop_val;

                    //send to client
                    this.#sessions.get(client_id)?.Send(ClientMessageKind.PROP_UPD, upd_data);
                }
                else {//the client_id doesnt exist anymore for some reason, so unsubscribe
                    prop.updates.delete(client_id);
                    this.#sessions.delete(client_id);
                }
            }
            return 1;
        }
        this.HandleDebug(`Assigner denied setting the new prop value! [#prop-set-not-valid].`, { key, old_prop_val, new_val, sender_client_id });
        return 0;
    }
    SetPropVal(key: PropKey, new_val: PropValue): boolean { //this hard sets the value without checks or updating clients
        try{
            const prop = this.#props.get(key);
            if (prop === undefined)
                throw new E(`Prop key [${key}] not registered! [#prop-set-not-found]`);

            prop.val = new_val;
            return true;
        } catch (e: err) { this.HandleError(e); return false; }
    }

    //send some data to all clients by their ID or unique name, if they have one. By default emits to all connected clients
    async SendToClients(clients: (ClientID | string)[] = [], data: object = {}, kind: ClientMessageKind = ClientMessageKind.CMD){
        let sessions = this.#sessions.values(); //all clients by default
        if(clients.length) //filter specified ones
            sessions = sessions.filter(c => clients.includes(c.id) || (c?.name && clients.includes(c.name)));

        // queue up all the sends at once and let the async event loop figure out the optimal paralel stuff
        const proms = [];
        for (const s of sessions)
            proms.push(s.Send(kind, data) as never);

        return Promise.all(proms); //return a promise of when all the sends have been awaited
    }
    #CreateClientQueryPromise(id: id, for_msg_kind:ServerMessageKind){
        return new Promise((res, rej) => {
            // add timeout, so the server doesnt fill memory for unresponsive clients
            const timer = setTimeout(() => {
                this.#client_queries.delete(id);
                rej(`${ServerMessageKind[for_msg_kind]} id:${id} timed-out.`)
            }, 20 * 1000);

            const resolve = (val) => {
                clearTimeout(timer); //dont send the timeout, if this ever actually resolves
                res(val);
            }
            this.#client_queries.set(id, { resolve, for_msg_kind });
        }) as Promise<any>;
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
        this.#sessions.get(client_id)?.ClearSubs(); //clear query subs
        for (const prop of this.#props.values()) { prop.updates.delete(client_id); }; //clear prop subs
    }

    async #CheckSessionsTimeouts(){
        const now = (new Date()).getTime();
        for (const client of this.#sessions.values()){
            if (now >= client.last_seen + client.session_opts.session_timeout_ttl_ms){
                await client.Send(ClientMessageKind.TIMEOUT, {});
                client.CloseConnection();
                this.HandleInfo('Session timed out.', client.id);
            }
        }
    }

    // stop deletion of old session for a moment
    // copy old sesh info to new sesh, cuz thats the new TCP connection
    // destroy old sesh for good
    ReconnectClientSession(new_session: SocioSession, old_session: SocioSession, client_notify_msg_id?:id){
        const new_id = new_session.id, old_id = old_session.id;
        old_session.Restore();//stop the old session deletion, since a reconnect was actually attempted
        new_session.CopySessionFrom(old_session);

        //clear the subscriptions on the sockets, since the new instance will define new ones on the new page. Also to avoid ID conflicts
        this.#ClearClientSessionSubs(old_id);
        this.#ClearClientSessionSubs(new_id);

        //delete old session for good
        old_session.Destroy(() => {
            this.#ClearClientSessionSubs(old_id);
            this.#sessions.delete(old_id);
        }, this.session_defaults.session_delete_delay_ms as number);

        //notify the client
        const data = { result: { success: 1 }, old_client_id: old_id, auth: new_session.authenticated, name:new_session.name };
        if (client_notify_msg_id) data['id'] = client_notify_msg_id;
        new_session.Send(ClientMessageKind.RECON, data as C_RECON_Data);
    }

    GetSessionsInfo(){
        return Object.fromEntries([...this.#sessions.values()].map(s => [s.id, { name: s.name, ip: s.ipAddr}]));
    }

    get session_ids(){return this.#sessions.keys();}
    get server_info() { return this.#wss.address(); }
    get raw_websocket_server() { return this.#wss; }
}