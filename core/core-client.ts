//https://stackoverflow.com/questions/38946112/es6-import-error-handling

import { LogHandler, E, err, log, info, done } from './logging.js'
import b64 from 'base64-js'

//types
import type { id, PropKey, PropValue, CoreMessageKind, ClientMessageKind, Bit } from './types.js'
import type { RateLimit } from './ratelimit.js'
import type { SocioFiles } from './types.js';
type MessageDataObj = { id: id, verb?: string, table?: string, status?:string|number, result?:string|object|boolean|PropValue|number, prop?:PropKey, data?:object, files?:SocioFiles };
type SubscribeCallbackObjectSuccess = ((res: object | object[]) => void) | null;
type SubscribeCallbackObject = { success: SubscribeCallbackObjectSuccess, error?: Function};
type QueryObject = { sql: string, params?: object | null, onUpdate: SubscribeCallbackObject }

type PropUpdateCallback = ((new_val: PropValue) => void) | null;
export type SocioClientOptions = { name?: string, verbose?: boolean, keep_alive?: boolean, reconnect_tries?: number, persistent?:boolean };

//"Because he not only wants to perform well, he wants to be well received  —  and the latter lies outside his control." /Epictetus/
export class SocioClient extends LogHandler {
    // private:
    #ws: WebSocket | null = null;
    #client_id:id = '';
    #latency:number;
    #is_ready: Function | boolean = false;
    #authenticated=false;

    #queries: Map<id, QueryObject | Function> = new Map(); //keeps a dict of all subscribed queries
    #props: Map<PropKey, { [id: id]: PropUpdateCallback }> = new Map();

    static #key = 1; //all instances will share this number, such that they are always kept unique. Tho each of these clients would make a different session on the backend, but still

    //public:
    name:string;
    verbose:boolean;
    key_generator: (() => number | string) | undefined;
    lifecycle_hooks: { [key: string]: Function | null; } = { discon:null, msg:null, cmd:null};
    persistent:boolean=false;
    //If the hook returns a truthy value, then it is assumed, that the hook handled the msg and the lib will not. Otherwise, by default, the lib handles the msg.
    //discon has to be an async function, such that you may await the new ready(), but socio wont wait for it to finish.

    constructor(url: string, { name = 'Main', verbose = false, keep_alive = true, reconnect_tries = 1, persistent=false }: SocioClientOptions = {}) {
        super({ verbose, prefix: 'SocioClient' });

        if (window || undefined && url.startsWith('ws://'))
            this.info('UNSECURE WEBSOCKET URL CONNECTION! Please use wss:// and https:// protocols in production to protect against man-in-the-middle attacks.')

        //public:
        this.name = name
        this.verbose = verbose //It is recommended to turn off verbose in prod.
        this.persistent = persistent;
        
        this.#latency = (new Date()).getTime();
        this.#connect(url, keep_alive, verbose, reconnect_tries);
    }
    get ws() { return this.#ws; } //the WebSocket instance has some useful properties https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#instance_properties

    async #connect(url: string, keep_alive: boolean, verbose: boolean, reconnect_tries:number){
        this.#ws = new WebSocket(url)
        if (keep_alive && reconnect_tries)
            this.#ws.addEventListener("close", () => {
                this.HandleError(new E(`WebSocket closed. Retrying...`, this.name));
                this.#resetConn(); //invalidate any state this session had
                this.#connect(url, keep_alive, verbose, reconnect_tries - 1); //reconnect

                //pass the object to the discon hook, if it exists
                if (this.lifecycle_hooks.discon)//discon has to be an async function, such that you may await the new ready(), but socio wont wait for it to finish.
                    this.lifecycle_hooks.discon(this.name, this.#client_id, url, keep_alive, verbose, reconnect_tries - 1); //here you can await ready() and reauth and regain all needed perms
            });

        this.#ws.addEventListener('message', this.#message.bind(this));
    }
    #resetConn() {
        this.#client_id = '';
        this.#ws = null;
        this.#latency = Infinity;
        this.#is_ready = false;
        this.#authenticated = false;
        this.#queries.clear();
        this.#props.clear();
    }

    async #message(event: MessageEvent) {
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
                    this.#latency = (new Date()).getTime() - this.#latency;

                    if (this.persistent) {
                        await this.#TryReconnect(); //try to reconnect with existing token in local storage
                        await this.#GetReconToken(); //get new recon token and push to local storage
                    }

                    if (this.#is_ready !== false && typeof this.#is_ready === "function")
                        this.#is_ready(true); //resolve promise to true
                    else
                        this.#is_ready = true;
                    if (this.verbose) this.done(`Socio WebSocket connected.`, this.name);

                    this.#is_ready = true;
                    break;
                case 'UPD':
                    this.#FindID(kind, data?.id);
                    (this.#queries.get(data.id) as QueryObject).onUpdate[data.status as string](data.result); //status might be success or error, and error might not be defined
                    break;
                case 'PONG': 
                    this.#FindID(kind, data?.id)    
                    this.HandleInfo('pong', data?.id); 
                    break;
                case 'AUTH':
                    this.#FindID(kind, data?.id)
                    if (data?.result as Bit !== 1)
                        this.HandleInfo(`AUTH returned FALSE, which means websocket has not authenticated.`);

                    this.#authenticated = data?.result as Bit === 1;
                    (this.#queries.get(data.id) as Function)(this.#authenticated); //result should be either True or False to indicate success status
                    this.#queries.delete(data.id) //clear memory
                    break;
                case 'GET_PERM':
                    this.#FindID(kind, data?.id)
                    if (data?.result as Bit !== 1) 
                        this.HandleInfo(`Server rejected grant perm for ${data?.verb} on ${data?.table}.`);

                    (this.#queries.get(data.id) as Function)(data?.result as Bit === 1); //result should be either True or False to indicate success status
                    this.#queries.delete(data.id) //clear memory
                    break;
                case 'RES':
                    this.#HandleBasicPromiseMessage(kind, data)
                    break;
                case 'PROP_UPD':
                    if(data?.prop && data?.id && data?.result as Bit){
                        const prop = this.#props.get(data.prop as string);
                        if (prop && prop[data.id as id] && typeof prop[data.id as id] === 'function'){
                            //@ts-expect-error
                            prop[data.id as id](data.result as PropValue);
                        }//@ts-expect-error 
                        else throw new E('Prop UPD called, but subscribed prop does not have a callback. data; callback', data, prop[data.id as id]);
                        if (this.#queries.has(data.id))
                            (this.#queries.get(data.id) as Function)(data.result); //resolve the promise
                    }else throw new E('Not enough prop info sent from server to perform prop update.', data)
                    break;
                case 'CMD': if(this.lifecycle_hooks?.cmd) this.lifecycle_hooks.cmd(data?.data); break; //the server pushed some data to this client, let the dev handle it
                case 'ERR'://The result field is sometimes used as a cause of error msg on the backend
                    if (typeof this.#queries.get(data.id) == 'function')
                        (this.#queries.get(data.id) as Function)();

                    this.HandleError(new E(`Request to Server returned ERROR response for query id, reason #[err-msg-kind]`, data?.id, data?.result as Bit));
                    break;
                case 'RECON': 
                    this.#FindID(kind, data?.id);
                    //@ts-expect-error
                    this.#queries.get(data.id)(data);
                    this.#queries.delete(data.id); //clear memory
                    break;
                case 'RECV_FILES':
                    this.#FindID(kind, data?.id);
                    
                    if (data?.result && data?.files){
                        const files = ParseSocioFiles(data?.files as SocioFiles);
                        //@ts-expect-error
                        this.#queries.get(data.id)(files);
                    } else {
                        //@ts-expect-error
                        this.#queries.get(data.id)(null);
                        throw new E('File receive either bad result or no files.\nResult:', data?.result, '\nfiles received:', Object.keys(data?.files || {}).length)
                    };

                    this.#queries.delete(data.id); //clear memory
                    break;
                // case '': break;
                default: throw new E(`Unrecognized message kind!`, kind, data);
            }
        } catch (e:err) { this.HandleError(e) }
    }

    //accepts infinite arguments of data to send and will append these params as new key:val pairs to the parent object
    Send(kind: CoreMessageKind, ...data){ //data is an array of parameters to this func, where every element (after first) is an object. First param can also not be an object in some cases
        try{
            if (data.length < 1) throw new E('Not enough arguments to send data! kind;data:', kind, ...data); //the first argument must always be the data to send. Other params may be objects with aditional keys to be added in the future
            this.#ws?.send(JSON.stringify(Object.assign({}, { kind, data: data[0] }, ...data.slice(1))));
            this.HandleInfo('sent:', kind, data);
        } catch (e: err) { this.HandleError(e); }
    }
    async SendFiles(files:File[], other_data:object|undefined=undefined){
        const proc_files: SocioFiles = {}; //my own kind of FormData, specific for files, because FormData is actually a very riggid type

        //add each file
        for(const file of files){
            //relevant info about files is stored in meta
            const meta = {
                lastModified: file.lastModified,
                size: file.size,
                type: file.type
            };
            proc_files[file.name] = { meta, bin: b64.fromByteArray(new Uint8Array(await file.arrayBuffer()))}; //this is the best way that i could find. JS is really unhappy about binary data
        }

        //create the server request as usual
        const {id, prom} = this.CreateQueryPromise();
        const socio_form_data = { id, files: proc_files }
        if(other_data)
            socio_form_data['data'] = other_data; //add the other data if exists
        this.Send('UP_FILES', socio_form_data);

        return prom;
    }
    SendBinary(blob: Blob | ArrayBuffer | ArrayBufferView) { //send binary. Unfortunately, it is not useful for me to invent my own byte formats and build functionality. You can tho. This is just low level access.
        if (this.#queries.get('BLOB')) throw new E('BLOB already being uploaded. Wait until the last query completes!');

        this.#ws?.send(blob);
        this.HandleInfo('sent: BLOB');

        return new Promise((res) => {
            this.#queries.set('BLOB', res);
        });
    }
    CreateQueryPromise(){
        //https://advancedweb.hu/how-to-add-timeout-to-a-promise-in-javascript/ should implement promise timeouts
        const id = this.GenKey;
        const prom = new Promise((res) => {
            this.#queries.set(id, res);
        });
        return {id, prom};
    }

    //subscribe to an sql query. Can add multiple callbacks where ever in your code, if their sql queries are identical
    //returns the created ID for that query, to use to unsubscribe all callbacks to the query
    Subscribe({ sql = '', params = null }: { sql?: string, params?: object | null } = {}, onUpdate: SubscribeCallbackObjectSuccess = null, status_callbacks: { error?: (e: string) => void } = {}, rate_limit: RateLimit | null = null): id | null{
        //params for sql is the object that will be passed as params to your query func

        //onUpdate is the success standard function, that gets called, when the DB sends an update of its data
        //status_callbacks is an optional object, that expects 1 optional key - "error", and it must be a callable function, that receives 1 arg - the error msg.
        
        if (typeof onUpdate !== "function") throw new E('Subscription onUpdate is not function, but has to be.');
        if (status_callbacks?.error && typeof status_callbacks.error !== "function") throw new E('Subscription error is not function, but has to be.');
        try {
            const id = this.GenKey
            const callbacks: SubscribeCallbackObject = { success: onUpdate, ...status_callbacks };

            this.#queries.set(id, { sql, params, onUpdate: callbacks });
            this.Send('SUB', { id, sql, params, rate_limit });

            return id //the ID of the query
        } catch (e: err) { this.HandleError(e); return null; }
    }
    SubscribeProp(prop_name: PropKey, onUpdate: PropUpdateCallback, rate_limit: RateLimit | null = null):void{
        //the prop name on the backend that is a key in the object

        if (typeof onUpdate !== "function") throw new E('Subscription onUpdate is not function, but has to be.');
        try {
            const id = this.GenKey;
            const prop = this.#props.get(prop_name);

            if (prop)//add the callback
                prop[id] = onUpdate;
            else {//init the prop object
                this.#props.set(prop_name, { [id]: onUpdate });
                this.Send('PROP_SUB', { id, prop: prop_name, rate_limit })
            }
        } catch (e: err) { this.HandleError(e); }
    }
    async Unsubscribe(sub_id: id, force=false) {
        try {
            if (this.#queries.has(sub_id)){
                if(force)//will first delete from here, to not wait for server response
                    this.#queries.delete(sub_id);
                
                //set up new msg to the backend informing a wish to unregister query.
                const { id, prom } = this.CreateQueryPromise();
                this.Send('UNSUB', { id, unreg_id: sub_id })

                const res = await prom; //await the response from backend
                if(res === 1)//if successful, then remove the subscribe from the client
                    this.#queries.delete(sub_id);
                return res;//forward the success status to the developer
            }
            else
                throw new E('Cannot unsubscribe query, because provided ID is not currently tracked.', sub_id);
        } catch (e:err) { this.HandleError(e) }
    }
    async UnsubscribeProp(prop_name: PropKey, force = false) {
        try {
            if (this.#props.get(prop_name)) {
                if (force)//will first delete from here, to not wait for server response
                    this.#props.delete(prop_name);

                //set up new msg to the backend informing a wish to unregister query.
                const {id, prom} = this.CreateQueryPromise();
                this.Send('PROP_UNSUB', { id, prop: prop_name })

                const res = await prom; //await the response from backend
                if (res === 1)//if successful, then remove the subscribe from the client
                    this.#props.delete(prop_name);
                return res;//forward the success status to the developer
            }
            else
                throw new E('Cannot unsubscribe query, because provided prop_name is not currently tracked.', prop_name);
        } catch (e: err) { this.HandleError(e) }
    }
    UnsubscribeAll({props=true, queries=true, force=false} = {}){
        if(props)
            for (const p of [...this.#props.keys()])
                this.UnsubscribeProp(p, force);
        if(queries)
            for (const q of [...this.#queries.keys()])
                this.Unsubscribe(q, force);
    }

    Query(sql: string, params: object | null = null){
        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const { id, prom } = this.CreateQueryPromise();

        //send off the request, which will be resolved in the message handler
        this.Send('SQL', { id, sql: sql, params: params });
        return prom;
    }
    SetProp(prop: PropKey, new_val:PropValue){
        try {
            //check that prop is subbed
            if (!this.#props.get(prop))
                throw new E('Prop must be first subscribed to set its value!', prop);

            //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
            const { id, prom } = this.CreateQueryPromise();

            //send off the request, which will be resolved in the message handler
            this.Send('PROP_SET', { id, prop: prop, prop_val:new_val });
            return prom;
        } catch (e: err) { this.HandleError(e); return null; }
    }
    GetProp(prop: PropKey) {
        const { id, prom } = this.CreateQueryPromise();
        this.Send('PROP_GET', { id, prop: prop });
        return prom;
    }
    Serv(data: any){
        const { id, prom } = this.CreateQueryPromise();
        this.Send('SERV', { id, data });
        return prom;
    }
    GetFiles(data: any): Promise<File[]>{
        const { id, prom } = this.CreateQueryPromise();
        this.Send('GET_FILES', { id, data });
        return prom as Promise<File[]>;
    }
    //sends a ping with either the user provided number or an auto generated number, for keeping track of packets and debugging
    Ping(num=0){
        this.Send('PING', { id: num || this.GenKey })
    }

    async Authenticate(params:object={}){ //params here can be anything, like username and password stuff etc. The backend server auth function callback will receive this entire object
        const { id, prom } = this.CreateQueryPromise();
        this.Send('AUTH', { id, params: params });
        return prom as Promise<{ id: id, result: Bit }>;
    }
    get authenticated() { return this.#authenticated === true }
    AskPermission(verb = '', table = '') {//ask the backend for a permission on a table with the SQL verb u want to perform on it, i.e. SELECT, INSERT etc.
        const { id, prom } = this.CreateQueryPromise();
        this.Send('GET_PERM', { id, verb:verb, table:table })
        return prom as Promise<{ id: id, result: Bit }>;
    }
    
    //generates a unique key either via static counter or user provided key gen func
    get GenKey(): id {
        return this?.key_generator ? this.key_generator() : ++SocioClient.#key;
    }
    //checks if the ID of a query exists, otherwise rejects and logs
    #FindID(kind: string, id: id) {
        if (!this.#queries.has(id))
            throw new E(`${kind} message for unregistered SQL query! msg_id -`, id);
    }
    #HandleBasicPromiseMessage(kind:string, data:MessageDataObj){
        this.#FindID(kind, data?.id);
        //@ts-expect-error
        this.#queries.get(data.id)(data?.result as Bit);
        this.#queries.delete(data.id); //clear memory
    }

    get client_id(){return this.#client_id}
    get latency() { return this.#latency } //shows the latency in ms of the initial connection handshake to determine network speed for this session. Might be useful to inform the user, if its slow.
    ready(): Promise<boolean> { return this.#is_ready === true ? (new Promise(res => res(true))) : (new Promise(res => this.#is_ready = res)) }
    Close() { this.#ws?.close(); }

    async #GetReconToken(name:string = this.name){
        const { id, prom } = this.CreateQueryPromise();

        //ask the server for a one-time auth token
        this.Send('RECON', { id, data: { type: 'GET' } });
        const token = await prom as string; //await the token

        //save down the token. Name is used to map new instance to old instance by same name.
        localStorage.setItem(`Socio_recon_token_${name}`, token); //https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage localstorage is origin locked, so should be safe to store this here
    }
    RefreshReconToken(name: string = this.name){return this.#GetReconToken(name);}

    async #TryReconnect(name: string = this.name){
        const key = `Socio_recon_token_${name}`
        const token = localStorage.getItem(key);

        if (token){
            localStorage.removeItem(key); //one-time use

            const { id, prom } = this.CreateQueryPromise();

            //ask the server for a reconnection to an old session via our one-time token
            this.Send('RECON', { id, data: { type: 'POST', token } });
            const res = await prom;

            //@ts-ignore
            if(res?.status){
                //@ts-ignore
                this.#authenticated = res?.result?.auth;

                //@ts-ignore
                this.done(`${this.name} reconnected successfully. ${res?.result?.old_client_id} -> ${this.#client_id} (old client ID -> new/current client ID)`)
            }
            else
                this.HandleError(new E('Failed to reconnect', res));
        }
    }

    LogMaps(){
        log('queries', [...this.#queries.entries()])
        log('props', [...this.#props.entries()])
    }
}

function ParseSocioFiles(files:SocioFiles){
    if(!files) return [];
    const files_array: File[] = [];
    for(const [filename, filedata] of Object.entries(files))
        files_array.push(new File([b64.toByteArray(filedata.bin)], filename, { type: filedata.meta.type, lastModified: filedata.meta.lastModified }));
    return files_array;
}