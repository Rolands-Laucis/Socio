//libs
import { WebSocket } from 'ws'; //https://github.com/websockets/ws https://github.com/websockets/ws/blob/master/doc/ws.md

import { log, info, soft_error, setPrefix, setShowTime } from '@rolands/log'; setPrefix('SocioSession'); setShowTime(false); //for my logger
import { LogHandler, E } from './logging'
import { id } from './utils'

type HookObj = {
    id: id, 
    sql: string, 
    params: object | null
}

//NB! some fields in these variables are private for safety reasons, but also bcs u shouldnt be altering them, only if through my defined ways. They are mostly expected to be constants.
//whereas public variables are free for you to alter freely at any time during runtime.

//Homo vitae commodatus non donatus est. - Man's life is lent, not given. /Syrus/
export class SocioSession extends LogHandler {
    //private:
    #client_id:string; //unique ID for this session for my own purposes
    #ws: WebSocket;
    #hooks: { [key: string]: HookObj[] ; } = {}//table_name:[{id, sql, params}]
    #authenticated = false //usually boolean, but can be any truthy or falsy value to show the state of the session. Can be a token or smth for your own use, bcs the client will only receive a boolean
    #perms: { [key: string]: string[]; } = {} //verb:[tables strings] keeps a dict of access permissions of verb type and to which tables this session has been granted

    //public:
    verbose = true
    last_seen: string | null = null //date and time of last seen active session

    constructor(client_id: string, browser_ws_conn: WebSocket, { verbose = true, default_perms = {} } = {}) {
        super(info, soft_error);
        
        //private:
        this.#client_id = client_id //unique ID for this session for my own purposes
        this.#ws = browser_ws_conn
        this.#perms = default_perms

        //public:
        this.verbose = verbose

        this.last_seen_now()
        // this.HandleInfo('New session created', client_id)
    }

    get client_id() { return this.#client_id }

    //accepts infinite arguments of data to send and will append these params as new key:val pairs to the parent object
    Send(kind = '', ...data) {//data is an array of parameters to this func, where every element (after first) is an object. First param can also not be an object in some cases
        if (data.length < 1) throw new E('Not enough arguments to send data! kind;data:', kind, data) //the first argument must always be the data to send. Other params may be objects with aditional keys to be added in the future
        this.#ws.send(JSON.stringify(Object.assign({}, { kind: kind, data: data[0] }, ...data.slice(1))))
        this.HandleInfo('sent:', kind, data)
    }

    RegisterHook(table = '', id: id = '', sql = '', params: object | null = null) { //TODO this is actually very bad
        const hook_obj: HookObj = { id: id, sql: sql, params: params }
        if (table in this.#hooks && !this.#hooks[table].includes(hook_obj))
            this.#hooks[table].push(hook_obj);
        else
            this.#hooks[table] = [hook_obj];
    }
    UnRegisterHook(id: id) {
        if(!id) return false; //check if it exists

        const found_table = Object.entries(this.#hooks).find(entry => entry[1].find(hook => hook.id === id))
        if(!found_table || !found_table[0])
            return false 

        //iterate all the hooks of this table for this client session
        for (const hook of this.#hooks[found_table[0]]){
            if(hook.id == id){
                const i = this.#hooks[found_table[0]].indexOf(hook) //get which object it is in the array
                this.#hooks[found_table[0]].splice(i, 1) //remove the object from the array
                return true; //return early with success
            }
        }

        return false;
    }
    get hook_tables() { return Object.keys(this.#hooks) }
    GetHooksForTables(tables: string[]=[]){
        return Object.entries(this.#hooks)
            .filter(h => tables.includes(h[0]))
            .map(h => h[1])
            .flat() //flatten because all hooks are actually arrays of hooks, since a single table can have many sql queries involving it. But for simplicity of iteration, we dont care for it here. We just want to iter all of these objs of a table
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