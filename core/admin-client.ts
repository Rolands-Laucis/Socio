//If God did not exist, it would be necessary to invent Him. /Voltaire/

import { E } from "./logging.js";
import { SocioClient, SocioClientOptions } from './core-client.js'

//types
type AdminClientOptions = { url:string, client_secret: string, socio_client_opts: SocioClientOptions }

export class AdminClient extends SocioClient {
    //private:
    #client_secret = '';

    constructor({ url='', client_secret = '', socio_client_opts={} }: AdminClientOptions){
        super(url, socio_client_opts);

        if (client_secret.length < 16)
            throw new E('client_secret length must be at least 16 char for safety. Got ', client_secret.length);

        this.#client_secret = client_secret;
    }

    Run(function_name:string, ...args:any[]){
        const {id, prom} = this.CreateQueryPromise();

        //send out the request
        this.Send('ADMIN', { id: id, client_secret: this.#client_secret, function: function_name, args: args });

        //let the caller await the promise resolve
        return prom;
    }
}
