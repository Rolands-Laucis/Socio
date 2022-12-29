//The aim of the wise is not to secure pleasure, but to avoid pain. /Aristotle/

"use strict";

import MagicString from 'magic-string'; //https://github.com/Rich-Harris/magic-string
import { randomUUID, createCipheriv, createDecipheriv, getCiphers, CipherCCMTypes, randomBytes, createHash } from 'crypto'
import { sql_string_regex } from './utils.js'
import { LogHandler, E } from './logging.js'

import { info, log, error, soft_error, done, setPrefix, setShowTime } from '@rolands/log'; setPrefix('SocioSecure'); setShowTime(false);

const default_cipher_algorithm_bits = 256
const default_cipher_algorithm = `aes-${default_cipher_algorithm_bits}-ctr`

//https://vitejs.dev/guide/api-plugin.html
//THE VITE PLUGIN - import into vite config and add into the plugins array with your params.
//it will go over your source code and replace --socio strings with their encrypted versions, that will be sent to the server and there will be decrypted using the below class
export function SocioSecurityPlugin({ secure_private_key = '', cipher_algorithm = default_cipher_algorithm, verbose = false } = {}){
    const ss = new SocioSecurity({secure_private_key, cipher_algorithm, verbose})
    return{
        name:'vite-socio-security',
        enforce: 'pre',
        transform(code:string, id:string){
            const ext = id.split('.').slice(-1)[0]
            if (['js', 'svelte', 'vue', 'jsx', 'ts', 'tsx'].includes(ext) && !id.match(/\/(node_modules|socio\/(core|core-client|secure))\//)) { // , 'svelte' 
                const s = ss.SecureSouceCode(code) //uses MagicString lib
                return {
                    code: s.toString(),
                    map: s.generateMap({source:id, includeContent:true})
                }
            }
            else return undefined;
        }
    }
}

export const string_regex = /(?<q>["'])(?<str>[^ ]+?.+?)\1/g // match all strings


//The aim of the wise is not to secure pleasure, but to avoid pain. /Aristotle/
export class SocioSecurity extends LogHandler {
    //private:
    #key: Buffer;
    #algo: CipherCCMTypes | string;

    //public:
    verbose=false
    rand_int_gen: ((min:number, max:number) => number) | null;
    rand_iv_gen: (size: number) => Buffer;

    //the default algorithm was chosen by me given these two videos of information:
    //https://www.youtube.com/watch?v=Rk0NIQfEXBA&ab_channel=Computerphile
    //https://www.youtube.com/watch?v=O4xNJsjtN6E&ab_channel=Computerphile
    //And a brief discussion on Cryptography Stack Exchange.
    //let me know if i am dumb.
    constructor({ secure_private_key = '', cipher_algorithm = default_cipher_algorithm, rand_int_gen = null, rand_iv_gen = randomBytes, verbose = false }: { secure_private_key: Buffer | string, cipher_algorithm?: string, rand_int_gen?: ((min: number, max: number) => number) | null, rand_iv_gen?: ((size: number) => Buffer), verbose: boolean } = { secure_private_key: '', cipher_algorithm: 'aes-192-gcm', verbose: false }){
        super(info, soft_error);
        
        if (!secure_private_key || !cipher_algorithm) throw new E(`Missing constructor arguments!`);
        if (typeof secure_private_key == 'string') secure_private_key = StringToByteBuffer(secure_private_key); //cast to buffer, if string was passed
        const default_cipher_algorithm_bytes = default_cipher_algorithm_bits / 8;
        if (secure_private_key.byteLength < default_cipher_algorithm_bytes) throw new E(`secure_private_key has to be at least ${default_cipher_algorithm_bytes} bytes length! Got ${secure_private_key.byteLength}`);
        if (!(getCiphers().includes(cipher_algorithm))) throw new E(`Unsupported algorithm [${cipher_algorithm}] by the Node.js Crypto module!`);

        this.#key = createHash('sha256').update(secure_private_key).digest().subarray(0, 32); //hash the key just to make sure to complicate the input key, if it is weak
        this.#algo = cipher_algorithm

        this.verbose = verbose
        this.rand_int_gen = rand_int_gen
        this.rand_iv_gen = rand_iv_gen;
        if (this.verbose) done('Initialized SocioSecurity object succesfully!')
    }
    
    //sql strings must be in single or double quotes and have an sql single line comment at the end with the socio marker, e.g. "--socio" etc. See the sql_string_regex pattern in core/utils
    SecureSouceCode(source_code = '') {
        //@ts-ignore
        const s = new MagicString(source_code);

        //loop over match iterator f
        for (const m of source_code.matchAll(string_regex)){ //loop over all strings in either '' or ""
            const found = m?.groups?.str?.match(sql_string_regex)?.groups || {}
            if (found?.sql && found?.marker && m.groups?.q && m.index)
                s.update(m.index, m.index + m[0].length, this.EncryptSocioString(m.groups.q, found.sql, found.marker));
        }

        return s
    }

    EncryptString(str = ''): string {
        const iv = this.rand_iv_gen(16);
        const cipher = createCipheriv(this.#algo, this.#key, iv)
        const cipher_text = iv.toString('base64') + ' ' + cipher.update(str, 'utf-8', 'base64') + cipher.final('base64'); //Base64 only contains A–Z , a–z , 0–9 , + , / and =
        return cipher_text
    }

    DecryptString(cipher_text:string, iv_base64:string):string {
        const iv = Buffer.from(iv_base64, 'base64')
        const decipther = createDecipheriv(this.#algo, this.#key, iv)
        return decipther.update(cipher_text, 'base64', 'utf-8') + decipther.final('utf-8')
    }

    //surrouded by the same quotes as original, the sql gets encrypted along with its marker, so neither can be altered on the front end. 
    //+ a random int to scramble and randomize the encrypted string for every build.
    EncryptSocioString(q='', sql='', marker=''){
        return q + this.EncryptString(sql + (marker ? marker : '--socio') + '-' + this.GenRandInt()) + q //`--${this.GenRandInt()}\n` +
    }

    GenRandInt(min = 1000, max = 100_000):number{
        return this.rand_int_gen ? this.rand_int_gen(min, max) : Math.floor((Math.random() * (max - min)) + min)
    }

    get supportedCiphers() { return getCiphers() } //convenience
    get defaultCipher() { return default_cipher_algorithm }//convenience
}

export function StringToByteBuffer(str: string) { return Buffer.from(str, 'utf8'); }
export function GenRandomBytes(size: number) { return randomBytes(size); }
export function UUID() {return randomUUID();}