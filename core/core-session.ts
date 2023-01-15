import { log, info, soft_error, setPrefix, setShowTime } from '@rolands/log'; setPrefix('SocioSession'); setShowTime(false); //for my logger
import { LogHandler, E } from './logging.js'
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

//NB! some fields in these variables are private for safety reasons, but also bcs u shouldnt be altering them, only if through my defined ways. They are mostly expected to be constants.
//whereas public variables are free for you to alter freely at any time during runtime.

//Homo vitae commodatus non donatus est. - Man's life is lent, not given. /Syrus/
export class SocioSession extends LogHandler {
    //private:
    #ws: WebSocket;
    #hooks: { [id: id]: HookObj ; } = {}//msg_id:[{table_name, sql, params}]
    #authenticated = false //usually boolean, but can be any truthy or falsy value to show the state of the session. Can be a token or smth for your own use, bcs the client will only receive a boolean
    #perms: { [key: string]: string[]; } = {} //verb:[tables strings] keeps a dict of access permissions of verb type and to which tables this session has been granted

    //public:
    verbose = true
    last_seen: string | null = null //date and time of last seen active session

    constructor(client_id: string, browser_ws_conn: WebSocket, { verbose = true, default_perms = {} } = {}) {
        super(info, soft_error);
        
        //private:
        this.#ws = browser_ws_conn
        this.#ws['client_id'] = client_id //set the client id (uuid) in the actual WebSocket class, so that the client doesnt have to send his ID, but instead the server tracks all the sockets and this way will have its ID. Preventing impersonation.
        this.#perms = default_perms

        //public:
        this.verbose = verbose

        this.last_seen_now()
        // this.HandleInfo('New session created', client_id)
    }

    get id():string { return this.#ws['client_id'] }

    //accepts infinite arguments of data to send and will append these params as new key:val pairs to the parent object
    Send(kind: ClientMessageKind, ...data) {//data is an array of parameters to this func, where every element (after first) is an object. First param can also not be an object in some cases
        if (data.length < 1) throw new E('Not enough arguments to send data! kind;data:', kind, data) //the first argument must always be the data to send. Other params may be objects with aditional keys to be added in the future
        this.#ws.send(JSON.stringify(Object.assign({}, { kind: kind, data: data[0] }, ...data.slice(1))))
        this.HandleInfo('sent:', kind, data)
    }

    //TODO this used to be well optimized datastructures back in 0.2.1, but had to simplify down, bcs it gets complicated
    RegisterHook(tables: string[], id: id, sql:string, params: object | null, rate_limit:RateLimit | null) {
        if (!(id in this.#hooks))
            this.#hooks[id] = { tables, sql, params, rate_limiter: rate_limit ? new RateLimiter(rate_limit) : null };
        else throw new E('MSG ID already registered as hook!', tables, id, sql, params);
        // this.HandleInfo('registered hook', id, sql);
    }
    UnRegisterHook(id: id) {
        if (!id || !(id in this.#hooks)) return false; //check if it exists

        delete this.#hooks[id];
        // this.HandleInfo('unregistered hook', id);
        return true;
    }
    // get hook_tables() { return Object.values(this.#hooks).map(h => h.table) }
    GetHooksForTables(tables: string[]=[]){
        return Object.entries(this.#hooks)
            .filter(h => h[1].tables.some(t => tables.includes(t)))
            .map(h => { return { id: h[0], sql: h[1].sql, params: h[1].params }})
            // .flat() //flatten because all hooks are actually arrays of hooks, since a single table can have many sql queries involving it. But for simplicity of iteration, we dont care for it here. We just want to iter all of these objs of a table
    }

    get authenticated() { return this.#authenticated }
    async Authenticate(auth_func:Function, ...params) { //auth func can return any truthy or falsy value, the client will only receive a boolean, so its safe to set it to some credential or id or smth, as this would be accessible and useful to you when checking the session access to tables
        const auth:boolean = await auth_func(...params)
        this.#authenticated = auth
        return auth
    }

    HasPermFor(verb = '', key = '') { return verb in this.#perms && this.#perms[verb].includes(key) }
    AddPermFor(verb = '', key = '') {
        if (verb in this.#perms) {
            if (!this.#perms[verb].includes(key))
                this.#perms[verb].push(key);
        }
        else this.#perms[verb] = [key];
    }

    last_seen_now(){
        this.last_seen = new Date().toISOString()
    }
}