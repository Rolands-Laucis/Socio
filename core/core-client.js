"use strict";

//https://stackoverflow.com/questions/38946112/es6-import-error-handling
try { //for my logger
    var { info, log, error, done, soft_error, setPrefix, setShowTime } = await import('@rolands/log'); setPrefix('Socio Client'); setShowTime(false);
} catch (e) {
    console.log('[Socio Client ERROR] IMPORT:', e)
    var info = (...objs) => console.log('[Socio Client]', ...objs), 
    done = (...objs) => console.log('[Socio Client]', ...objs), 
    log = (...objs) => console.log('[Socio Client]', ...objs),
    soft_error = (...objs) => console.log('[Socio Client]', ...objs)
}

// import { QueryIsSelect, ParseSQLForTables } from 'socio/utils'
import { ParseSQLForTables, SocioArgHas, ParseQueryVerb } from './utils.js'

//"Because he not only wants to perform well, he wants to be well received — and the latter lies outside his control." /Epictetus/
export class SocioClient {
    // private:
    #queries = {} //id:[callback]
    #perms = {} //verb:[tables strings] keeps a dict of access permissions of verb type and to which tables this session has been granted. This is not safe, the backend does its own checks anyway.
    #is_ready = false
    #ws=null
    #ses_id = null
    static #key = 0 //all instances will share this number, such that they are always kept unique. Tho each of these clients would make a different session on the backend, but still

    constructor(url, {name = '', verbose=false, keep_alive=true, reconnect_tries=1} = {}) {
        if (window || undefined && url.startsWith('ws://'))
            info('UNSECURE WEBSOCKET URL CONNECTION! Please use wss:// and https:// protocols in production to protect against man-in-the-middle attacks.')

        //public:
        this.name = name
        this.verbose = verbose
        
        this.#connect(url, keep_alive, verbose, reconnect_tries)
        this.#ws.addEventListener('message', this.#message.bind(this));
    }

    #connect(url, keep_alive, verbose, reconnect_tries){
        this.#ws = new WebSocket(url)
        if (keep_alive && reconnect_tries)
            this.#ws.addEventListener("close", () => { 
                if (this.verbose) soft_error(`WebSocket closed. Retrying...`, this.name); 
                this.#connect(url, keep_alive, verbose, reconnect_tries - 1)
            }); // <- rise from your grave!
    }

    #message(e) {
        const { kind, data } = JSON.parse(e.data)
        if (this.verbose) info('recv:',kind, data)

        switch(kind){
            case 'CON': 
                this.#ses_id = data;
                this.#is_ready(true); //resolve promise to true
                if (this.verbose) done(`WebSocket connected.`, this.name); 

                this.#is_ready = undefined; //clear memory. Cannot delete private properties
                break;
            case 'UPD':
                if (this.#FindID(kind, data?.id))
                    this.#queries[data.id].f.forEach(f => f(data.result));
                break;
            case 'SQL':
                if (this.#FindID(kind, data?.id)){
                    this.#queries[data.id](data.result);
                    delete this.#queries[data.id] //clear memory
                }
                break;
            case 'PONG': if (this.verbose) info('pong', data?.id); break;
            case 'AUTH':
                if (this.#FindID(kind, data?.id)) {
                    if (data?.result !== true)
                        if (this.verbose) soft_error(`AUTH returned FALSE, which means websocket has not authenticated.`);

                    this.#queries[data.id](data?.result); //result should be either True or False to indicate success status
                    delete this.#queries[data.id] //clear memory
                }
                break;
            case 'PERM':
                if (this.#FindID(kind, data?.id)) {
                    if (data?.result?.granted !== true){
                        if (this.verbose) soft_error(`PERM returned FALSE, which means websocket has not been granted perm for ${data?.verb} ${data?.table}.`);
                    }else{//add to perms
                        if (verb in this.#perms) {
                            if (!this.#perms[verb].includes(key))
                                this.#perms[verb].push(key);
                        }
                        else this.#perms[verb] = [key];
                    }

                    this.#queries[data.id](data?.result?.granted); //result should be either True or False to indicate success status
                    delete this.#queries[data.id] //clear memory
                }
                break;
            // case '': break;
            default: info(`Unrecognized message kind! [${kind}] with data:`, data);
        }
    }

    //private method - accepts infinite arguments of data to send and will append these params as new key:val pairs to the parent object
    #send(kind='', ...data){ //data is an array of parameters to this func, where every element (after first) is an object. First param can also not be an object in some cases
        if(data.length < 1) soft_error('Not enough arguments to send data! kind;data:', kind, ...data) //the first argument must always be the data to send. Other params may be objects with aditional keys to be added in the future
        this.#ws.send(JSON.stringify(Object.assign({}, { client_id: this.#ses_id, kind: kind, data:data[0] }, ...data.slice(1))))
        if (this.verbose) info('sent:', kind, data)
    }

    //subscribe to an sql query. Can add multiple callbacks where ever in your code, if their sql queries are identical
    subscribe({ sql = '', params = null } = {}, callback = null, t=null){
        const found = Object.entries(this.#queries).find(q => q[1].sql === sql)

        if (found)
            this.#queries[found[0]].f.push(t ? callback.bind(t) : callback)
        else{
            const id = this.#gen_key
            this.#queries[id] = { sql: sql, f: [t ? callback.bind(t) : callback] }
            this.#send('REG', { id: id, sql: sql, params: params })
        }
    }
    query(sql='', params=null){
        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const id = this.#gen_key;
        const prom = new Promise((res) => { 
            this.#queries[id] = res
        })
        //send off the request, which will be resolved in the message handler
        this.#send('SQL', { id: id, sql: sql, params: params })
        return prom
    }
    //sends a ping with either the user provided number or an auto generated number, for keeping track of packets and debugging
    ping(num=0){
        this.#send('PING', { id: num || this.#gen_key })
    }

    authenticate(params={}){ //params here can be anything, like username and password stuff etc. The backend server auth function callback will receive this entire object
        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const id = this.#gen_key;
        const prom = new Promise((res) => {
            this.#queries[id] = res
        })
        this.#send('AUTH', { id: id, params: params })
        return prom
    }
    get_permission(verb='', table='') { //params here can be anything, like username and password stuff etc. The backend server auth function callback will receive this entire object
        //if the perm already exists, lets not bother the poor server :)
        if (verb in this.#perms && this.#perms[verb].includes(key)) 
            return true

        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const id = this.#gen_key;
        const prom = new Promise((res) => {
            this.#queries[id] = res
        })
        this.#send('PERM', { id: id, verb:verb, table:table })
        return prom
    }

    //generates a unique key either via static counter or user provided key gen func
    get #gen_key() {
        if (this?.key_generator)
            return this.key_generator()
        else{
            SocioClient.#key += 1
            return SocioClient.#key
        }
    }
    //checks if the ID of a query exists (i.e. has been registered), otherwise rejects and logs
    #FindID(kind, id) {
        if (id in this.#queries) return true
        else if (this.verbose) soft_error(`${kind} message for unregistered SQL query! id - [${id}]`)
        return false
    }

    get client_id(){return this.#ses_id}
    ready() { return new Promise(res => this.#is_ready = res) }
}