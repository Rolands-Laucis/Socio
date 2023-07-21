//Homo vitae commodatus non donatus est. - Man's life is lent, not given. /Syrus/

import { LogHandler, LogHandlerOptions, E, log, info, done } from './logging.js';
import { RateLimiter } from './ratelimit.js';
import { MapReplacer, FastHash } from './utils.js';

//types
import type { WebSocket } from 'ws'; //https://github.com/websockets/ws https://github.com/websockets/ws/blob/master/doc/ws.md
import type { id, ClientMessageKind, Bit, LoggingOpts } from './types.js';
import type { RateLimit } from './ratelimit.js'

export type SubObj = {
    tables: string[],
    sql: string, 
    params?: object,
    rate_limiter?: RateLimiter,
    cache_hash:number
}
export type SocioSessionOptions = { default_perms?: Map<string, string[]>, session_timeout_ttl_ms?: number } & LoggingOpts;

export class SocioSession extends LogHandler {
    //private:
    #ws: WebSocket;
    #subs: Map<id, SubObj> = new Map();
    #authenticated = false //usually boolean, but can be any truthy or falsy value to show the state of the session. Can be a token or smth for your own use, bcs the client will only receive a boolean
    #perms: Map<string, string[]> = new Map(); //verb:[tables strings] keeps a dict of access permissions of verb type and to which tables this session has been granted
    #destroyed:number = 0;

    //public:
    verbose = false;
    last_seen: number = 0; //ms since epoch when this session was last active
    ttl_ms: number = Infinity; //ms since epoch showing how long the session is allowed to live.

    constructor(client_id: string, ws_client: WebSocket, client_ipAddr: string, { logging = { verbose: false, hard_crash: false }, default_perms, session_timeout_ttl_ms }: SocioSessionOptions  = {}) {
        // @ts-expect-error
        super({ ...logging, prefix: 'SocioSession' });
        
        //private:
        this.#ws = ws_client;
        this.#ws['socio_client_id'] = client_id; //set the client id (uuid) in the actual WebSocket class, so that the client doesnt have to send his ID, but instead the server tracks all the sockets and this way will have its ID. Preventing impersonation.
        this.#ws['socio_client_ipAddr'] = client_ipAddr;
        if(default_perms) this.#perms = default_perms;

        //public:
        this.verbose = logging.verbose || false;
        if (session_timeout_ttl_ms) this.ttl_ms = session_timeout_ttl_ms;

        this.last_seen_now();
    }

    get web_socket(): WebSocket { return this.#ws; }
    get id(): string { return this.#ws['socio_client_id']; }
    get ipAddr(): string { return this.#ws['socio_client_ipAddr']; }

    //accepts infinite arguments of data to send and will append these params as new key:val pairs to the parent object
    Send(kind: ClientMessageKind, ...data) {//data is an array of parameters to this func, where every element (after first) is an object. First param can also not be an object in some cases
        if(this.#destroyed) return; //if this session is marked for destruction
        if (data.length < 1) throw new E('Not enough arguments to send data! kind;data:', kind, data); //the first argument must always be the data to send. Other params may be objects with aditional keys to be added in the future
        this.#ws.send(JSON.stringify(Object.assign({}, { kind: kind, data: data[0] }, ...data.slice(1)), MapReplacer));
        this.HandleInfo('sent:', kind, 'to', this.id, ...(kind != 'RECV_FILES' ? data : []));
        this.last_seen_now();
    }

    //TODO this used to be well optimized datastructures back in 0.2.1, but had to simplify down, bcs it gets complicated
    RegisterSub(tables: string[], id: id, sql:string, params?: object, rate_limit?:RateLimit) {
        if (!this.#subs.has(id))
            this.#subs.set(id, { tables, sql, params, rate_limiter: rate_limit ? new RateLimiter(rate_limit) : undefined, cache_hash: FastHash(sql+JSON.stringify(params)) });
        else throw new E('MSG ID already registered as Sub!', tables, id, sql, params);
    }
    UnRegisterSub(id: id): Bit {
        return this.#subs.delete(id) ? 1 : 0;
    }
    * GetSubsForTables(tables: string[]=[]){
        for (const [id, hook] of this.#subs.entries())
            if (hook.tables.some(t => tables.includes(t)))
                yield { ...hook, id };
    }

    get authenticated() { return this.#authenticated }
    async Authenticate(auth_func:Function, params:object|null=null) { //auth func can return any truthy or falsy value, the client will only receive a boolean, so its safe to set it to some credential or id or smth, as this would be accessible and useful to you when checking the session access to tables
        const auth:boolean = await auth_func(this, params);
        this.#authenticated = auth == true;
        return auth;
    }

    HasPermFor(verb = '', table = '') { return this.#perms.has(verb) && this.#perms.get(verb)?.includes(table) }
    AddPermFor(verb = '', table = '') {
        if (this.#perms.has(verb)) {
            //@ts-expect-error
            if (!this.#perms.get(verb).includes(table))//@ts-expect-error
                this.#perms.get(verb).push(table);
        }
        else this.#perms.set(verb, [table]);
    }

    last_seen_now(){this.last_seen = (new Date()).getTime()}

    // Closes the underlying socket
    CloseConnection() {
        if (this.#ws?.close) this.#ws.close();
        if (this.#ws?.terminate) this.#ws.terminate();
    }
    //marks the session to be destroyed after some time to live
    Destroy(remove_session_callback:Function, ttl_ms:number, force:boolean = false){
        if (force) {//destroyed immediately
            this.CloseConnection();
            remove_session_callback();
        } 
        else this.#destroyed = setTimeout(remove_session_callback, ttl_ms);
    }
    //cancels the destruction queue
    Restore(){
        if(this.#destroyed) clearTimeout(this.#destroyed);
        this.#destroyed = 0;
    }

    ClearSubs(){this.#subs.clear();}
    CopySessionFrom(old_client:SocioSession){
        this.#authenticated = old_client.#authenticated;
        this.#perms = old_client.#perms;
        this.#ws['socio_client_ipAddr'] = old_client.ipAddr;
        this.verbose = old_client.verbose;
        this.last_seen = old_client.last_seen;
    }
}