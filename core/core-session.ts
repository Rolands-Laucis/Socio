import { LogHandler, E, log, info, done } from './logging.js'
import { RateLimiter } from './ratelimit.js'

//types
import type { WebSocket } from 'ws'; //https://github.com/websockets/ws https://github.com/websockets/ws/blob/master/doc/ws.md
import type { id, ClientMessageKind } from './types.js';
import type { RateLimit } from './ratelimit.js'

type HookObj = {
    tables: string[],
    sql: string, 
    params: object | null,
    rate_limiter: RateLimiter | null
}
type Perms = { [key: string]: string[]; };

//NB! some fields in these variables are private for safety reasons, but also bcs u shouldnt be altering them, only if through my defined ways. They are mostly expected to be constants.
//whereas public variables are free for you to alter freely at any time during runtime.

//Homo vitae commodatus non donatus est. - Man's life is lent, not given. /Syrus/
export class SocioSession extends LogHandler {
    //private:
    #ws: WebSocket;
    #hooks: { [id: id]: HookObj ; } = {}//msg_id:[{table_name, sql, params}]
    #authenticated = false //usually boolean, but can be any truthy or falsy value to show the state of the session. Can be a token or smth for your own use, bcs the client will only receive a boolean
    #perms: Perms  = {} //verb:[tables strings] keeps a dict of access permissions of verb type and to which tables this session has been granted
    #destroyed:number = 0;

    //public:
    verbose = true
    last_seen: number = 0 //ms since epoch when this session was last active

    constructor(client_id: string, ws_client: WebSocket, client_ipAddr:string, { verbose = true, default_perms = {} } = {}) {
        super({ verbose, prefix: 'SocioSession' });
        
        //private:
        this.#ws = ws_client;
        this.#ws['socio_client_id'] = client_id; //set the client id (uuid) in the actual WebSocket class, so that the client doesnt have to send his ID, but instead the server tracks all the sockets and this way will have its ID. Preventing impersonation.
        this.#ws['socio_client_ipAddr'] = client_ipAddr;
        this.#perms = default_perms;

        //public:
        this.verbose = verbose;

        this.last_seen_now();
        // this.HandleInfo('New session created', client_id)
    }

    get id(): string { return this.#ws['socio_client_id'] }
    // set id(new_id:string) { this.#ws['socio_client_id'] = new_id }
    get ipAddr(): string { return this.#ws['socio_client_ipAddr'] }

    //accepts infinite arguments of data to send and will append these params as new key:val pairs to the parent object
    Send(kind: ClientMessageKind, ...data) {//data is an array of parameters to this func, where every element (after first) is an object. First param can also not be an object in some cases
        if(this.#destroyed) return; //if this session is marked for destruction
        if (data.length < 1) throw new E('Not enough arguments to send data! kind;data:', kind, data); //the first argument must always be the data to send. Other params may be objects with aditional keys to be added in the future
        this.#ws.send(JSON.stringify(Object.assign({}, { kind: kind, data: data[0] }, ...data.slice(1))));
        this.HandleInfo('sent:', kind, ...(kind != 'RECV_FILES' ? data : []));
        this.last_seen_now();
    }

    //TODO this used to be well optimized datastructures back in 0.2.1, but had to simplify down, bcs it gets complicated
    RegisterHook(tables: string[], id: id, sql:string, params: object | null, rate_limit:RateLimit | null) {
        if (!(id in this.#hooks))
            this.#hooks[id] = { tables, sql, params, rate_limiter: rate_limit ? new RateLimiter(rate_limit) : null };
        else throw new E('MSG ID already registered as hook!', tables, id, sql, params);
    }
    UnRegisterHook(id: id) {
        if (!id || !(id in this.#hooks)) return false; //check if it exists

        delete this.#hooks[id];
        // this.HandleInfo('unregistered hook', id);
        return true;
    }
    GetHooksForTables(tables: string[]=[]){
        return Object.entries(this.#hooks)
            .filter(([key, h]) => h.tables.some(t => tables.includes(t)))
            .map(([key, h]) => { return {...h, id:key}})
    }

    get authenticated() { return this.#authenticated }
    async Authenticate(auth_func:Function, ...params:any[]) { //auth func can return any truthy or falsy value, the client will only receive a boolean, so its safe to set it to some credential or id or smth, as this would be accessible and useful to you when checking the session access to tables
        const auth:boolean = await auth_func(...params);
        this.#authenticated = auth == true;
        return auth;
    }

    HasPermFor(verb = '', key = '') { return verb in this.#perms && this.#perms[verb].includes(key) }
    AddPermFor(verb = '', key = '') {
        if (verb in this.#perms) {
            if (!this.#perms[verb].includes(key))
                this.#perms[verb].push(key);
        }
        else this.#perms[verb] = [key];
    }

    last_seen_now(){this.last_seen = (new Date()).getTime()}

    //marks the session to be destroyed after some time to live
    Destroy(remove_session_callback:Function, ttl_ms:number, force:boolean = false){
        if (force) {//destroyed immediately
            if (this.#ws?.close)
                this.#ws.close();
            if (this.#ws?.terminate)
                this.#ws.terminate();
            remove_session_callback();
        } 
        else this.#destroyed = setTimeout(remove_session_callback, ttl_ms);
    }
    //cancels the destruction queue
    Restore(){
        if(this.#destroyed) clearTimeout(this.#destroyed);
        this.#destroyed = 0;
    }

    ClearHooks(){this.#hooks = {};}
    CopySessionFrom(old_client:SocioSession){
        this.#authenticated = old_client.#authenticated;
        this.#perms = old_client.#perms;
        this.#ws['socio_client_ipAddr'] = old_client.ipAddr;
        this.verbose = old_client.verbose;
        this.last_seen = old_client.last_seen;
    }
}