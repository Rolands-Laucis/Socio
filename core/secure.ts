//The aim of the wise is not to secure pleasure, but to avoid pain. /Aristotle/

"use strict";

import MagicString from 'magic-string'; //https://github.com/Rich-Harris/magic-string
import { randomUUID, createCipheriv, createDecipheriv, getCiphers, randomBytes, createHash } from 'crypto'
import type { CipherGCMTypes } from 'crypto'
import { socio_string_regex } from './utils.js'
import { LogHandler, E, log, info, done } from './logging.js'

//it was recommended on a forum to use 256 bits, even though 128 is still perfectly safe
const cipher_algorithm_bits = 256
//GCM mode insures these properties of the cipher text - Confidentiality: cant read the msg, Integrity: cant alter the msg, Authenticity: the originator of the msg can be verified
//https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-38d.pdf
const cipher_algorithm: CipherGCMTypes = `aes-${cipher_algorithm_bits}-gcm` //called "default", bcs i used to allow the user to choose the algo, but not anymore.

//https://vitejs.dev/guide/api-plugin.html
//THE VITE PLUGIN - import into vite config and add into the plugins array with your params.
//it will go over your source code and replace --socio strings with their encrypted versions, that will be sent to the server and there will be decrypted using the below class
export function SocioSecurityPlugin({ secure_private_key = '', verbose = false } = {}){
    const ss = new SocioSecurity({ secure_private_key, verbose})
    return{
        name:'vite-socio-security',
        enforce: 'pre',
        transform(code:string, id:string){
            const ext = id.split('.').slice(-1)[0]
            if (/.*\.server\.(js|ts)$/.test(id)) return undefined; //skip *.server.ts files

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
    #rand_int_gen: ((min: number, max: number) => number) | null;
    static iv_counter: number = 1; //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures The Number type is a double-precision 64-bit binary format IEEE 754 value.

    //public:
    verbose=false

    //the default algorithm was chosen by me given these two videos of information:
    //https://www.youtube.com/watch?v=Rk0NIQfEXBA&ab_channel=Computerphile
    //https://www.youtube.com/watch?v=O4xNJsjtN6E&ab_channel=Computerphile
    //And a brief discussion on Cryptography Stack Exchange.
    //let me know if i am dumb.
    constructor({ secure_private_key = '', rand_int_gen = null, verbose = false }: { secure_private_key: Buffer | string, rand_int_gen?: ((min: number, max: number) => number) | null, verbose: boolean } = { secure_private_key: '', verbose: false }){
        super({ verbose, prefix: 'SocioSecurity' });
        
        if (!secure_private_key) throw new E(`Missing constructor arguments!`);
        if (typeof secure_private_key == 'string') secure_private_key = StringToByteBuffer(secure_private_key); //cast to buffer, if string was passed
        const cipher_algorithm_bytes = cipher_algorithm_bits / 8;
        if (secure_private_key.byteLength < cipher_algorithm_bytes) throw new E(`secure_private_key has to be at least ${cipher_algorithm_bytes} bytes length! Got ${secure_private_key.byteLength}`);
        // if (!(getCiphers().includes(cipher_algorithm))) throw new E(`Unsupported algorithm [${cipher_algorithm}] by the Node.js Crypto module!`);

        this.#key = createHash('sha256').update(secure_private_key).digest().subarray(0, 32); //hash the key just to make sure to complicate the input key, if it is weak

        this.verbose = verbose;
        this.#rand_int_gen = rand_int_gen;
        if (this.verbose) this.done('Initialized SocioSecurity object succesfully!')
    }
    
    //sql strings must be in single or double quotes and have an sql single line comment at the end with the socio marker, e.g. "--socio" etc. See the socio_string_regex pattern in core/utils
    SecureSouceCode(source_code = '') {
        //@ts-ignore
        const s = new MagicString(source_code);

        //loop over match iterator f
        for (const m of source_code.matchAll(string_regex)){ //loop over all strings in either '' or ""
            const found = m?.groups?.str?.match(socio_string_regex)?.groups || {}
            if (found?.str && found?.marker && m.groups?.q && m.index)
                s.update(m.index, m.index + m[0].length, this.EncryptSocioString(m.groups.q, found.str, found.marker));
        }

        return s
    }

    //returns a string in the format "[iv_base64] [encrypted_text_base64] [auth_tag_base64]" where each part is base64 encoded
    EncryptString(str = ''): string {
        const iv = this.get_next_iv();
        const cipher = createCipheriv(cipher_algorithm, this.#key, iv);
        const cipher_text = cipher.update(str, 'utf-8', 'base64') + cipher.final('base64');
        //Base64 only contains A–Z , a–z , 0–9 , + , / and =
        const auth_tag = cipher.getAuthTag().toString('base64');
        return [iv.toString('base64'), cipher_text, auth_tag].join(' ');
    }
    DecryptString(iv_base64: string, cipher_text: string, auth_tag_base64:string):string {
        const iv = Buffer.from(iv_base64, 'base64');
        const auth_tag = Buffer.from(auth_tag_base64, 'base64');
        const decipher = createDecipheriv(cipher_algorithm, this.#key, iv);
        decipher.setAuthTag(auth_tag) //set the tag for verification.
        return decipher.update(cipher_text, 'base64', 'utf-8') + decipher.final('utf-8')
    }

    //surrouded by the same quotes as original, the sql gets encrypted along with its marker, so neither can be altered on the front end.
    //to mitigate known plaintext attacks, all spaces are replaced with random ints 
    EncryptSocioString(q='', sql='', marker=''){
        let sql_alter = ''
        for(const l of sql){
            if (l == ' ') sql_alter += `-;¦${this.GenRandInt(10,99)}`;
            else sql_alter += l;
        }
        return q + this.EncryptString(sql_alter + (marker || '--socio')) + q;
    }
    RemoveRandInts(altered_sql=''){
        return altered_sql.replace(/-;¦\d{2}/gi, ' ');
    }

    GenRandInt(min = 10_000, max = 100_000_000):number{
        return this.#rand_int_gen ? this.#rand_int_gen(min, max) : Math.floor((Math.random() * (max - min)) + min);
    }

    get supportedCiphers() { return getCiphers() } //convenience
    get defaultCipher() { return cipher_algorithm }//convenience
    get_next_iv(){
        const iv = Buffer.alloc(8); //create 8 byte buffer
        SocioSecurity.iv_counter += 1; //increment global iv counter
        iv.writeUInt32LE(SocioSecurity.iv_counter); //write the iv counter number as bytes to buffer
        return Buffer.concat([iv, randomBytes(8)]); //create a required 16 byte buffer from the iv 8 byte + another 8 random bytes
    }
}

export function StringToByteBuffer(str: string) { return Buffer.from(str, 'utf8'); }
export function GenRandomBytes(size: number) { return randomBytes(size); }
export function UUID() {return randomUUID();}