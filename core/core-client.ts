// Let those that play your clowns speak no more than is set down for them. /William Shakespeare/

import { LogHandler, E, err, log, info, done } from './logging.js';
import * as b64 from 'base64-js';

//types
import type { id, PropKey, PropValue, CoreMessageKind, ClientMessageKind, Bit } from './types.js';
import type { Cmd_ClientHook, Msg_ClientHook, Discon_ClientHook } from './types.js';
import type { RateLimit } from './ratelimit.js';
import type { SocioFiles } from './types.js';
import { MapReplacer, MapReviver, clamp } from './utils.js';
export type ClientMessageDataObj = { id: id, verb?: string, table?: string, status?:string|number, result?:string|object|boolean|PropValue|number, prop?:PropKey, data?:any, files?:SocioFiles };
type SubscribeCallbackObjectSuccess = ((res: object | object[]) => void) | null;
type SubscribeCallbackObject = { success: SubscribeCallbackObjectSuccess, error?: Function};
type QueryObject = { sql: string, params?: object | null, onUpdate: SubscribeCallbackObject }
type QueryPromise = { res: Function, prom:Promise<any> | null, start_buff: number, payload_size?:number };
type ProgressOnUpdate = (percentage: number) => void;

type PropUpdateCallback = ((new_val: PropValue) => void) | null;
export type SocioClientOptions = { name?: string, verbose?: boolean, keep_alive?: boolean, reconnect_tries?: number, persistent?:boolean, hard_crash?:boolean };

//"Because he not only wants to perform well, he wants to be well received  —  and the latter lies outside his control." /Epictetus/
export class SocioClient extends LogHandler {
    // private:
    #ws: WebSocket | null = null;
    #client_id:id = '';
    #latency:number;
    #is_ready: Function | boolean = false;
    #authenticated=false;

    #queries: Map<id, QueryObject | QueryPromise> = new Map(); //keeps a dict of all subscribed queries
    #props: Map<PropKey, { [id: id]: PropUpdateCallback }> = new Map();

    static #key = 1; //all instances will share this number, such that they are always kept unique. Tho each of these clients would make a different session on the backend, but still

    //public:
    name:string;
    verbose:boolean;
    key_generator: (() => number | string) | undefined;
    persistent: boolean = false;
    lifecycle_hooks: { [f_name: string]: Function | null; } = { discon: null as (Discon_ClientHook | null), msg: null as (Msg_ClientHook | null), cmd: null as (Cmd_ClientHook | null) };
    //If the hook returns a truthy value, then it is assumed, that the hook handled the msg and the lib will not. Otherwise, by default, the lib handles the msg.
    //discon has to be an async function, such that you may await the new ready(), but socio wont wait for it to finish.
    // progs: Map<Promise<any>, number> = new Map(); //the promise is that of a socio generic data going out from client async. Number is WS send buffer payload size at the time of query

    constructor(url: string, { name = 'Main', verbose = false, keep_alive = true, reconnect_tries = 1, persistent = false, hard_crash=false }: SocioClientOptions = {}) {
        super({ verbose, prefix: 'SocioClient', hard_crash });

        if (window || undefined && url.startsWith('ws://'))
            this.HandleInfo('UNSECURE WEBSOCKET URL CONNECTION! Please use wss:// and https:// protocols in production to protect against man-in-the-middle attacks.');

        //public:
        this.name = name
        this.verbose = verbose //It is recommended to turn off verbose in prod.
        this.persistent = persistent;
        
        this.#latency = (new Date()).getTime();
        this.#connect(url, keep_alive, verbose, reconnect_tries);
    }
    get ws() { return this.#ws; } //the WebSocket instance has some useful properties https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#instance_properties

    async #connect(url: string, keep_alive: boolean, verbose: boolean, reconnect_tries:number){
        this.#ws = new WebSocket(url);
        if (keep_alive && reconnect_tries)
            this.#ws.addEventListener("close", () => {
                this.HandleError(new E(`WebSocket closed. Retrying...`, this.name));
                this.#resetConn(); //invalidate any state this session had
                this.#connect(url, keep_alive, verbose, reconnect_tries - 1); //reconnect
                // Our greatest glory is not in never falling, but in rising every time we fall. /Confucius/

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
            const { kind, data }: { kind: ClientMessageKind; data: ClientMessageDataObj } = JSON.parse(event.data, MapReviver)
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
                    (this.#queries.get(data.id) as QueryPromise).res(this.#authenticated); //result should be either True or False to indicate success status
                    this.#queries.delete(data.id); //clear memory
                    break;
                case 'GET_PERM':
                    this.#FindID(kind, data?.id)
                    if (data?.result as Bit !== 1) 
                        this.HandleInfo(`Server rejected grant perm for ${data?.verb} on ${data?.table}.`);

                    (this.#queries.get(data.id) as QueryPromise).res(data?.result as Bit === 1); //result should be either True or False to indicate success status
                    this.#queries.delete(data.id) //clear memory
                    break;
                case 'RES':
                    this.#HandleBasicPromiseMessage(kind, data)
                    break;
                case 'PROP_UPD':
                    if (data?.prop && data.hasOwnProperty('id') && data.hasOwnProperty('result')){
                        const prop = this.#props.get(data.prop as string);
                        if (prop && prop[data.id as id] && typeof prop[data.id as id] === 'function'){
                            //@ts-expect-error
                            prop[data.id as id](data.result as PropValue);
                        }//@ts-expect-error 
                        else throw new E('Prop UPD called, but subscribed prop does not have a callback. data; callback', data, prop[data.id as id]);
                        if (this.#queries.has(data.id))
                            (this.#queries.get(data.id) as QueryPromise).res(data.result as PropValue); //resolve the promise
                    }else throw new E('Not enough prop info sent from server to perform prop update.', data)
                    break;
                case 'CMD': if(this.lifecycle_hooks.cmd) this.lifecycle_hooks.cmd(data); break; //the server pushed some data to this client, let the dev handle it
                case 'ERR'://The result field is sometimes used as a cause of error msg on the backend
                    if (typeof this.#queries.get(data.id) == 'function')
                        (this.#queries.get(data.id) as QueryPromise).res();

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
            this.#ws?.send(JSON.stringify(Object.assign({}, { kind, data: data[0] }, ...data.slice(1)), MapReplacer));
            this.HandleInfo('sent:', kind, data);
        } catch (e: err) { this.HandleError(e); }
    }
    SendFiles(files:File[], other_data:object|undefined=undefined){
        const { id, prom } = this.CreateQueryPromise(); //this up here, bcs we await in the lower lines, so that a prog tracker async can find this query as soon as it is available.

        // https://developer.mozilla.org/en-US/docs/Glossary/IIFE pattern bcs we need to use await there, but marking this function as async will actually return a new promise instead of the one returned here. 
        // They need to match for the prog track mechanism to work.
        // So just let this execute on its own async "thread" and move on with synchronous code.
        // This also means that payload will be calculated sometime after the prog tracking begins, which is why it checks for payload value existance.
        (async () => {
            const proc_files: SocioFiles = new Map(); //my own kind of FormData, specific for files, because FormData is actually a very riggid type

            //add each file
            for (const file of files) {
                //relevant info about files is stored in meta
                const meta = {
                    lastModified: file.lastModified,
                    size: file.size,
                    type: file.type
                };
                proc_files.set(file.name, { meta, bin: b64.fromByteArray(new Uint8Array(await file.arrayBuffer())) }); //this is the best way that i could find. JS is really unhappy about binary data
            }

            //create the server request as usual
            const socio_form_data = { id, files: proc_files };
            if (other_data)
                socio_form_data['data'] = other_data; //add the other data if exists
            this.Send('UP_FILES', socio_form_data);

            this.#UpdateQueryPromisePayloadSize(id);
        })();

        return prom as Promise<{ id: id, result: Bit }>;
    }
    SendBinary(blob: Blob | ArrayBuffer | ArrayBufferView) { //send binary. Unfortunately, it is not useful for me to invent my own byte formats and build functionality. You can tho. This is just low level access.
        if (this.#queries.get('BLOB')) throw new E('BLOB already being uploaded. Wait until the last query completes!');

        const start_buff = this.#ws?.bufferedAmount || 0
        this.#ws?.send(blob);
        this.HandleInfo('sent: BLOB');

        const prom = new Promise((res) => {
            this.#queries.set('BLOB', { res, prom, start_buff, payload_size: (this.#ws?.bufferedAmount || 0) - start_buff });
        });
        return prom;
    }
    CreateQueryPromise(){
        //https://advancedweb.hu/how-to-add-timeout-to-a-promise-in-javascript/ should implement promise timeouts
        const id = this.GenKey;
        const prom = new Promise((res) => {
            this.#queries.set(id, { res, prom:null, start_buff: this.#ws?.bufferedAmount || 0 });
        });
        (this.#queries.get(id) as QueryPromise).prom = prom;
        
        // this.progs.set(prom, this.#ws?.bufferedAmount || 0); //add this to progress tracking
        return {id, prom};
    }
    #UpdateQueryPromisePayloadSize(query_id:id){
        if (!this.#queries.has(query_id)) return;
        (this.#queries.get(query_id) as QueryPromise).payload_size = (this.#ws?.bufferedAmount || 0) - (this.#queries.get(query_id) as QueryPromise)?.start_buff || 0;
    }

    //subscribe to an sql query. Can add multiple callbacks where ever in your code, if their sql queries are identical
    //returns the created ID for that query, to use to unsubscribe all callbacks to the query
    Subscribe({ sql = '', params = null }: { sql?: string, params?: object | null | Array<any> } = {}, onUpdate: SubscribeCallbackObjectSuccess = null, status_callbacks: { error?: (e: string) => void } = {}, rate_limit: RateLimit | null = null): id | null{
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
        } catch (e:err) { this.HandleError(e); return false; }
    }
    async UnsubscribeProp(prop_name: PropKey, force = false) {
        try {
            if (this.#props.get(prop_name)) {
                if (force)//will first delete from here, to not wait for server response
                    this.#props.delete(prop_name);

                //set up new msg to the backend informing a wish to unregister query.
                const {id, prom} = this.CreateQueryPromise();
                this.Send('PROP_UNSUB', { id, prop: prop_name });

                const res = await prom; //await the response from backend
                if (res === 1)//if successful, then remove the subscribe from the client
                    this.#props.delete(prop_name);
                return res;//forward the success status to the developer
            }
            else
                throw new E('Cannot unsubscribe query, because provided prop_name is not currently tracked.', prop_name);
        } catch (e: err) { this.HandleError(e); return false; }
    }
    UnsubscribeAll({props=true, queries=true, force=false} = {}){
        if(props)
            for (const p of [...this.#props.keys()])
                this.UnsubscribeProp(p, force);
        if(queries)
            for (const q of [...this.#queries.keys()])
                this.Unsubscribe(q, force);
    }

    Query(sql: string, params: object | null | Array<any> = null, { onUpdate, freq_ms = undefined }: { onUpdate?: ProgressOnUpdate, freq_ms?:number } = {}){
        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const { id, prom } = this.CreateQueryPromise();

        //send off the request, which will be resolved in the message handler
        this.Send('SQL', { id, sql: sql, params: params });
        this.#UpdateQueryPromisePayloadSize(id);

        // immediate prog tracking for dev convenience.
        if (onUpdate)
            this.TrackProgressOfQueryID(id, onUpdate, freq_ms);

        return prom;
    }
    SetProp(prop: PropKey, new_val:PropValue){
        try {
            //check that prop is subbed
            if (!this.#props.get(prop))
                throw new E('Prop must be first subscribed to set its value!', prop);

            //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
            const { id, prom } = this.CreateQueryPromise();
            this.Send('PROP_SET', { id, prop: prop, prop_val:new_val });
            this.#UpdateQueryPromisePayloadSize(id);

            return prom;
        } catch (e: err) { this.HandleError(e); return null; }
    }
    GetProp(prop: PropKey) {
        const { id, prom } = this.CreateQueryPromise();
        this.Send('PROP_GET', { id, prop: prop });
        this.#UpdateQueryPromisePayloadSize(id);

        return prom;
    }
    Serv(data: any){
        const { id, prom } = this.CreateQueryPromise();
        this.Send('SERV', { id, data });
        this.#UpdateQueryPromisePayloadSize(id);

        return prom;
    }
    GetFiles(data: any){
        const { id, prom } = this.CreateQueryPromise();
        this.Send('GET_FILES', { id, data });
        this.#UpdateQueryPromisePayloadSize(id);

        return prom as Promise<File[]>;
    }
    //sends a ping with either the user provided number or an auto generated number, for keeping track of packets and debugging
    Ping(num=0){
        this.Send('PING', { id: num || this.GenKey })
    }

    Authenticate(params:object={}){ //params here can be anything, like username and password stuff etc. The backend server auth function callback will receive this entire object
        const { id, prom } = this.CreateQueryPromise();
        this.Send('AUTH', { id, params: params });
        this.#UpdateQueryPromisePayloadSize(id);

        return prom as Promise<{ id: id, result: Bit }>;
    }
    get authenticated() { return this.#authenticated === true }
    AskPermission(verb = '', table = '') {//ask the backend for a permission on a table with the SQL verb u want to perform on it, i.e. SELECT, INSERT etc.
        const { id, prom } = this.CreateQueryPromise();
        this.Send('GET_PERM', { id, verb:verb, table:table });
        this.#UpdateQueryPromisePayloadSize(id);

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
    #HandleBasicPromiseMessage(kind:string, data:ClientMessageDataObj){
        this.#FindID(kind, data?.id);
        const q = this.#queries.get(data.id);
        // @ts-expect-error
        if(q?.res)
            (q as QueryPromise).res(data?.result as Bit);
        // @ts-expect-error
        else if (q?.onUpdate)
            if ((q as QueryObject)?.onUpdate?.success)
                // @ts-expect-error
                (q as QueryObject).onUpdate.success(data?.result as Bit);
        
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

    // for dev debug, if u want
    LogMaps(){
        log('queries', [...this.#queries.entries()])
        log('props', [...this.#props.entries()])
    }

    // finds a query by its promise and registers a % update callback on its sent progress. NOTE this is not at all accurate. 
    // The calculations are very time sensitive, since network speeds are super fast these days. You must set up this timer as soon as possible.
    // returns the timer ID, if it was created, so that the dev can terminate the timer manually.
    TrackProgressOfQueryPromise(prom: Promise<any>, onUpdate: ProgressOnUpdate, freq_ms = 33.34){
        for (const [id, q] of this.#queries as Map<id, QueryPromise>){
            if (q?.prom == prom){
                return this.#CreateProgTrackingTimer(id, q.start_buff, q.payload_size || 0, onUpdate, freq_ms);
            }
        }
        return null;
    }

    TrackProgressOfQueryID(query_id: id, onUpdate: ProgressOnUpdate, freq_ms = 33.34) {
        const q: QueryPromise = (this.#queries.get(query_id) as QueryPromise);
        if(q) return this.#CreateProgTrackingTimer(query_id, q.start_buff, q.payload_size || 0, onUpdate, freq_ms);
        else return null;
    }

    // Sets a timer to calculate the progress of a pending query promise, returns it to the user @ 30fps. 
    // Returns the timer ID, in case the dev wants to stop it manually.
    // This might call onUpdate multiple times with 0 before the % starts going up.
    #CreateProgTrackingTimer(query_id: id, start_buff: number, payload_size: number, onUpdate: ProgressOnUpdate, freq_ms = 33.34){
        let last_buff_size = this.#ws?.bufferedAmount || 0;
        const intervalID = setInterval(() => {
            if (!payload_size){
                payload_size = (this.#queries.get(query_id) as QueryPromise)?.payload_size || 0; //check if it exists now
                if(!payload_size) return; //skip if still not ready
                last_buff_size = this.#ws?.bufferedAmount || 0; //reset this as well, bcs it should be 0, if payload was 0. Since the payload hasnt yet been added to the buffer, but will be now.
            }
            const later_payload_ids = Array.from((this.#queries as Map<id, QueryPromise>).keys()).filter(id => id > query_id);
            const later_payloads_size = later_payload_ids.map(p_id => (this.#queries.get(p_id) as QueryPromise)?.payload_size || 0).reduce((sum, payload) => sum += payload, 0);
            const now_buff_size = (this.#ws?.bufferedAmount || 0) - later_payloads_size; //make the now needle ignore later payloads, if they have been added during this timer.
            const delta_buff = (last_buff_size - now_buff_size) || 1_000; //delta buff - this order bcs last should be smaller and we want to know how much was sent out (delta). The || is a fallback in case the delta is negative or 0, so we dont get stuck in a loop.
            last_buff_size = now_buff_size;

            //as the now needle moves closer to 0, move the start need by the same amount. When it crosses over 0, then we've started to send out this query payload
            start_buff -= delta_buff; 
            const p = (start_buff * -100) / (payload_size as number); //start buff below 0 is the amount of sent out so far. Invert and divide by total payload size * 100 for %.

            onUpdate(clamp(p, 0, 100)); //while start needle is > 0, this will have negative %. When -(start needle) > payload, will be over 100%
            if (p >= 100 || (this.#ws?.bufferedAmount || 0) === 0) {
                onUpdate(100);
                clearInterval(intervalID);
            }
            // log({ last_buff_size, start_buff, payload_size, delta_buff, p });
        }, freq_ms);
        return intervalID;
    }
}

function ParseSocioFiles(files:SocioFiles){
    if(!files) return [];
    const files_array: File[] = [];
    for (const [filename, filedata] of files.entries())
        files_array.push(new File([b64.toByteArray(filedata.bin)], filename, { type: filedata.meta.type, lastModified: filedata.meta.lastModified }));
    return files_array;
}