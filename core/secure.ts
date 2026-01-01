//The aim of the wise is not to secure pleasure, but to avoid pain. /Aristotle/

"use strict";

import MagicString from 'magic-string'; //https://github.com/Rich-Harris/magic-string
import { randomUUID, createCipheriv, createDecipheriv, getCiphers, randomBytes, createHash, type CipherGCMTypes } from 'crypto'; //https://nodejs.org/api/crypto.html
import { socio_string_regex } from './sql-parsing.js';
import { LogHandler, E, log, info, done } from './logging.js';
import { extname } from 'path';

//types
import type { LoggingOpts } from './types.d.ts';
export type SocioSecurityOptions = { secure_private_key: Buffer | string, rand_int_gen?: ((min: number, max: number) => number) } & LoggingOpts;
export type SocioSecurityPluginOptions = { include_file_types?: string[], exclude_file_types?: string[], exclude_svelte_server_files?: boolean, exclude_regex?:RegExp };

//it was recommended on a forum to use 256 bits, even though 128 is still perfectly safe
const cipher_algorithm_bits = 256;
//GCM mode insures these properties of the cipher text - Confidentiality: cant read the msg, Integrity: cant alter the msg, Authenticity: the originator (your server) of the msg can be verified
//https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-38d.pdf
const cipher_algorithm: CipherGCMTypes = `aes-${cipher_algorithm_bits}-gcm`;

//https://vitejs.dev/guide/api-plugin.html
//THE VITE PLUGIN - import into vite config and add into the plugins array with your params.
//it will go over your source code and replace --socio[-marker] strings with their encrypted versions, that will be sent to the server and there will be decrypted using the below class
export function SocioSecurityVitePlugin(SocioSecurityOptions: SocioSecurityOptions, { include_file_types = ['js', 'svelte', 'vue', 'jsx', 'ts', 'tsx'], exclude_file_types = [], exclude_svelte_server_files = true, exclude_regex }: SocioSecurityPluginOptions = {}) {
    const ss = new SocioSecurity(SocioSecurityOptions);
    return {
        name: 'vite-socio-security',
        enforce: 'pre',
        transform(code: string, id: string) {
            if (/.*\/(node_modules|socio\/core|socio\/dist)\//.test(id)) return undefined; //skip node_modules files
            if (exclude_svelte_server_files && /.*\.server\.(js|ts)$/.test(id)) return undefined; //skip *.server files (svelte)

            const ext = extname(id).slice(1); //remove the .
            if (exclude_file_types.includes(ext) || (exclude_regex && exclude_regex.test(id))) return undefined; //skip excluded
            if (!(include_file_types.includes(ext))) return undefined; //skip if not included

            const s = ss.SecureSouceCode(code, id); //uses MagicString lib
            return {
                code: s.toString(),
                map: s.generateMap({ source: id, includeContent: true })
            }
        },
    }
}

//The aim of the wise is not to secure pleasure, but to avoid pain. /Aristotle/
export class SocioSecurity extends LogHandler {
    //private:
    #key: Buffer;
    #rand_int_gen?: ((min: number, max: number) => number);
    static iv_counter: number = 1; //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures The Number type is a double-precision 64-bit binary format IEEE 754 value.

    //public:
    verbose=false;

    //the default algorithm was chosen by me given these two videos of information:
    //https://www.youtube.com/watch?v=Rk0NIQfEXBA&ab_channel=Computerphile
    //https://www.youtube.com/watch?v=O4xNJsjtN6E&ab_channel=Computerphile
    //And a brief discussion on Cryptography Stack Exchange.
    //let me know if i am dumb.
    constructor({ secure_private_key = '', rand_int_gen = undefined, logging = { verbose: false, hard_crash: false } }: SocioSecurityOptions){
        super({ ...logging, prefix: 'SocioSecurity' });
        
        if (!secure_private_key) throw new E(`Missing secure_private_key constructor argument!`);
        if (typeof secure_private_key == 'string') secure_private_key = StringToByteBuffer(secure_private_key); //cast to buffer, if string was passed
        const cipher_algorithm_bytes = cipher_algorithm_bits / 8;
        if (secure_private_key.byteLength < cipher_algorithm_bytes) throw new E(`secure_private_key has to be at least ${cipher_algorithm_bytes} bytes length! Got ${secure_private_key.byteLength}`);
        // if (!(getCiphers().includes(cipher_algorithm))) throw new E(`Unsupported algorithm [${cipher_algorithm}] by the Node Crypto module!`);

        this.#key = createHash('sha256').update(secure_private_key).digest().subarray(0, cipher_algorithm_bytes); //hash the key just to make sure to complicate the input key, if it is weak

        this.verbose = logging.verbose || false;
        this.#rand_int_gen = rand_int_gen;
        if (this.verbose) this.done('Initialized SocioSecurity object succesfully!');
    }
    
    //sql strings must be in single or double quotes and have an sql single line comment at the end with the socio marker, e.g. "--socio" etc. See the socio_string_regex pattern in core/utils
    //file_path is optional - for debugging.
    SecureSouceCode(source_code: string = '', file_path:string='') {
        //@ts-ignore
        const s = new MagicString(source_code);

        //loop over match iterator f
        for (const m of source_code.matchAll(socio_string_regex)){ //loop over all strings in either '' or ""
            if(m.index)
                s.update(m.index, m.index + m[0].length, this.EncryptSocioString(m.groups?.sql));
        }

        return s
    }

    //returns a string in the format "[iv_base64] [encrypted_text_base64] [auth_tag_base64]" where each part is base64 encoded
    EncryptString(str:string = ''): string {
        const iv = this.get_next_iv();
        const cipher = createCipheriv(cipher_algorithm, this.#key, iv);
        const cipher_text = cipher.update(str, 'utf-8', 'base64') + cipher.final('base64');
        //Base64 only contains A–Z , a–z , 0–9 , + , / and =
        const auth_tag = cipher.getAuthTag().toString('base64');
        return [iv.toString('base64'), cipher_text, auth_tag].join(' ');
    }
    DecryptString(iv_base64: string, cipher_text: string, auth_tag_base64:string):string {
        try{
            const iv = Buffer.from(iv_base64, 'base64');
            const auth_tag = Buffer.from(auth_tag_base64, 'base64');
            const decipher = createDecipheriv(cipher_algorithm, this.#key, iv);
            decipher.setAuthTag(auth_tag) //set the tag for verification.
            return decipher.update(cipher_text, 'base64', 'utf-8') + decipher.final('utf-8');
        }catch (e){
            throw new E('SocioSecurity.DecryptString() error. Perhaps secret keys mismatch.', e)
        }
    }

    //surrouded by the same quotes as original, the sql gets encrypted along with its marker, so neither can be altered on the front end.
    //to mitigate known plaintext attacks, all spaces are replaced with random ints 
    EncryptSocioString(sql: string = ''){
        let randint_sql = '';
        for(const l of sql){
            if (l == ' ') randint_sql += `-;¦${this.GenRandInt(100,999)}`;
            else randint_sql += l;
        }
        randint_sql = `-;¦${this.GenRandInt(100, 999)}${randint_sql}-;¦${this.GenRandInt(100, 999)}`
        return `\`${this.EncryptString(randint_sql)}\``;
    }
    RemoveRandInts(randint_sql: string =''){
        return randint_sql.replace(/-;¦\d{3}/gi, ' ');
    }

    GenRandInt(min:number = 10_000, max:number = 100_000_000):number{
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