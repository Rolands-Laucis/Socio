//https://stackoverflow.com/questions/38946112/es6-import-error-handling

import { LogHandler, E, err, log, info, done } from './logging.js'

//types
import type { ClientOptions } from 'ws'; //https://github.com/websockets/ws https://github.com/websockets/ws/blob/master/doc/ws.md
import type { id, PropKey, PropValue, CoreMessageKind, ClientMessageKind } from './types.js'
import type { RateLimit } from './ratelimit.js'
type MessageDataObj = { id: id, verb?: string, table?: string, status?:string, result?:string|object|boolean|PropValue, prop?:PropKey };
type SubscribeCallbackObjectSuccess = ((res: object | object[]) => void) | null;
type SubscribeCallbackObject = { success: SubscribeCallbackObjectSuccess, error?: Function};
type QueryObject = { sql: string, params?: object | null, onUpdate: SubscribeCallbackObject }

type PropUpdateCallback = ((new_val: PropValue) => void) | null;

//"Because he not only wants to perform well, he wants to be well received  —  and the latter lies outside his control." /Epictetus/
export class SocioClient extends LogHandler {
    // private:
    #ws: WebSocket | null = null;
    #client_id:id = '';
    #latency:number;
    #is_ready: Function | boolean = false;
    #authenticated=false

    #queries: { [id: id]: QueryObject | Function } = {} //keeps a dict of all subscribed queries
    #props: { [prop_key: PropKey]: { [id: id]: PropUpdateCallback } } = {};
    #perms: { [verb: string]: string[]} = {}; //verb:[tables strings] keeps a dict of access permissions of verb type and to which tables this session has been granted. This is not safe, the backend does its own checks anyway.

    static #key = 1 //all instances will share this number, such that they are always kept unique. Tho each of these clients would make a different session on the backend, but still

    //public:
    name:string;
    verbose:boolean;
    key_generator: (() => number | string) | undefined;
    lifecycle_hooks: { [key: string]: Function | null; } = { discon:null, msg:null}
    //If the hook returns a truthy value, then it is assumed, that the hook handled the msg and the lib will not. Otherwise, by default, the lib handles the msg.

    constructor(url: string, { ws_opts = {}, name = '', verbose = false, keep_alive = true, reconnect_tries = 1 }: { ws_opts?: ClientOptions, name?: string, verbose?: boolean, keep_alive?: boolean, reconnect_tries?:number} = {}) {
        super({ verbose, prefix: 'SocioClient' });

        if (window || undefined && url.startsWith('ws://'))
            info('UNSECURE WEBSOCKET URL CONNECTION! Please use wss:// and https:// protocols in production to protect against man-in-the-middle attacks.')

        //public:
        this.name = name
        this.verbose = verbose //It is recommended to turn off verbose in prod.
        
        this.#latency = (new Date()).getTime();
        this.#connect(url, ws_opts, keep_alive, verbose, reconnect_tries)
    }

    #connect(url: string, ws_opts: ClientOptions, keep_alive: boolean, verbose: boolean, reconnect_tries:number){
        this.#ws = new WebSocket(url)
        if (keep_alive && reconnect_tries)
            this.#ws.addEventListener("close", () => {
                this.HandleError(new E(`WebSocket closed. Retrying...`, this.name));

                //pass the object to the discon hook, if it exists
                if (this.lifecycle_hooks.discon)
                    if (this.lifecycle_hooks.discon(this.name, this.#client_id, keep_alive, reconnect_tries))
                        return;

                //otherwise reconnect
                this.#connect(url, ws_opts, keep_alive, verbose, reconnect_tries - 1);
            }); // <- rise from your grave!
        
        this.#ws.addEventListener('message', this.#message.bind(this));
    }

    #message(event: MessageEvent) {
        try{
            const { kind, data }: { kind: ClientMessageKind; data: MessageDataObj } = JSON.parse(event.data)
            this.HandleInfo('recv:', kind, data)

            //let the developer handle the msg
            if (this.lifecycle_hooks.msg)
                if (this.lifecycle_hooks.msg(this.name,this.#client_id, kind, data))
                    return;

            switch (kind) {
                case 'CON':
                    //@ts-ignore
                    this.#client_id = data;//should just be a string
                    if (this.#is_ready !== false && typeof this.#is_ready === "function")
                        this.#is_ready(true); //resolve promise to true
                    else
                        this.#is_ready = true;
                    if (this.verbose) done(`Socio WebSocket connected.`, this.name);

                    this.#is_ready = true;
                    this.#latency = (new Date()).getTime() - this.#latency;
                    break;
                case 'UPD':
                    this.#FindID(kind, data?.id);
                    (this.#queries[data.id] as QueryObject).onUpdate[data.status as string](data.result); //status might be success or error, and error might not be defined
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
                case 'GET_PERM':
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
                case 'RES':
                    this.#HandleBasicPromiseMessage(kind, data)
                    break;
                case 'PROP_UPD':
                    if(data?.prop && data?.id && data?.result){
                        if (this.#props[data.prop as string] && this.#props[data.prop as string][data.id as id] && typeof this.#props[data.prop as string][data.id as id] === 'function'){
                            //@ts-ignore
                            this.#props[data.prop as string][data.id as id](data.result as PropValue);
                        } else throw new E('Prop UPD called, but subscribed prop does not have a callback. data; callback', data, this.#props[data.prop as string][data.id as id]);
                        if(data.id in this.#queries)
                            (this.#queries[data.id] as Function)(data.result); //resolve the promise
                    }else throw new E('Not enough prop info sent from server to perform prop update.', data)
                    break;
                case 'ERR'://when using this, make sure that the setup query is a promise func. The result field is used as a cause of error msg on the backend
                    this.#FindID(kind, data?.id);
                    (this.#queries[data.id] as Function)(null);
                    throw new E(`Request to DB returned ERROR response for query id, reason #[err-msg]`, data.id, data?.result);
                // case '': break;
                default: throw new E(`Unrecognized message kind!`, kind, data);
            }
        } catch (e:err) { this.HandleError(e) }
    }

    //private method - accepts infinite arguments of data to send and will append these params as new key:val pairs to the parent object
    #Send(kind: CoreMessageKind, ...data){ //data is an array of parameters to this func, where every element (after first) is an object. First param can also not be an object in some cases
        if(data.length < 1) throw new E('Not enough arguments to send data! kind;data:', kind, ...data) //the first argument must always be the data to send. Other params may be objects with aditional keys to be added in the future
        this.#ws?.send(JSON.stringify(Object.assign({}, { kind, data:data[0] }, ...data.slice(1))))
        this.HandleInfo('sent:', kind, data)
    }

    //subscribe to an sql query. Can add multiple callbacks where ever in your code, if their sql queries are identical
    //returns the created ID for that query, to use to unsubscribe all callbacks to the query
    subscribe({ sql = '', params = null }: { sql?: string, params?: object | null } = {}, onUpdate: SubscribeCallbackObjectSuccess = null, status_callbacks: { error?: (e: string) => void } = {}, rate_limit: RateLimit | null = null): id | null{
        //params for sql is the object that will be passed as params to your query func

        //onUpdate is the success standard function, that gets called, when the DB sends an update of its data
        //status_callbacks is an optional object, that expects 1 optional key - "error", and it must be a callable function, that receives 1 arg - the error msg.
        
        if (typeof onUpdate !== "function") throw new E('Subscription onUpdate is not function, but has to be.');
        if (status_callbacks?.error && typeof status_callbacks.error !== "function") throw new E('Subscription error is not function, but has to be.');
        try {
            const id = this.#GenKey
            const callbacks: SubscribeCallbackObject = { success: onUpdate, ...status_callbacks };

            this.#queries[id] = { sql, params, onUpdate: callbacks }
            this.#Send('REG', { id, sql, params, rate_limit })

            return id //the ID of the query
        } catch (e: err) { this.HandleError(e); return null; }
    }
    subscribeProp(prop_name: PropKey, onUpdate: PropUpdateCallback, rate_limit: RateLimit | null = null):void{
        //the prop name on the backend that is a key in the object

        if (typeof onUpdate !== "function") throw new E('Subscription onUpdate is not function, but has to be.');
        try {
            const id = this.#GenKey

            if (prop_name in this.#props)//add the callback
                this.#props[prop_name][id] = onUpdate;
            else {//init the prop object
                this.#props[prop_name] = { [id]: onUpdate };
                this.#Send('PROP_REG', { id, prop: prop_name, rate_limit })
            }
        } catch (e: err) { this.HandleError(e); }
    }
    async unsubscribe(id: id, force=false) {
        try {
            if (id in this.#queries){
                if(force)//will first delete from here, to not wait for server response
                    delete this.#queries[id];
                
                //set up new msg to the backend informing a wish to unregister query.
                const msg_id = this.#GenKey;
                const prom = new Promise((res) => {
                    this.#queries[msg_id] = res
                })
                this.#Send('UNREG', { id: msg_id, unreg_id:id })

                const res = await prom; //await the response from backend
                if(res === true)//if successful, then remove the subscribe from the client
                    delete this.#queries[id];
                return res;//forward the success status to the developer
            }
            else
                throw new E('Cannot unsubscribe query, because provided ID is not currently tracked.', id);
        } catch (e:err) { this.HandleError(e) }
    }
    async unsubscribeProp(prop_name: PropKey, force = false) {
        try {
            if (prop_name in this.#props) {
                if (force)//will first delete from here, to not wait for server response
                    delete this.#props[prop_name];

                //set up new msg to the backend informing a wish to unregister query.
                const msg_id = this.#GenKey;
                const prom = new Promise((res) => {
                    this.#queries[msg_id] = res
                })
                this.#Send('PROP_UNREG', { id: msg_id, prop: prop_name })

                const res = await prom; //await the response from backend
                if (res === true)//if successful, then remove the subscribe from the client
                    delete this.#props[prop_name];
                return res;//forward the success status to the developer
            }
            else
                throw new E('Cannot unsubscribe query, because provided prop_name is not currently tracked.', prop_name);
        } catch (e: err) { this.HandleError(e) }
    }
    unsubscribeAll({props=true, queries=true} = {}){
        if(props)
            Object.keys(this.#props).forEach(p => this.unsubscribeProp(p, true));
        if(queries)
            Object.keys(this.#queries).forEach(q => this.unsubscribe(q, true));
    }

    query(sql: string, params: object | null = null){
        try{
            //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
            const id = this.#GenKey;
            const prom = new Promise((res) => {
                this.#queries[id] = res
            })

            //send off the request, which will be resolved in the message handler
            this.#Send('SQL', { id: id, sql: sql, params: params })
            return prom
        } catch (e: err) { this.HandleError(e); return null; }
    }
    setProp(prop: PropKey, new_val:PropValue){
        try {
            //check that prop is subbed
            if (!(prop in this.#props))
                throw new E('Prop must be first subscribed to set its value!', prop);

            //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
            const id = this.#GenKey;
            const prom = new Promise((res) => {
                this.#queries[id] = res
            });

            //send off the request, which will be resolved in the message handler
            this.#Send('PROP_SET', { id: id, prop: prop, prop_val:new_val });
            return prom;
        } catch (e: err) { this.HandleError(e); return null; }
    }
    getProp(prop: PropKey) {
        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const id = this.#GenKey;
        const prom = new Promise((res) => {
            this.#queries[id] = res
        });

        //send off the request, which will be resolved in the message handler
        this.#Send('PROP_GET', { id: id, prop: prop });
        return prom;
    }
    serv(data:object){
        try {
            //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
            const id = this.#GenKey;
            const prom = new Promise((res) => {
                this.#queries[id] = res
            })

            //send off the request, which will be resolved in the message handler
            this.#Send('SERV', { id: id, data })
            return prom
        } catch (e: err) { this.HandleError(e); return null; }
    }
    //sends a ping with either the user provided number or an auto generated number, for keeping track of packets and debugging
    ping(num=0){
        this.#Send('PING', { id: num || this.#GenKey })
    }

    authenticate(params:object={}){ //params here can be anything, like username and password stuff etc. The backend server auth function callback will receive this entire object
        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const id = this.#GenKey;
        const prom = new Promise((res) => {
            this.#queries[id] = res
        })
        this.#Send('AUTH', { id: id, params: params })
        return prom
    }
    get authenticated() { return this.#authenticated === true }
    askPermission(verb='', table='') {//ask the backend for a permission on a table with the SQL verb u want to perform on it, i.e. SELECT, INSERT etc.
        //if the perm already exists, lets not bother the poor server :)
        if (verb in this.#perms && this.#perms[verb].includes(table)) 
            return true

        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const id = this.#GenKey;
        const prom = new Promise((res) => {
            this.#queries[id] = res
        })
        this.#Send('GET_PERM', { id: id, verb:verb, table:table })
        return prom
    }
    hasPermFor(verb = '', table = ''){ return verb in this.#perms && this.#perms[verb].includes(table)}
    
    //generates a unique key either via static counter or user provided key gen func
    get #GenKey(): id {
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
        this.#queries[data.id](data?.result);
        delete this.#queries[data.id] //clear memory
    }

    get client_id(){return this.#client_id}
    get latency() { return this.#latency } //shows the latency in ms of the initial connection handshake to determine network speed for this session. Might be useful to inform the user, if its slow.
    ready(): Promise<boolean> { return this.#is_ready === true ? (new Promise(res => res(true))) : (new Promise(res => this.#is_ready = res)) }
}