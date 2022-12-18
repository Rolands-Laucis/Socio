//https://stackoverflow.com/questions/38946112/es6-import-error-handling
try { //for my logger
    var { info, log, error, done, soft_error, setPrefix, setShowTime } = await import('@rolands/log'); setPrefix('Socio Client'); setShowTime(false);
} catch (e) {
    console.log('[Socio Client ERROR] IMPORT:', e)
    var info:any = (...objs: any[]) => console.log('[Socio Client]', ...objs),
        done: any = (...objs: any[]) => console.log('[Socio Client]', ...objs),
        log: any = (...objs: any[]) => console.log('[Socio Client]', ...objs),
        soft_error: any = (...objs: any[]) => console.log('[Socio Client]', ...objs);
}

//libs
import { WebSocket, ClientOptions } from 'ws'; //https://github.com/websockets/ws https://github.com/websockets/ws/blob/master/doc/ws.md

import { LogHandler, E, err } from './logging'
import { id } from './utils';

//types
type MessageDataObj = { id: id, verb?: string, table?: string, status?:string, result?:string|object|boolean };
type QueryObjectFunctionSuccess = ((res: object) => void) | null;
type QueryObjectFunction = { success: QueryObjectFunctionSuccess, error?: Function};
type QueryObject = { sql: string, params?: object | null, f: QueryObjectFunction[] }

//"Because he not only wants to perform well, he wants to be well received — and the latter lies outside his control." /Epictetus/
export class SocioClient extends LogHandler {
    // private:
    #ws: WebSocket | null = null;
    #client_id:id = '';
    #is_ready: Function | boolean = false
    #authenticated=false

    #queries: { [key: string]: QueryObject | Function } = {} //id:QueryObject
    #perms: { [key: string]: string[]} = {} //verb:[tables strings] keeps a dict of access permissions of verb type and to which tables this session has been granted. This is not safe, the backend does its own checks anyway.

    static #key = 0 //all instances will share this number, such that they are always kept unique. Tho each of these clients would make a different session on the backend, but still

    //public:
    name:string;
    verbose:boolean;
    key_generator: (() => number | string) | undefined;

    constructor(url: string, { ws_opts = {}, name = '', verbose = false, keep_alive = true, reconnect_tries = 1 }: { ws_opts?: ClientOptions, name?: string, verbose?: boolean, keep_alive?: boolean, reconnect_tries?:number} = {}) {
        super(info, soft_error);

        if (window || undefined && url.startsWith('ws://'))
            info('UNSECURE WEBSOCKET URL CONNECTION! Please use wss:// and https:// protocols in production to protect against man-in-the-middle attacks.')

        //public:
        this.name = name
        this.verbose = verbose //It is recommended to turn off verbose in prod.
        
        this.#connect(url, ws_opts, keep_alive, verbose, reconnect_tries)
    }

    #connect(url: string, ws_opts: ClientOptions, keep_alive: boolean, verbose: boolean, reconnect_tries:number){
        this.#ws = new WebSocket(url, ws_opts)
        if (keep_alive && reconnect_tries)
            this.#ws.addEventListener("close", () => { 
                this.HandleError(new E(`WebSocket closed. Retrying...`, this.name)); 
                this.#connect(url, ws_opts, keep_alive, verbose, reconnect_tries - 1)
            }); // <- rise from your grave!

        //@ts-ignore
        this.#ws.addEventListener('message', this.#message.bind(this));
    }

    #message(req: Buffer | ArrayBuffer | Buffer[], isBinary: Boolean) {
        try{
            const { kind, data }: { kind: string; data: MessageDataObj } = JSON.parse(req.toString())
            this.HandleInfo('recv:', kind, data)

            switch (kind) {
                case 'CON':
                    //@ts-ignore
                    this.#client_id = data;
                    //@ts-ignore
                    this.#is_ready(true); //resolve promise to true
                    if (this.verbose) done(`Socio WebSocket connected.`, this.name);

                    this.#is_ready = true;
                    break;
                case 'UPD':
                    this.#FindID(kind, data?.id);
                    (this.#queries[data.id] as QueryObject).f.forEach(f => f[data.status as string](data.result)); //status might be success or error, and error might not be defined
                    break;
                case 'SQL':
                    this.#HandleBasicPromiseMessage(kind, data)
                    break;
                case 'PONG': 
                    this.#FindID(kind, data?.id)    
                    this.HandleInfo('pong', data?.id); 
                    break;
                case 'AUTH':
                    this.#FindID(kind, data?.id)
                    if (data?.result !== true)
                        this.HandleInfo(`AUTH returned FALSE, which means websocket has not authenticated.`);

                    this.#authenticated = data?.result === true;
                    (this.#queries[data.id] as Function)(this.#authenticated); //result should be either True or False to indicate success status
                    delete this.#queries[data.id] //clear memory
                    break;
                case 'PERM':
                    this.#FindID(kind, data?.id)
                    if (data?.result !== true) {
                        this.HandleInfo(`PERM returned FALSE, which means websocket has not been granted perm for ${data?.verb} on ${data?.table}.`);
                    } else {//add to perms
                        if ((data?.verb as string) in this.#perms) {
                            if (!this.#perms[(data?.verb as string)].includes((data?.table as string)))
                                this.#perms[(data?.verb as string)].push((data?.table as string));
                        }
                        else this.#perms[(data?.verb as string)] = [(data?.table as string)];
                    }

                    (this.#queries[data.id] as Function)(data?.result === true); //result should be either True or False to indicate success status
                    delete this.#queries[data.id] //clear memory
                    break;
                case 'UNREG':
                    this.#HandleBasicPromiseMessage(kind, data)
                    break;
                case 'ERR': 
                    this.HandleError(`Request to DB returned ERROR response for MSG ID ${data.id}`)
                    break;
                // case '': break;
                default: throw new E(`Unrecognized message kind!`, kind, data);
            }
        } catch (e:err) { this.HandleError(e) }
    }

    //private method - accepts infinite arguments of data to send and will append these params as new key:val pairs to the parent object
    #send(kind='', ...data){ //data is an array of parameters to this func, where every element (after first) is an object. First param can also not be an object in some cases
        if(data.length < 1) soft_error('Not enough arguments to send data! kind;data:', kind, ...data) //the first argument must always be the data to send. Other params may be objects with aditional keys to be added in the future
        this.#ws?.send(JSON.stringify(Object.assign({}, { client_id: this.#client_id, kind: kind, data:data[0] }, ...data.slice(1))))
        this.HandleInfo('sent:', kind, data)
    }

    //subscribe to an sql query. Can add multiple callbacks where ever in your code, if their sql queries are identical
    //returns the created ID for that query, to use to unsubscribe all callbacks to the query
    subscribe({ sql = '', params = null } : {sql?:string, params?:object| null} = {}, callback: QueryObjectFunctionSuccess = null, status_callbacks: {error?: (e:string) => void}){
        //callback is the success standard function, that gets called, when the DB sends an update of its data
        //status_callbacks is an optional object, that expects 1 optional key - "error", and it must be a callable function, that receives 1 arg - the error msg.
        try{
            //@ts-ignore
            const found = Object.entries(this.#queries).find(q => q[1].sql === sql && q[1].params === params);
            const callbacks: QueryObjectFunction = { success: callback, ...status_callbacks };

            if (found){
                (this.#queries[found[0]] as QueryObject).f.push(callbacks);
                return found[0] //the ID of the query
            }
            else {
                const id = this.#genKey
                this.#queries[id] = { sql: sql, params: params, f: [callbacks] }
                this.#send('REG', { id: id, sql: sql, params: params })
                return id //the ID of the query
            }
        } catch (e: err) { this.HandleError(e); return null; }
    }
    async unsubscribe(id: id, force=false) {
        try {
            if (id in this.#queries){
                if(force)//will first delete from here, to not wait for server response
                    delete this.#queries[id];
                
                //set up new msg to the backend informing a wish to unregister query.
                const msg_id = this.#genKey;
                const prom = new Promise((res) => {
                    this.#queries[msg_id] = res
                })
                this.#send('UNREG', { id: msg_id, unreg_id:id })

                const res = await prom; //await the response from backend
                if(res)//if successful, then remove the subscribe from the client
                    delete this.#queries[id];
                return res;//forward the success status to the developer
            }
            else
                throw new E('Cannot unsubscribe query, because provided ID is not currently tracked.', id);
        } catch (e:err) { this.HandleError(e) }
    }
    query(sql='', params=null){
        try{
            //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
            const id = this.#genKey;
            const prom = new Promise((res) => {
                this.#queries[id] = res
            })

            //send off the request, which will be resolved in the message handler
            this.#send('SQL', { id: id, sql: sql, params: params })
            return prom
        } catch (e: err) { this.HandleError(e); return null; }
    }
    //sends a ping with either the user provided number or an auto generated number, for keeping track of packets and debugging
    ping(num=0){
        this.#send('PING', { id: num || this.#genKey })
    }

    authenticate(params:object={}){ //params here can be anything, like username and password stuff etc. The backend server auth function callback will receive this entire object
        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const id = this.#genKey;
        const prom = new Promise((res) => {
            this.#queries[id] = res
        })
        this.#send('AUTH', { id: id, params: params })
        return prom
    }
    get authenticated() { return this.#authenticated === true }
    askPermission(verb='', table='') {//ask the backend for a permission on a table with the SQL verb u want to perform on it, i.e. SELECT, INSERT etc.
        //if the perm already exists, lets not bother the poor server :)
        if (verb in this.#perms && this.#perms[verb].includes(table)) 
            return true

        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const id = this.#genKey;
        const prom = new Promise((res) => {
            this.#queries[id] = res
        })
        this.#send('PERM', { id: id, verb:verb, table:table })
        return prom
    }
    hasPermFor(verb = '', table = ''){ return verb in this.#perms && this.#perms[verb].includes(table)}
    

    //generates a unique key either via static counter or user provided key gen func
    get #genKey(): id {
        if (this?.key_generator)
            return this.key_generator()
        else{
            SocioClient.#key += 1
            return SocioClient.#key
        }
    }
    //checks if the ID of a query exists (i.e. has been registered), otherwise rejects and logs
    #FindID(kind: string, id: id) {
        if (!(id in this.#queries))
            throw new E(`${kind} message for unregistered SQL query! msg_id -`, id)
    }
    #HandleBasicPromiseMessage(kind:string, data:MessageDataObj){
        this.#FindID(kind, data?.id)
        //@ts-ignore
        this.#queries[data.id](data.result);
        delete this.#queries[data.id] //clear memory
    }

    get client_id(){return this.#client_id}
    ready() { return new Promise(res => this.#is_ready = res) }
}