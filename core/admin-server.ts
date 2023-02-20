//If God did not exist, it would be necessary to invent Him. /Voltaire/

import { LogHandler, E } from "./logging.js";
import { WebSocket as nodeWebSocket } from "ws";

//types
import type { ClientMessageKind, id, PropValue } from './types.js'
// import type { WebSocket as nodeWebSocket } from "ws";
type MessageDataObj = { id: id, status?: string, result?: string | object | boolean | PropValue, data?: object };
type AdminClientOptions = { url: string, client_secret: string, verbose?:boolean }

export class AdminClient extends LogHandler{
    //private:
    #ws: nodeWebSocket;
    #client_id = '';
    #client_secret = '';
    static #key = 1 //all instances will share this number, such that they are always kept unique. Tho each of these clients would make a different session on the backend, but still
    #is_ready: Function | boolean = false;
    #queries: { [id: id]: Function } = {}; //keeps a dict of all querie promises

    constructor({ url = '', client_secret = '', verbose = true }: AdminClientOptions){
        super({prefix:'SocioAdmin', verbose});

        if (client_secret.length < 16)
            throw new E('client_secret length must be at least 16 char for safety. Got ', client_secret.length);

        this.#client_secret = client_secret;
        this.#ws = new nodeWebSocket(url);
            // throw new E('Must pass websocket class! Either the browser websocket, or a backend ws lib websocket')
        this.#ws.on('error', this.HandleError);
        this.#ws.on('message', this.#Message.bind(this));
    }

    #Message(d:string, isBinary:boolean){
        const { kind, data }: { kind: ClientMessageKind; data: MessageDataObj } = JSON.parse(d)

        switch(kind){
            case 'CON': 
                //@ts-ignore
                this.#client_id = data;//should just be a string
                if (this.#is_ready !== false && typeof this.#is_ready === "function")
                    this.#is_ready(true); //resolve promise to true
                if (this.verbose) this.done(`Connected.`, this.#client_id);

                this.#is_ready = true;
                break;
            case 'RES': 
                this.HandleInfo('recv:', kind, data);
                this.#HandleBasicPromiseMessage(data);
                break;
            case 'ERR':
                this.HandleError(new E('recv:', kind, data));
                this.#HandleBasicPromiseMessage(data);
                break;
            default: throw new E(`Unrecognized message kind!`, kind, data);
        }
    }

    //generates a unique key either via static counter or user provided key gen func
    get #GenKey(): id {
        AdminClient.#key += 1;
        return AdminClient.#key;
    }

    #HandleBasicPromiseMessage(data: MessageDataObj) {
        if (data.id in this.#queries)
            this.#queries[data.id](data?.result || null); //resolve query promise
        delete this.#queries[data.id]; //clear memory
    }

    Run(function_name:string, ...args:any[]){
        //create the promise
        const id = this.#GenKey;
        const prom = new Promise((res) => {
            this.#queries[id] = res
        });

        //send out the request
        this.#ws.send(JSON.stringify({ kind: 'ADMIN', data: { id: id, client_secret:this.#client_secret, function: function_name, args: args } }));

        //let the caller await the promise resolve
        return prom;
    }

    ready(): Promise<boolean> { return this.#is_ready === true ? (new Promise(res => res(true))) : (new Promise(res => this.#is_ready = res)) }

    Close(){this.#ws.close();}
}