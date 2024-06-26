//There has been no great wisdom without an element of madness. /Aristotle/
//And thus i present - Socio.

//libs
import { WebSocketServer } from 'ws'; //https://github.com/websockets/ws https://github.com/websockets/ws/blob/master/doc/ws.md
import * as diff_lib from 'recursive-diff'; //https://www.npmjs.com/package/recursive-diff

//mine
import { QueryIsSelect, ParseQueryTables, SocioStringParse, ParseQueryVerb, sleep, GetAllMethodNamesOf, yaml_parse } from './utils.js';
import { E, LogHandler, err, log, info, done } from './logging.js';
import { UUID, type SocioSecurity } from './secure.js';
import { SocioSession, type SubObj } from './core-session.js';
import { RateLimiter } from './ratelimit.js';
import { CoreMessageKind } from './utils.js';

//types
import type { ServerOptions, WebSocket, AddressInfo } from 'ws';
import type { IncomingMessage } from 'http';
import type { id, PropKey, PropValue, PropAssigner, PropOpts, SocioFiles, ClientID, FS_Util_Response, ServerLifecycleHooks, LoggingOpts, Bit, SessionOpts } from './types.js';
import { ClientMessageKind } from './core-client.js';
import type { RateLimit } from './ratelimit.js';
import type { SocioStringObj } from './utils.js';
export type MessageDataObj = { id?: id, sql?: string, endpoint?: string, params?: any, verb?: string, table?: string, unreg_id?: id, prop?: string, prop_val?: PropValue, prop_upd_as_diff?:boolean, data?: any, rate_limit?: RateLimit, files?: SocioFiles, sql_is_endpoint?:boolean };
export type QueryFuncParams = { id?: id, sql: string, params?: any };
export type QueryFunction = (client: SocioSession, id: id, sql: string, params?: any) => Promise<object>;

type SessionsDefaults = { timeouts: boolean, timeouts_check_interval_ms?: number, session_delete_delay_ms?: number, recon_ttl_ms?: number } & SessionOpts;
type DecryptOptions = { decrypt_sql: boolean, decrypt_prop: boolean, decrypt_endpoint: boolean };
type DBOpts = { Query: QueryFunction, Arbiter?: (initiator: { client: SocioSession, sql: string, params: any }, current: { client: SocioSession, hook: SubObj }) => boolean | Promise<boolean>};
type SocioServerOptions = { db: DBOpts, socio_security?: SocioSecurity | null, decrypt_opts?: DecryptOptions, hard_crash?: boolean, session_defaults?: SessionsDefaults, prop_upd_diff?: boolean, [key:string]:any } & LoggingOpts;
type AdminMessageDataObj = {function:string, args?:any[], secure_key:string};
type BasicClientResponse = { id: id | string, data?: any, result?: Bit | string | {success: Bit | string} | object, [key: string]: any };

//NB! some fields in these variables are private for safety reasons, but also bcs u shouldnt be altering them, only if through my defined ways. They are mostly expected to be constants.
//whereas public variables are free for you to alter freely at any time during runtime.

export class SocioServer extends LogHandler {
    // private:
    #wss: WebSocketServer;
    #sessions: Map<ClientID, SocioSession> = new Map(); //Maps are quite more performant than objects. And their keys dont overlap with Object prototype.

    //if constructor is given a SocioSecure object, then that will be used to decrypt all incomming messages, if the msg flag is set
    #secure: { socio_security: SocioSecurity | null } & DecryptOptions;
    #cypther_text_cache: Map<string, SocioStringObj> = new Map(); //decyphering at runtime is costly, so cache validated, secure results.

    //backend props, e.g. strings for colors, that clients can subscribe to and alter
    #props: Map<PropKey, { val: PropValue, assigner: PropAssigner, updates: Map<ClientID, { id: id, rate_limiter?: RateLimiter }> } & PropOpts> = new Map();

    //rate limits server functions globally
    #ratelimits: { [key: string]: RateLimiter | null } = { con: null, upd:null};

    #lifecycle_hooks: ServerLifecycleHooks = { con: undefined, discon: undefined, msg: undefined, sub: undefined, unsub: undefined, upd: undefined, auth: undefined, gen_client_id: undefined, grant_perm: undefined, serv: undefined, admin: undefined, blob: undefined, file_upload: undefined, file_download: undefined, endpoint: undefined, gen_prop_name:undefined }; //call the register function to hook on these. They will be called if they exist
    //If the hook returns a truthy value, then it is assumed, that the hook handled the msg and the lib will not. Otherwise, by default, the lib handles the msg.
    //msg hook receives all incomming msgs to the server. 
    //upd works the same as msg, but for everytime updates need to be propogated to all the sockets.
    //auth func can return any truthy or falsy value, the client will only receive a boolean, so its safe to set it to some credential or id or smth, as this would be accessible and useful to you when checking the session access to tables.
    //the grant_perm funtion is for validating that the user has access to whatever tables or resources the sql is working with. A client will ask for permission to a verb (SELECT, INSERT...) and table(s). If you grant access, then the server will persist it for the entire connection.
    //the admin function will be called, when a socket attempts to use an ADMIN msg kind. It receives the SocioSession instance, that has id, ip and last seen fields you can use. Also the data it sent, so u can check your own secure key or smth. Return truthy to allow access

    //stores active reconnection tokens
    #tokens: Set<string> = new Set();

    //global flag to send prop obj diffs using the diff lib instead of the full object every time.
    #prop_upd_diff = false;

    //public:
    db!: DBOpts;
    session_defaults: SessionsDefaults = { timeouts: false, timeouts_check_interval_ms: 1000 * 60, session_timeout_ttl_ms: Infinity, session_delete_delay_ms: 1000 * 5, recon_ttl_ms: 1000 * 60 * 60 };
    prop_reg_timeout_ms!: number;

    constructor(opts: ServerOptions | undefined = {}, { db, socio_security = null, logging = { verbose: false, hard_crash: false }, decrypt_opts = { decrypt_sql: true, decrypt_prop: false, decrypt_endpoint:false}, session_defaults = undefined, prop_upd_diff=false, prop_reg_timeout_ms=1000*10 }: SocioServerOptions){
        super({ ...logging, prefix:'SocioServer'});
        //verbose - print stuff to the console using my lib. Doesnt affect the log handlers
        //hard_crash will just crash the class instance and propogate (throw) the error encountered without logging it anywhere - up to you to handle.
        //both are public and settable at runtime

        //private:
        this.#wss = new WebSocketServer({ ...opts, clientTracking: true }); //take a look at the WebSocketServer docs - the opts can have a server param, that can be your http server
        this.#secure = { socio_security, ...decrypt_opts };
        this.#prop_upd_diff = prop_upd_diff;

        //public:
        if (!db?.Query) return;
        this.db = db;
        this.session_defaults = Object.assign(this.session_defaults, session_defaults);
        this.prop_reg_timeout_ms = prop_reg_timeout_ms;

        this.#wss.on('connection', this.#Connect.bind(this)); //https://thenewstack.io/mastering-javascript-callbacks-bind-apply-call/ have to bind 'this' to the function, otherwise it will use the .on()'s 'this', so that this.[prop] are not undefined
        this.#wss.on('close', (...stuff) => { this.HandleInfo('WebSocketServer close event', ...stuff) });
        this.#wss.on('error', (...stuff) => { this.HandleError(new E('WebSocketServer error event', ...stuff))});

        //set up interval timer to check if sessions are timed out.
        if (this.session_defaults.timeouts)
            setInterval(this.#CheckSessionsTimeouts.bind(this), this.session_defaults.timeouts_check_interval_ms);

        const addr: AddressInfo = this.#wss.address() as AddressInfo;
        if (this.verbose) this.done(`Created SocioServer on `, addr);
        // if (addr.family == 'ws')
        //     this.HandleInfo('WARNING! Your server is using an unsecure WebSocket protocol, setup wss:// instead, when you can!');
    }

    async #Connect(conn: WebSocket, request: IncomingMessage){
        try{
            //construct the new session with a unique client ID
            let client_id: ClientID = (this.#lifecycle_hooks.gen_client_id ? await this.#lifecycle_hooks.gen_client_id() : UUID())?.toString();
            while (this.#sessions.has(client_id)) //avoid id collisions
                client_id = (this.#lifecycle_hooks.gen_client_id ? await this.#lifecycle_hooks.gen_client_id() : UUID())?.toString();

            //get the IP. Gets either from a reverse proxy header (like if u have nginx) or just straight off the http meta
            //@ts-ignore
            const client_ip = 'x-forwarded-for' in request?.headers ? request.headers['x-forwarded-for'].split(',')[0].trim() : request.socket.remoteAddress;

            //create the socio session class and save down the client id ref for convenience later
            const client = new SocioSession(client_id, conn, client_ip, { logging: { verbose: this.verbose }, session_opts: { session_timeout_ttl_ms: this.session_defaults.session_timeout_ttl_ms, max_payload_size: this.session_defaults.max_payload_size} });
            this.#sessions.set(client_id, client);

            //pass the object to the connection hook, if it exists. It cant take over
            if (this.#lifecycle_hooks.con)
                await this.#lifecycle_hooks.con(client, request); //u can get the client_id and client_ip off the client object

            //notify the client of their ID
            client.Send(ClientMessageKind.CON, client_id);
            this.HandleInfo('CON', client_id); //, this.#wss.clients

            //set this client websockets event handlers
            conn.on('message', (req: Buffer | ArrayBuffer | Buffer[], isBinary: Boolean) => {
                if (this.#sessions.has(client_id))//@ts-expect-error
                    this.#Message.bind(this)(this.#sessions.get(client_id), req, isBinary);
                else conn?.close();
            });
            conn.on('close', (code:number, reason:Buffer) => { this.#SocketClosed.bind(this)(client, {code, reason:reason.toString('utf8')}) });
            conn.on('error', (error: Error) => { this.#SocketClosed.bind(this)(client, error) }); //https://github.com/websockets/ws/blob/master/doc/ws.md#event-error-1
        } catch (e: err) { this.HandleError(e); }
    }

    async #SocketClosed(client:SocioSession, event_args:any){
        //trigger hook
        if (this.#lifecycle_hooks.discon)
            await this.#lifecycle_hooks.discon(client);

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

    async #Message(client:SocioSession, req: Buffer | ArrayBuffer | Buffer[], isBinary: Boolean){
        try{
            //handle binary data and return
            if(isBinary){
                this.HandleInfo(`recv: BLOB from ${client.id}`)
                if (this.#lifecycle_hooks.blob) {
                    if (await this.#lifecycle_hooks.blob(client, req))
                        client.Send(ClientMessageKind.RES, { id: 'BLOB', result: { success: 1 } } as BasicClientResponse);
                    else client.Send(ClientMessageKind.RES, { id: 'BLOB', result: { success: 0 } } as BasicClientResponse);
                }
                else client.Send(ClientMessageKind.ERR, { id: 'BLOB', result: 'Server does not handle the BLOB hook.' } as BasicClientResponse);
                return;
            }

            const { kind, data }: { kind: CoreMessageKind; data: MessageDataObj } = yaml_parse(req.toString());
            const client_id = client.id; //cache the ID, since its used so much here

            //if the socio security instance exists and some specific string fields was recieved and they are to be decrypted, then do so here
            if (this.#secure.socio_security) {
                for(const field of ['sql', 'prop', 'endpoint'])
                    if (data[field] && this.#secure['decrypt_' + field])
                        data[field] = this.#Decrypt(client, data[field], field === 'sql');
            }
            
            this.HandleInfo(`recv: [${CoreMessageKind[kind]}] from [${client_id}]`, kind != CoreMessageKind.UP_FILES ? data : `File count: ${data.files?.size}`);

            //let the developer handle the msg
            if (this.#lifecycle_hooks.msg)
                if(await this.#lifecycle_hooks.msg(client, kind, data))
                    return;

            switch (kind) {
                case  CoreMessageKind.SUB:{
                    if (this.#lifecycle_hooks.sub)
                        if (await this.#lifecycle_hooks.sub(client, kind, data))
                            return;

                    //if the client happens to want to use an endpoint keyname instead of SQL, retrieve the SQL string from a hook call and procede with that.
                    if (data.endpoint && !data.sql) {
                        if (this.#lifecycle_hooks.endpoint)
                            data.sql = await this.#lifecycle_hooks.endpoint(client, data.endpoint);
                        else throw new E('Client sent endpoint instead of SQL, but its hook is missing. [#no-endpoint-hook-SUB]');
                    }

                    if (data.sql) {
                        if (QueryIsSelect(data.sql || '')) {
                            //set up hook
                            const tables = ParseQueryTables(data.sql || '');
                            if (tables)
                                client.RegisterSub(tables, data.id as id, data.sql || '', data?.params, data?.rate_limit);

                            //send response
                            client.Send(ClientMessageKind.UPD, {
                                id: data.id,
                                result: await this.db.Query(client, data.id || 0, data.sql || '', data?.params),
                                status: 'success'
                            } as BasicClientResponse);
                        } else client.Send(ClientMessageKind.ERR, {
                            id: data.id,
                            result: 'Only SELECT queries may be subscribed to! [#reg-not-select]',
                            status: 'error'
                        } as BasicClientResponse);
                    } else client.Send(ClientMessageKind.ERR, {
                        id: data.id,
                        result: 'Nothing to subscribed to! [#reg-no-res]',
                        status: 'error'
                    } as BasicClientResponse);
                    break;
                }
                case  CoreMessageKind.UNSUB:{
                    if (this.#lifecycle_hooks.unsub)
                        if (await this.#lifecycle_hooks.unsub(client, kind, data))
                            return;

                    client.Send(ClientMessageKind.RES, { id: data.id, result: { success: client.UnRegisterSub(data?.unreg_id || '') } } as BasicClientResponse);
                    break;
                }
                case  CoreMessageKind.SQL:{
                    //if the client happens to want to use an endpoint keyname instead of SQL, retrieve the SQL string from a hook call and procede with that.
                    if (data?.sql_is_endpoint && data.sql) {
                        if (this.#lifecycle_hooks.endpoint)
                            data.sql = await this.#lifecycle_hooks.endpoint(client, data.sql);
                        else throw new E('Client sent endpoint instead of SQL, but its hook is missing. [#no-endpoint-hook-SQL]');
                    }
                    //have to do the query in every case
                    const res = this.db.Query(client, data.id || 0, data.sql || '', data.params);
                    client.Send(ClientMessageKind.RES, { id: data.id, result: await res } as BasicClientResponse); //wait for result and send it back

                    //if the sql wasnt a SELECT, but altered some resource, then need to propogate that to other connection hooks
                    if (!QueryIsSelect(data.sql || ''))
                        this.Update(client, data.sql || '', data?.params);

                    break;
                }
                case  CoreMessageKind.PING:{
                    client.Send(ClientMessageKind.PONG, { id: data?.id } as BasicClientResponse);
                    break;
                }
                case  CoreMessageKind.AUTH: {//client requests to authenticate itself with the server
                    if (client.authenticated) //check if already has auth
                        client.Send(ClientMessageKind.AUTH, { id: data.id, result: {success: 1} });
                    else if (this.#lifecycle_hooks.auth) {
                        const res = await client.Authenticate(this.#lifecycle_hooks.auth, data.params) //bcs its a private class field, give this function the hook to call and params to it. It will set its field and give back the result. NOTE this is safer than adding a setter to a private field
                        client.Send(ClientMessageKind.AUTH, { id: data.id, result: res == true ? 1 : 0 }) //authenticated can be any truthy or falsy value, but the client will only receive a boolean, so its safe to set this to like an ID or token or smth for your own use
                    } else {
                        this.HandleError('AUTH function hook not registered, so client not authenticated. [#no-auth-func]')
                        client.Send(ClientMessageKind.AUTH, { id: data.id, result: 0 })
                    }
                    break;
                }
                case  CoreMessageKind.GET_PERM:{
                    if (client.HasPermFor(data?.verb, data?.table))//check if already has the perm
                        client.Send(ClientMessageKind.GET_PERM, { id: data.id, result: { success: 1} });
                    else if (this.#lifecycle_hooks.grant_perm) {//otherwise try to grant the perm
                        const granted: boolean = await this.#lifecycle_hooks.grant_perm(client, data);
                        client.Send(ClientMessageKind.GET_PERM, { id: data.id, result: granted === true ? 1 : 0 }) //the client will only receive a boolean, but still make sure to only return bools as well
                    }
                    else {
                        this.HandleError('grant_perm function hook not registered, so client not granted perm. [#no-grant_perm-func]')
                        client.Send(ClientMessageKind.GET_PERM, { id: data.id, result: 0 })
                    }
                    break;
                }
                case  CoreMessageKind.PROP_SUB:{
                    this.#CheckPropExists(data?.prop, client, data.id as id, `Prop key [${data?.prop}] does not exist on the backend! [#prop-reg-not-found-sub]`)

                    if (this.#lifecycle_hooks.sub)
                        if (await this.#lifecycle_hooks.sub(client, kind, data))
                            return;

                    //set up hook
                    this.#props.get(data.prop as PropKey)?.updates.set(client_id, { id: data.id as id, rate_limiter: data?.rate_limit ? new RateLimiter(data.rate_limit) : undefined })

                    //send response
                    if (data?.data?.receive_initial_update)
                        await client.Send(ClientMessageKind.PROP_UPD, {
                            id: data.id,
                            prop: data.prop,
                            prop_val: this.GetPropVal(data.prop as PropKey)
                        });
                    client.Send(ClientMessageKind.RES, {
                        id: data.id,
                        result: { success:1}
                    });
                    break;
                }
                case  CoreMessageKind.PROP_UNSUB:{
                    this.#CheckPropExists(data?.prop, client, data?.id as id, `Prop key [${data?.prop}] does not exist on the backend! [#prop-reg-not-found-unsub]`)

                    if (this.#lifecycle_hooks.unsub)
                        if (await this.#lifecycle_hooks.unsub(client, kind, data))
                            return;

                    //remove hook
                    const prop = this.#props.get(data.prop as PropKey);
                    try {
                        client.Send(ClientMessageKind.RES, {
                            id: data?.id,
                            result: { success: prop?.updates.delete(client_id) ? 1 : 0}
                        } as BasicClientResponse);
                    } catch (e: err) {
                        //send response
                        client.Send(ClientMessageKind.ERR, {
                            id: data?.id,
                            result: e?.msg
                        } as BasicClientResponse);
                        throw e; //report on the server as well
                    }

                    // check the prop is observationaly_temporary, meaning should be deleted when there no more subs on it
                    if(prop?.observationaly_temporary && prop.updates.size === 0){
                        this.UnRegisterProp(data.prop as PropKey);
                        this.HandleDebug('Temporary Prop UNregistered!', data.prop);
                    }
                    break;
                }
                case  CoreMessageKind.PROP_GET:{
                    this.#CheckPropExists(data?.prop, client, data.id as id, `Prop key [${data?.prop}] does not exist on the backend! [#prop-reg-not-found-get]`);
                    client.Send(ClientMessageKind.RES, {
                        id: data.id,
                        result: this.GetPropVal(data.prop as string)
                    });
                    break;
                }
                case  CoreMessageKind.PROP_SET:{
                    this.#CheckPropExists(data?.prop, client, data.id as id, `Prop key [${data?.prop}] does not exist on the backend! [#prop-reg-not-found-set]`);
                    try {
                        if (this.#props.get(data.prop as string)?.client_writable) {
                            //UpdatePropVal does not set the new val, rather it calls the assigner, which is responsible for setting the new value.
                            const result = this.UpdatePropVal(data.prop as string, data?.prop_val, client.id, data.hasOwnProperty('prop_upd_as_diff') ? data.prop_upd_as_diff : this.#prop_upd_diff); //the assigner inside Update dictates, if this was a successful set.
                            client.Send(ClientMessageKind.RES, { id: data.id, result: { success: result} }); //resolve this request to true, so the client knows everything went fine.
                        } else throw new E('Prop is not client_writable.', data);
                    } catch (e: err) {
                        //send response
                        client.Send(ClientMessageKind.ERR, {
                            id: data.id,
                            result: e?.msg
                        });
                        throw e; //report on the server as well
                    }
                    break;
                }
                case CoreMessageKind.PROP_REG: { 
                    // checks
                    if (data?.prop && this.#props.has(data.prop)) {
                        client.Send(ClientMessageKind.ERR, {
                            id: data.id,
                            result: `Prop name "${data.prop}" already registered on server! Choose a different name.`
                        } as BasicClientResponse);
                        return;
                    }
                    // if a name hasnt been supplied, then generate a unique prop name and return it
                    if (!data?.prop){
                        data.prop = this.#lifecycle_hooks.gen_prop_name ? await this.#lifecycle_hooks.gen_prop_name() : UUID();
                        while (this.#props.has(data.prop)) data.prop = UUID();
                    }

                    // create the new prop on the server
                    // @ts-expect-error
                    this.RegisterProp(data.prop, data?.initial_value || null, {
                        // @ts-expect-error
                        ...((data?.opts as PropOpts) || {}), observationaly_temporary: true //these as the last to overwrite the data?.opts value. client_writable: true,
                    });

                    // notify the client of success with the created prop name
                    client.Send(ClientMessageKind.RES, {
                        id: data.id,
                        result: 1,
                        prop: data.prop
                    } as BasicClientResponse);

                    // check after timeout, if there are no observers, then unreg this prop. In case a user spams regs and nobody subs them
                    if (this.prop_reg_timeout_ms > 0) //can set this.prop_reg_timeout_ms to 0 or negative to skip this logic
                        setTimeout(() => {
                            //it might have already been deleted
                            if (this.#props.has(data.prop as PropKey)){
                                // @ts-expect-error
                                if (this.#props.get(data.prop as PropKey).updates.size === 0){ //if no subs, then delete it
                                    this.UnRegisterProp(data.prop as PropKey);
                                    this.HandleDebug(`Temporary Prop UNregistered, because nobody subbed it before prop_reg_timeout_ms (${this.prop_reg_timeout_ms}ms)!`, data.prop);
                                }
                            }
                        }, this.prop_reg_timeout_ms);
                    break;
                }
                case  CoreMessageKind.SERV:{
                    if (this.#lifecycle_hooks.serv)
                        await this.#lifecycle_hooks.serv(client, data);
                    else throw new E('Client sent generic data to the server, but the hook for it is not registed. [#no-serv-hook]', client_id);
                    break;
                }
                case  CoreMessageKind.ADMIN:{
                    if (this.#lifecycle_hooks.admin)
                        if (await this.#lifecycle_hooks.admin(client, data)) //you get the client, which has its ID, ipAddr and last_seen fields, that can be used to verify access. Also data should contain some secret key, but thats up to you
                            client.Send(ClientMessageKind.RES, { id: data?.id, result: await this.#Admin(((data as unknown) as AdminMessageDataObj)?.function, ((data as unknown) as AdminMessageDataObj)?.args) });
                        else throw new E('A non Admin send an Admin message, but was not executed.', kind, data, client_id);
                    break;
                }
                case  CoreMessageKind.RECON: {//client attempts to reconnect to its previous session
                    if (!this.#secure) {
                        client.Send(ClientMessageKind.ERR, { id: data.id, result: 'Cannot reconnect on this server configuration!', success: 0 });
                        throw new E(`RECON requires SocioServer to be set up with the Secure class! [#recon-needs-secure]`, { kind, data });
                    }

                    if (data?.data?.type == 'GET') {
                        //@ts-expect-error
                        const token = this.#secure.socio_security.EncryptString([this.#secure.socio_security?.GenRandInt(100_000, 1_000_000), client.ipAddr, client.id, (new Date()).getTime(), this.#secure.socio_security?.GenRandInt(100_000, 1_000_000)].join(' ')); //creates string in the format "[iv_base64] [encrypted_text_base64] [auth_tag_base64]" where encrypted_text_base64 is a token of format "[rand] [ip] [client_id] [ms_since_epoch] [rand]"
                        this.#tokens.add(token);
                        client.Send(ClientMessageKind.RES, { id: data.id, result: token, success: 1 }); //send the token to the client for one-time use to reconnect to their established client session
                    }
                    else if (data?.data?.type == 'POST') {
                        //check for valid token to begin with
                        if (!data?.data?.token || !this.#tokens.has(data.data.token)) {
                            client.Send(ClientMessageKind.RECON, { id: data.id, result: 'Invalid token', success: 0 });
                            return;
                        }
                        this.#tokens.delete(data.data.token); //single use token, so delete

                        let [iv, token, auth_tag] = data.data.token.split(' '); //split the format into encryption parts
                        try {
                            if (iv && token && auth_tag)
                                token = this.#secure.socio_security?.DecryptString(iv, token, auth_tag); //decrypt the payload
                            else
                                client.Send(ClientMessageKind.RECON, { id: data.id, result: 'Invalid token', success: 0 });
                        } catch (e: err) {
                            client.Send(ClientMessageKind.RECON, { id: data.id, result: 'Invalid token', success: 0 });
                            return;
                        }

                        const [r1, ip, old_c_id, time_stamp, r2] = token.split(' '); //decrypted payload parts
                        //safety check race conditions
                        if (!(r1 && ip && old_c_id && time_stamp && r2)) {
                            client.Send(ClientMessageKind.RECON, { id: data.id, result: 'Invalid token format', success: 0 });
                            return;
                        }
                        if (client.ipAddr !== ip) {
                            client.Send(ClientMessageKind.RECON, { id: data.id, result: 'IP address changed between reconnect', success: 0 });
                            return;
                        }
                        else if ((new Date()).getTime() - parseInt(time_stamp) > (this.session_defaults.recon_ttl_ms as number)) {
                            client.Send(ClientMessageKind.RECON, { id: data.id, result: 'Token has expired', success: 0 });
                            return;
                        }
                        else if (!(this.#sessions.has(old_c_id))) {
                            client.Send(ClientMessageKind.RECON, { id: data.id, result: 'Old session ID was not found', success: 0 });
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
                            this.#ClearClientSessionSubs(old_c_id);
                            this.#sessions.delete(old_c_id);
                        }, this.session_defaults.session_delete_delay_ms as number);

                        //notify the client 
                        client.Send(ClientMessageKind.RECON, { id: data.id, result: { old_client_id: old_c_id, auth: client.authenticated }, success: 1 });
                        this.HandleInfo(`RECON ${old_c_id} -> ${client.id} (old client ID -> new/current client ID)`);
                    }
                    break;
                } 
                case  CoreMessageKind.UP_FILES:{
                    if (this.#lifecycle_hooks?.file_upload)
                        client.Send(ClientMessageKind.RES, { id: data.id, result: {success: await this.#lifecycle_hooks.file_upload(client, data?.files, data?.data) ? 1 : 0} });
                    else {
                        this.HandleError('file_upload hook not registered. [#no-file_upload-hook]');
                        client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 0} });
                    }
                    break;
                }
                case  CoreMessageKind.GET_FILES:{
                    if (this.#lifecycle_hooks?.file_download) {
                        const response = await this.#lifecycle_hooks.file_download(client, data?.data) as FS_Util_Response;
                        if (!response?.result)
                            this.HandleError(new E('file_download hook returned unsuccessful result.', response?.error));
                        client.Send(ClientMessageKind.RECV_FILES, { id: data.id, files: response.files, result: response.result });
                    }
                    else {
                        this.HandleError('file_download hook not registered. [#no-file_download-hook]');
                        client.Send(ClientMessageKind.RES, { id: data.id, result: { success: 0} });
                    }
                    break;
                }
                // case CoreMessageKind: { break;}
                default: throw new E(`Unrecognized message kind! [#unknown-msg-kind]`, {kind, data});
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

    async Update(initiator:SocioSession, sql:string, params:object){        
        //rate limit check
        if(this.#ratelimits.upd)
            if(this.#ratelimits.upd.CheckLimit())
                return;

        //hand off to hook
        if (this.#lifecycle_hooks.upd)
            if (await this.#lifecycle_hooks.upd(this.#sessions, initiator, sql, params))
                return;

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
                            result: cache.get(hook.cache_hash),
                            status: 'success'
                        });
                    else
                        this.db.Query(client, hook.id, hook.sql, hook.params)
                            .then(res => {
                                client.Send(ClientMessageKind.UPD, {
                                    id: hook.id,
                                    result: res,
                                    status: 'success'
                                });
                                cache.set(hook.cache_hash, res);
                            })
                            .catch(err => client.Send(ClientMessageKind.UPD, {
                                id: hook.id,
                                result: err,
                                status: 'error'
                            }));
                };
            }
        } catch (e:err) { this.HandleError(e) }
    }

    #CheckPropExists(prop: PropKey | undefined, client: SocioSession, msg_id:id, error_msg: string){
        if (!prop || !(this.#props.has(prop))){
            client.Send(ClientMessageKind.ERR, {
                id: msg_id,
                result: error_msg
            } as BasicClientResponse);
            throw new E(error_msg, prop, client.id);
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
    GetPropVal(key: PropKey){
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

    //send some data to all clients by their ID. By default emits to all connected clients
    SendToClients(client_ids: string[] = [], data: object = {}, kind: ClientMessageKind = ClientMessageKind.CMD): Promise<void>{
        return new Promise((res, rej) => {
            try{
                const sessions = client_ids.length ? client_ids.map(c_id => this.#sessions.get(c_id)) : this.#sessions.values();

                for (const s of sessions)
                    if (s)
                        s.Send(kind, data); //these are all sync calls
                    
                res();
            }
            catch (e) {rej(e);}
        });
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

    get session_ids(){return this.#sessions.keys();}
    get server_info() { return this.#wss.address(); }
    get raw_websocket_server() { return this.#wss; }
}