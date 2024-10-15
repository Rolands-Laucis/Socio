// Let those that play your clowns speak no more than is set down for them. /William Shakespeare/

import pako from 'pako'; //https://github.com/nodeca/pako
import * as diff_lib from 'recursive-diff'; //https://www.npmjs.com/package/recursive-diff

import { LogHandler, E, err, log, info, done } from './logging.js';
import { yaml_parse, yaml_stringify, clamp, CoreMessageKind } from './utils.js';

//types
import type { id, PropKey, PropValue, PropOpts, Bit, ClientLifecycleHooks, ClientID, SocioFiles, LoggingOpts, ClientSubscribeOpts, data_result_block } from './types.js';

// cross network data objects
// client data msg
import type { data_base, C_RES_data, C_CON_data, C_UPD_data, C_AUTH_data, C_GET_PERM_data, C_PROP_UPD_data, C_RECON_Data, C_RECV_FILES_Data } from './types.js'; //types over network for the data object
// server data msg
import type { S_SUB_data, S_UNSUB_data, S_SQL_data, S_AUTH_data, S_GET_PERM_data, S_PROP_SUB_data, S_PROP_UNSUB_data, S_PROP_GET_data, S_PROP_SET_data, S_PROP_REG_data, S_RECON_GET_data, S_RECON_USE_data, S_UP_FILES_data, S_GET_FILES_data } from './types.js';
import type { ClientMessageDataObj } from './types.js';

import type { RateLimit } from './ratelimit.js';
type SubscribeCallbackObjectSuccess = ((res: object | object[]) => void) | null;
type SubscribeCallbackObject = { success: SubscribeCallbackObjectSuccess, error?: Function};
type QueryObject = ClientSubscribeOpts & { onUpdate: SubscribeCallbackObject };
type QueryPromise = { res: Function, prom:Promise<any> | null, start_buff: number, payload_size?:number };
export type ProgressOnUpdate = (percentage: number) => void;

type PropUpdateCallback = ((new_val: PropValue, diff?: diff_lib.rdiffResult[]) => void) | null;
export type ClientProp = { val: PropValue | undefined, subs: { [id: id]: PropUpdateCallback } };
export type SocioClientOptions = { name?: string, keep_alive?: boolean, reconnect_tries?: number, persistent?: boolean } & LoggingOpts;
export enum ClientMessageKind {
    CON, UPD, PONG, AUTH, GET_PERM, RES, PROP_UPD, PROP_DROP, CMD, RECON, RECV_FILES, TIMEOUT
};

//"Because he not only wants to perform well, he wants to be well received  —  and the latter lies outside his control." /Epictetus/
export class SocioClient extends LogHandler {
    // private:
    #ws: WebSocket | null = null;
    #client_id:ClientID = '';
    #latency:number;
    #is_ready: Function | boolean = false;
    #authenticated=false;

    #queries: Map<id, QueryObject | QueryPromise> = new Map(); //keeps a dict of all subscribed queries
    #props: Map<PropKey, ClientProp> = new Map();

    static #key = 1; //all instances will share this number, such that they are always kept unique. Tho each of these clients would make a different session on the backend, but still

    //public:
    config: SocioClientOptions;
    key_generator: (() => number | string) | undefined;
    lifecycle_hooks: ClientLifecycleHooks = { discon: undefined, msg: undefined, cmd: undefined, timeout: undefined, prop_drop:undefined, server_error:undefined }; //assign your function to hook on these. They will be called if they exist
    //If the hook returns a truthy value, then it is assumed, that the hook handled the msg and the lib will not. Otherwise, by default, the lib handles the msg.
    //discon has to be an async function, such that you may await the new ready(), but socio wont wait for it to finish.
    // progs: Map<Promise<any>, number> = new Map(); //the promise is that of a socio generic data going out from client async. Number is WS send buffer payload size at the time of query

    constructor(url: string, { name = 'Main', logging = { verbose: false, hard_crash: false }, keep_alive = true, reconnect_tries = 1, persistent = false}: SocioClientOptions = {}) {
        super({ ...logging, prefix: name ? `SocioClient:${name}` : 'SocioClient' });

        // public:
        this.config = {name, logging, keep_alive, reconnect_tries, persistent};
        
        // private:
        this.#latency = (new Date()).getTime();
        this.#connect(url, keep_alive, this.verbose || false, reconnect_tries);

        // log info for the dev
        if(this.verbose){
            if (window && url.startsWith('ws://'))
                this.HandleInfo('WARNING, UNSECURE WEBSOCKET URL CONNECTION! Please use wss:// and https:// protocols in production to protect against man-in-the-middle attacks. You need to host an https server with bought SCTs - Signed Certificate Timestamps (keys) - from an authority.');
        }
    }

    
    async #connect(url: string, keep_alive: boolean, verbose: boolean, reconnect_tries:number){
        this.#ws = new WebSocket(url);
        this.#ws.addEventListener('message', this.#message.bind(this));
        if (keep_alive && reconnect_tries){
            this.#ws.addEventListener("close", (event: CloseEvent) => { this.#RetryConn(url, keep_alive, verbose, reconnect_tries, event) });
            this.#ws.addEventListener("error", (event: Event) => { this.#RetryConn(url, keep_alive, verbose, reconnect_tries, event) });
        }
    }
    #RetryConn(url: string, keep_alive: boolean, verbose: boolean, reconnect_tries: number, event:any) {
        this.HandleError(new E(`"${this.config.name || ''}" WebSocket closed. Retrying... Event details:`, event));
        this.#resetConn(); //invalidate any state this session had
        this.#connect(url, keep_alive, verbose, reconnect_tries - 1); //reconnect
        // Our greatest glory is not in never falling, but in rising every time we fall. /Confucius/

        //pass the object to the discon hook, if it exists
        if (this.lifecycle_hooks.discon)//discon has to be an async function, such that you may await the new ready(), but socio wont wait for it to finish.
            this.lifecycle_hooks.discon(this, url, keep_alive, verbose, reconnect_tries - 1, event); //here you can await ready() and reauth and regain all needed perms
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
            const { kind, data }: { kind: ClientMessageKind; data: ClientMessageDataObj } = yaml_parse(event.data);
            this.HandleInfo('recv:', ClientMessageKind[kind], data);

            //let the developer handle the msg
            if (this.lifecycle_hooks.msg)
                if (await this.lifecycle_hooks.msg(this, kind, data))
                    return;

            switch (kind) {
                case ClientMessageKind.CON:{
                    this.#client_id = data as C_CON_data;//should just be a string
                    this.#latency = (new Date()).getTime() - this.#latency;

                    if (this.config.persistent) {
                        await this.#TryReconnect(); //try to reconnect with existing token in local storage
                        await this.#GetReconToken(); //get new recon token and push to local storage
                    }

                    if (this.#is_ready !== false && typeof this.#is_ready === "function")
                        this.#is_ready(true); //resolve promise to true
                    else
                        this.#is_ready = true;
                    if (this.verbose) this.done(`Socio WebSocket [${this.config.name}] connected.`);

                    this.#is_ready = true;
                    break;
                }
                case ClientMessageKind.UPD:{
                    this.#FindID(kind, (data as C_UPD_data).id);
                    const q = this.#queries.get((data as C_UPD_data).id) as QueryObject;
                    if ((data as C_UPD_data).result.success === 1 && q.onUpdate.success){
                        q.onUpdate.success(((data as C_UPD_data).result.res));
                    }else{
                        if (q.onUpdate?.error){
                            q.onUpdate.error((data as C_UPD_data).result.error);
                        }else{
                            throw new E('Subscription query doesnt handle incoming server error:', (data as C_UPD_data).result.error)
                        }
                    }
                    break;
                }
                case ClientMessageKind.PONG:{
                    this.#FindID(kind, (data as data_base)?.id)
                    this.HandleInfo('pong', (data as data_base)?.id);
                    break;
                }
                case ClientMessageKind.AUTH:{
                    this.#FindID(kind, (data as C_AUTH_data)?.id)
                    if ((data as C_AUTH_data)?.result?.success !== 1)
                        this.HandleInfo(`AUTH returned FALSE, which means websocket has not authenticated.`);

                    this.#authenticated = (data as C_AUTH_data).result.success === 1;
                    (this.#queries.get((data as C_AUTH_data).id) as QueryPromise).res(this.#authenticated); //result should be either True or False to indicate success status
                    this.#queries.delete((data as C_AUTH_data).id); //clear memory
                    break;
                }
                case ClientMessageKind.GET_PERM:{
                    this.#FindID(kind, (data as C_GET_PERM_data)?.id)
                    if ((data as C_GET_PERM_data)?.result?.success as Bit !== 1)
                        this.HandleInfo(`Server rejected grant perm for ${(data as C_GET_PERM_data)?.verb} on ${(data as C_GET_PERM_data)?.table}.`);
                    else{
                        const q = this.#queries.get((data as C_GET_PERM_data).id) as QueryPromise
                        q.res((data as C_GET_PERM_data)?.result.success === 1 ? true : false); //promise expects resolve with boolean
                    }

                    this.#queries.delete((data as C_GET_PERM_data).id) //clear memory
                    break;
                }
                case ClientMessageKind.RES:{
                    this.#HandleBasicPromiseMessage(kind, data as C_RES_data);
                    break;
                }
                case ClientMessageKind.PROP_UPD:{
                    if (data.hasOwnProperty('prop') && data.hasOwnProperty('id') && (data.hasOwnProperty('prop_val') || data.hasOwnProperty('prop_val_diff'))) {
                        const prop = this.#props.get((data as C_PROP_UPD_data).prop);
                        let prop_val: PropValue | diff_lib.rdiffResult[] | undefined;
                        if (prop){
                            if (typeof prop.subs[(data as C_PROP_UPD_data).id] === 'function'){
                                // get the new factual value value of the prop either from the server or from applying the diff from server
                                if ((data as C_PROP_UPD_data).hasOwnProperty('prop_val')){ //take factual
                                    //@ts-expect-error
                                    prop_val = (data as C_PROP_UPD_data).prop_val
                                }else{ //apply diff
                                    //@ts-expect-error
                                    prop_val = diff_lib.applyDiff(prop.val, (data as C_PROP_UPD_data).prop_val_diff);
                                }
                                prop.val = prop_val; //set the new val

                                // afterwards call the client subscription with the new val and the received diff 
                                //@ts-expect-error
                                prop.subs[(data as C_PROP_UPD_data).id as id](prop_val, (data as C_PROP_UPD_data)?.prop_val_diff || undefined);
                            } else {
                                throw new E('Prop UPD called, but subscribed prop is missing a registered callback for this data ID. [#prop-subs-id-not-found]', { data, callback: prop.subs[(data as C_PROP_UPD_data).id] });
                            }
                        }else{
                            throw new E('Prop not found by name. [#prop-name-not-found]', { data, prop_name: (data as C_PROP_UPD_data).prop });
                        }
                        
                        // if this is the initial update from the SUB_PROP call, resolve the promise
                        // if (this.#queries.has((data as C_PROP_UPD_data).id))
                        //     (this.#queries.get((data as C_PROP_UPD_data).id) as QueryPromise).res(prop_val); //resolve the promise

                    } else throw new E('Not enough prop info sent from server to perform prop update.', { data: data as C_PROP_UPD_data })
                    break;
                }
                case ClientMessageKind.PROP_DROP:{
                    if ((data as C_PROP_UPD_data)?.prop && data.hasOwnProperty('id')) {
                        if (this.#props.has((data as C_PROP_UPD_data).prop)) {
                            delete this.#props.get((data as C_PROP_UPD_data).prop)?.subs[(data as C_PROP_UPD_data).id];

                            //tell the dev that this prop has been dropped by the server.
                            if (this.lifecycle_hooks.prop_drop)
                                this.lifecycle_hooks.prop_drop(this, (data as C_PROP_UPD_data).prop, (data as C_PROP_UPD_data).id);
                        }
                        else throw new E('Cant drop unsubbed prop!', data);
                    } else throw new E('Not enough prop info sent from server to perform prop drop.', data);
                    break;
                }
                case ClientMessageKind.CMD: {if(this.lifecycle_hooks.cmd) this.lifecycle_hooks.cmd(data); break;} //the server pushed some data to this client, let the dev handle it
                case ClientMessageKind.RECON:{
                    if ((data as C_RECON_Data)?.id){
                        this.#FindID(kind, (data as data_base).id);
                        
                        (this.#queries.get((data as data_base).id) as QueryPromise).res(data as C_RECON_Data);
                        this.#queries.delete((data as data_base).id); //clear memory
                    }
                    // sent without id, so the recon was automatic on the server-side, not requested by this client
                    else
                        this.#Reconnect(data as C_RECON_Data);
                    break;
                }
                case ClientMessageKind.RECV_FILES:{
                    this.#FindID(kind, (data as C_RECV_FILES_Data)?.id);

                    // cant exit early, bcs the query needs to be resolved to smth and deleted, so use these vars here instead
                    let resolve_with: File[] | null = null;
                    let error: string | null = null;
                    if ((data as C_RECV_FILES_Data).result.success === 1) {
                        if ((data as C_RECV_FILES_Data)?.files){
                            resolve_with = ParseSocioFiles((data as C_RECV_FILES_Data).files as SocioFiles);
                        }else{
                            resolve_with = null;
                            error = 'Received 0 files. Something must\'ve gone wrong, bcs success was true. [#recv-0-files]';
                        }
                    } else {
                        resolve_with = null;
                        error = 'File receive bad result. [#recv-files-bad]';
                    };

                    //@ts-expect-error 
                    this.#queries.get((data as C_RECV_FILES_Data).id)?.res(resolve_with); //resolve the promise with files or null bcs of error
                    this.#queries.delete((data as C_RECV_FILES_Data).id); //clear memory
                    
                    // notify dev and crash with error
                    if(error){
                        const file_count = Object.keys((data as C_RECV_FILES_Data)?.files || {}).length;
                        this.#HandleServerError(error, (data as C_RECV_FILES_Data).result.error, 'files received: ' + file_count);
                        throw new E(error, { err_msg:(data as C_RECV_FILES_Data).result.error, file_count });
                    }
                    
                    break;
                }
                case ClientMessageKind.TIMEOUT:{
                    if (this.lifecycle_hooks.timeout)
                        this.lifecycle_hooks.timeout(this);
                    break;
                }
                // case '': {break;}
                default:{
                    const exhaustiveCheck: never = kind; // This ensures that if a new enum value is added and not handled, it will result in a compile-time error
                    throw new E(`Unrecognized message kind!`, { kind, data });
                }
            }
        } catch (e:err) { this.HandleError(e) }
    }

    //accepts infinite arguments of data to send and will append these params as new key:val pairs to the parent object
    Send(kind: CoreMessageKind, ...data){ //data is an array of parameters to this func, where every element (after first) is an object. First param can also not be an object in some cases
        try{
            if (data.length < 1) throw new E('Not enough arguments to send data! kind;data:', kind, ...data); //the first argument must always be the data to send. Other params may be objects with aditional keys to be added in the future
            this.#ws?.send(yaml_stringify(Object.assign({}, { kind, data: data[0] }, ...data.slice(1))));
            this.HandleInfo('sent:', CoreMessageKind[kind], data);
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
                const file_bytes_buffer = await file.arrayBuffer();
                proc_files.set(file.name, { meta, bin: Uint8ArrayToSocioFileBase64(file_bytes_buffer)}); //this is the best way that i could find. JS is really unhappy about binary data
            }

            //create the server request as usual
            const socio_form_data = { id, files: proc_files };
            if (other_data)
                socio_form_data['data'] = other_data; //add the other data if exists
            this.Send(CoreMessageKind.UP_FILES, socio_form_data as S_UP_FILES_data);

            this.#UpdateQueryPromisePayloadSize(id);
        })();

        return (prom as unknown) as Promise<C_RES_data>;
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
        // creates a basic promise that is trackable. It is resolved either by Message receive switch block by msg ID in queries, or by whatever has a reference to this returned prom

        //https://advancedweb.hu/how-to-add-timeout-to-a-promise-in-javascript/ should implement promise timeouts
        const id = this.GenKey;
        const prom = new Promise((res) => {
            this.#queries.set(id, { res, prom:null, start_buff: this.#ws?.bufferedAmount || 0 });
        }) as Promise<unknown>;
        (this.#queries.get(id) as QueryPromise).prom = prom;
        
        // this.progs.set(prom, this.#ws?.bufferedAmount || 0); //add this to progress tracking
        return {id, prom};
    }
    #UpdateQueryPromisePayloadSize(query_id:id){
        if (!this.#queries.has(query_id)) return;
        (this.#queries.get(query_id) as QueryPromise).payload_size = (this.#ws?.bufferedAmount || 0) - (this.#queries.get(query_id) as QueryPromise)?.start_buff || 0;
    }
    Serv(data: any) {
        const { id, prom } = this.CreateQueryPromise();
        this.Send(CoreMessageKind.SERV, { id, data });
        this.#UpdateQueryPromisePayloadSize(id);

        return prom;
    }
    GetFiles(data: any) {
        const { id, prom } = this.CreateQueryPromise();
        this.Send(CoreMessageKind.GET_FILES, { id, data } as S_GET_FILES_data);
        this.#UpdateQueryPromisePayloadSize(id);

        return (prom as unknown) as Promise<File[] | null>; //fuck TS fr. wtf is this syntax. r u trying to make me kms?
    }
    //sends a ping with either the user provided number or an auto generated number, for keeping track of packets and debugging
    Ping(num = 0) {
        this.Send(CoreMessageKind.PING, { id: num || this.GenKey })
    }
    UnsubscribeAll({ props = true, queries = true, force = false } = {}) {
        if (props)
            for (const p of [...this.#props.keys()])
                this.UnsubscribeProp(p, force);
        if (queries)
            for (const q of [...this.#queries.keys()])
                this.Unsubscribe(q, force);
    }


    //subscribe to an sql query. Can add multiple callbacks where ever in your code, if their sql queries are identical
    //returns the created ID for that query, to use to unsubscribe all callbacks to the query
    Subscribe({ sql = undefined, endpoint = undefined, params = null }: ClientSubscribeOpts = {}, onUpdate: SubscribeCallbackObjectSuccess = null, status_callbacks: { error?: (e: string) => void } = {}, rate_limit: RateLimit | null = null): id | null{
        //params for sql is the object that will be passed as params to your query func
        //optionally can also supply an endpoint name instead of an sql string. Cannot do both. The endpoint is your own keyname for a sql query defined on the backend in a special file.

        //onUpdate is the success standard function, that gets called, when the DB sends an update of its data
        //status_callbacks is an optional object, that expects 1 optional key - "error", and it must be a callable function, that receives 1 arg - the error msg.
        if (sql && endpoint) throw new E('Can only subscribe to either literal SQL query string or endpoint keyname, not both!');
        if (typeof onUpdate !== "function") throw new E('Subscription onUpdate is not function, but has to be.');
        if (status_callbacks?.error && typeof status_callbacks.error !== "function") throw new E('Subscription error is not function, but has to be.');
        try {
            const id = this.GenKey;
            const callbacks: SubscribeCallbackObject = { success: onUpdate, ...status_callbacks };

            this.#queries.set(id, { sql, endpoint, params, onUpdate: callbacks });
            this.Send(CoreMessageKind.SUB, { id, sql, endpoint, params, rate_limit } as S_SUB_data);

            return id; //the ID of the query
        } catch (e: err) { this.HandleError(e); return null; }
    }
    async Unsubscribe(sub_id: id, force=false) {
        try {
            if (this.#queries.has(sub_id)){
                if(force)//will first delete from here, to not wait for server response
                    this.#queries.delete(sub_id);
                
                //set up new msg to the backend informing a wish to unregister query.
                const { id, prom } = this.CreateQueryPromise();
                this.Send(CoreMessageKind.UNSUB, { id, unreg_id: sub_id } as S_UNSUB_data)

                const res = await (prom as unknown) as Bit; //await the response from backend
                if(res === 1)//if successful, then remove the subscribe from the client
                    this.#queries.delete(sub_id);
                return res;//forward the success status to the developer
            }
            else
                throw new E('Cannot unsubscribe query, because provided ID is not currently tracked.', sub_id);
        } catch (e:err) { this.HandleError(e); return false; }
    }
    Query(sql: string, params: object | null | Array<any> = null, { sql_is_endpoint = undefined, onUpdate, freq_ms = undefined }: { sql_is_endpoint?:boolean, onUpdate?: ProgressOnUpdate, freq_ms?:number } = {}){
        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const { id, prom } = this.CreateQueryPromise();

        //send off the request, which will be resolved in the message handler
        this.Send(CoreMessageKind.SQL, { id, sql, params, sql_is_endpoint } as S_SQL_data);
        this.#UpdateQueryPromisePayloadSize(id);

        // immediate prog tracking for dev convenience.
        if (onUpdate)
            this.TrackProgressOfQueryID(id, onUpdate, freq_ms);

        return prom;
    }


    SetProp(prop_name: PropKey, new_val: PropValue, prop_upd_as_diff?:boolean){
        try {
            //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
            const { id, prom } = this.CreateQueryPromise();
            this.Send(CoreMessageKind.PROP_SET, { id, prop: prop_name, prop_val: new_val, prop_upd_as_diff } as S_PROP_SET_data);
            this.#UpdateQueryPromisePayloadSize(id);

            return prom as Promise<data_base & data_result_block>;
        } catch (e: err) { this.HandleError(e); return null; }
    }
    GetProp(prop_name: PropKey, local: boolean = false){
        if (local) return { result: { success: 1, res: this.#props.get(prop_name)?.val as PropValue }};
        else{
            const { id, prom } = this.CreateQueryPromise();
            this.Send(CoreMessageKind.PROP_GET, { id, prop: prop_name } as S_PROP_GET_data);
            this.#UpdateQueryPromisePayloadSize(id);
            return prom as Promise<data_base & data_result_block>;
        }
    }
    SubscribeProp(prop_name: PropKey, onUpdate: PropUpdateCallback, { rate_limit = null, receive_initial_update = true }: { rate_limit?: RateLimit | null, receive_initial_update?: boolean } = {}): Promise<{ id: id, result: { success: Bit } } | any> {
        //the prop name on the backend that is a key in the object
        if (typeof onUpdate !== "function") throw new E('Subscription onUpdate is not function, but has to be.');

        const { id, prom } = this.CreateQueryPromise();
        try {
            const prop = this.#props.get(prop_name);

            if (prop)//add the callback
                prop.subs[id] = onUpdate;
            else {//init the prop object
                this.#props.set(prop_name, { val: undefined, subs: { [id]: onUpdate } });
                this.Send(CoreMessageKind.PROP_SUB, { id, prop: prop_name, rate_limit, data: { receive_initial_update } } as S_PROP_SUB_data)
            }

            return prom as Promise<any>;
        } catch (e: err) { this.HandleError(e); return new Promise(res => res({ id, result: { success: 0 } })); }
    }
    async UnsubscribeProp(prop_name: PropKey, force = false) {
        try {
            if (this.#props.get(prop_name)) {
                if (force)//will first delete from here, to not wait for server response
                    this.#props.delete(prop_name);

                //set up new msg to the backend informing a wish to unregister query.
                const { id, prom } = this.CreateQueryPromise();
                this.Send(CoreMessageKind.PROP_UNSUB, { id, prop: prop_name } as S_PROP_UNSUB_data);

                const res = await (prom as unknown) as Bit; //await the response from backend
                if (res === 1)//if successful, then remove the subscribe from the client
                    this.#props.delete(prop_name);
                return res;//forward the success status to the developer
            }
            else
                throw new E('Cannot unsubscribe query, because provided prop_name is not currently tracked.', prop_name);
        } catch (e: err) { this.HandleError(e); return false; }
    }
    RegisterProp(prop_name: PropKey | undefined | null, initial_value: any = null, prop_reg_opts: Omit<PropOpts, "observationaly_temporary"> = {}) { //"client_writable" & 
        try {
            const { id, prom } = this.CreateQueryPromise();
            this.Send(CoreMessageKind.PROP_REG, { id, prop:prop_name, initial_value, opts: prop_reg_opts } as S_PROP_REG_data);
            this.#UpdateQueryPromisePayloadSize(id);
            
            return (prom as unknown) as Promise<{ prop: PropKey }>;
        } catch (e: err) { this.HandleError(e); return null; }
    }
    // async Prop(prop_name: PropKey){
    //     const client_this = this; //use for inside the Proxy scope
    //     const prop_proxy = new Proxy(await this.GetProp(prop_name), {
    //         async get(p: PropValue, property) {
    //             const res = await client_this.GetProp.bind(client_this)(prop_name);
    //             return res?.result?.success === 1 ? res?.result?.res[property] : p[property];
    //         },
    //         // @ts-expect-error
    //         async set(p: PropValue, property, new_val) { //ive run tests in other projects and the async set does work fine. TS doesnt want to allow it for some reason 
    //             p[property] = new_val;
    //             return (await client_this.SetProp.bind(client_this)(prop_name, p))?.result?.success === 1;
    //         }
    //     });

    //     this.SubscribeProp(prop_name, (new_val) => { prop_proxy[]})
    //     return prop_proxy;
    // }


    // socio query marker related --auth and --perm:
    Authenticate(params:object={}){ //params here can be anything, like username and password stuff etc. The backend server auth function callback will receive this entire object
        const { id, prom } = this.CreateQueryPromise();
        this.Send(CoreMessageKind.AUTH, { id, params } as S_AUTH_data);
        this.#UpdateQueryPromisePayloadSize(id);

        return (prom as unknown) as Promise<C_AUTH_data>;
    }
    get authenticated() { return this.#authenticated === true }
    AskPermission(verb = '', table = '') {//ask the backend for a permission on a table with the SQL verb u want to perform on it, i.e. SELECT, INSERT etc.
        const { id, prom } = this.CreateQueryPromise();
        this.Send(CoreMessageKind.GET_PERM, { id, verb: verb, table: table } as S_GET_PERM_data);
        this.#UpdateQueryPromisePayloadSize(id);

        return (prom as unknown) as Promise<boolean>;
    }
    
    
    //checks if the ID of a query exists, otherwise rejects/throws and logs. This is used in a bunch of message receive cases at the start.
    #FindID(kind: ClientMessageKind, id: id) {
        if (!this.#queries.has(id))
            throw new E(`A received socio message [querry_id ${id}, ${kind}] is not currently in tracked queries!`);
    }
    #HandleBasicPromiseMessage(kind: ClientMessageKind, data: C_RES_data){
        this.#FindID(kind, data?.id);
        const q = this.#queries.get(data.id) as QueryObject | QueryPromise;
        if (q.hasOwnProperty('res')){
            if (data.result.success === 1)
                (q as QueryPromise).res(data?.result?.res as any);
            else this.#HandleServerError(data.result.error);
        }
        else if (q.hasOwnProperty('onUpdate'))
            if (data.result.success === 1){
                if ((q as QueryObject).onUpdate?.success)
                    //@ts-expect-error
                    (q as QueryObject).onUpdate.success(data.result.res);
            }
            else{
                if ((q as QueryObject).onUpdate?.error)
                    //@ts-expect-error
                    (q as QueryObject).onUpdate.error(data.result.error);
                else this.#HandleServerError(``, data.result.error);
            }
        
        this.#queries.delete(data.id); //clear memory
    }
    #HandleServerError(...error_msgs:string[]){
        if (this.lifecycle_hooks.server_error)
            this.lifecycle_hooks.server_error(this, error_msgs);
        else
            this.HandleError(new E(...error_msgs));
    }


    //generates a unique key either via static counter or user provided key gen func
    get GenKey(): id {return this?.key_generator ? this.key_generator() : ++SocioClient.#key;}
    get client_id(){return this.#client_id;}
    get web_socket() { return this.#ws; } //the WebSocket instance has some useful properties https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#instance_properties
    get client_address_info() { return { url: this.#ws?.url, protocol: this.#ws?.protocol, extensions: this.#ws?.extensions }; } //for convenience
    get latency() { return this.#latency; } //shows the latency in ms of the initial connection handshake to determine network speed for this session. Might be useful to inform the user, if its slow.
    ready(): Promise<boolean> { return this.#is_ready === true ? (new Promise(res => res(true))) : (new Promise(res => this.#is_ready = res)) }
    Close() { this.#ws?.close(); }

    async #GetReconToken(name: string = this.config.name as string){
        const { id, prom } = this.CreateQueryPromise();

        //ask the server for a one-time auth token
        this.Send(CoreMessageKind.RECON, { id, type: 'GET' } as S_RECON_GET_data);
        const token = await (prom as unknown) as string; //await the token

        //save down the token. Name is used to map new instance to old instance by same name.
        localStorage.setItem(`Socio_recon_token_${name}`, token); //https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage localstorage is origin locked, so should be safe to store this here
    }
    RefreshReconToken(name: string = this.config.name as string){return this.#GetReconToken(name);}

    async #TryReconnect(name: string = this.config.name as string){
        const key = `Socio_recon_token_${name}`
        const token = localStorage.getItem(key);

        if (token){
            localStorage.removeItem(key); //one-time use

            const { id, prom } = this.CreateQueryPromise();

            //ask the server for a reconnection to an old session via our one-time token
            this.Send(CoreMessageKind.RECON, { id, type: 'USE', token } as S_RECON_USE_data);            
            const res = await (prom as unknown as Promise<C_RECON_Data>);
            this.#Reconnect(res); //sets the trusted values from the server, like auth bool
        }
    }
    //sets the trusted values from the server, like auth bool
    #Reconnect(data:C_RECON_Data){
        if (data.result.success === 1) {
            this.#authenticated = data.auth;
            this.done(`${this.config.name} reconnected successfully. ${data.old_client_id} -> ${this.#client_id} (old client ID -> new/current client ID)`, data);
        }
        else{
            const error = 'Failed to reconnect'
            this.HandleError(new E(error, data));
            this.#HandleServerError(error, data.result.error);
        }
    }

    // for dev debug, if u want
    LogMaps(){
        this.debug('queries', [...this.#queries.entries()]);
        this.debug('props', [...this.#props.entries()]);
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
    // NOTE, use request anim frame instead? Canceling it is a bit of a hastle and it would run faster than needed sometimes. But no slower than the framerate.
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

export function ParseSocioFiles(files:SocioFiles){
    if(!files) return [];
    const files_array: File[] = [];
    for (const [filename, file_data] of files.entries())
        files_array.push(new File([SocioFileBase64ToUint8Array(file_data.bin)], filename, { type: file_data.meta.type, lastModified: file_data.meta.lastModified }));
    return files_array;
}

// Helper function to decompress and encode data from Base64
export function SocioFileBase64ToUint8Array(base64:string='') {
    return pako.inflate(Uint8Array.from(window.atob(base64), (v) => v.charCodeAt(0)));
}

// Helper function to compress and encode data to Base64
export function Uint8ArrayToSocioFileBase64(file_bin: ArrayBuffer, chunkSize = 0x8000) {
    const compressedData = pako.deflate(file_bin);
    let binaryString = '';

    // Use a chunk size of 32KB to avoid call range issues
    // turns out js has a func arg limit or spread limit, so have to do this in chunks
    // was getting RangeError: too many function arguments for >4MB files
    for (let i = 0; i < compressedData.length; i += chunkSize) {
        const chunk = compressedData.subarray(i, i + chunkSize);
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/fromCharCode
        binaryString += String.fromCharCode(...chunk); //A number between 0 and 65535 (0xFFFF) representing a UTF-16 code unit.
    }

    // https://developer.mozilla.org/en-US/docs/Web/API/Window/btoa
    return window.btoa(binaryString); //The btoa() method creates a Base64-encoded ASCII string from a binary string (i.e., a string in which each character in the string is treated as a byte of binary data). 
}