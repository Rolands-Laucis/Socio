//The aim of the wise is not to secure pleasure, but to avoid pain. /Aristotle/

"use strict";

import MagicString from 'magic-string'; //https://github.com/Rich-Harris/magic-string
import { randomUUID, createCipheriv, createDecipheriv, getCiphers } from 'crypto'
import { SocioArgsParse, sql_string_regex } from './utils.js'

try { //for my logger
    var { info, log, error, done, setPrefix, setShowTime } = await import('@rolands/log')
    setPrefix('Socio Secure')
    setShowTime(false)
} catch (e) {
    console.log('[Socio Secure ERROR]', e)
    var info = (...objs) => console.log('[Socio Secure]', ...objs)
    var done = (...objs) => console.log('[Socio Secure]', ...objs)
    var log = (...objs) => console.log('[Socio Secure]', ...objs)
}

//https://vitejs.dev/guide/api-plugin.html
//THE VITE PLUGIN - import into vite config and add into the plugins array with your params.
//it will go over your source code and replace --socio strings with their encrypted versions, that will be sent to the server and there will be decrypted using the below class
export function SocioSecurityPlugin({ secure_private_key = '', cipther_algorithm = 'aes-256-ctr', cipher_iv = '', verbose = false } = {}){
    const ss = new SocioSecurity({secure_private_key:secure_private_key, cipther_algorithm:cipther_algorithm, cipher_iv:cipher_iv, verbose:verbose})
    return{
        name:'vite-socio-security',
        enforce: 'pre',
        transform(code, id){
            const ext = id.split('.').slice(-1)[0]
            if (['js', 'svelte', 'vue', 'jsx', 'ts'].includes(ext) && !id.match(/\/(node_modules|socio\/(core|core-client|secure))\//)) { // , 'svelte' 
                const s = ss.SecureSouceCode(code) //uses MagicString lib
                return {
                    code: s.toString(),
                    map: s.generateMap({source:id, includeContent:true})
                }
            }                
        }
    }
}

export const string_regex = /(?<q>["'])(?<str>[^ ]+?.+?)\1/g // match all strings


//The aim of the wise is not to secure pleasure, but to avoid pain. /Aristotle/
export class SocioSecurity{
    //private:
    #key=''
    #algo=''
    #iv=''

    //public:
    verbose=false
    rand_int_gen=null

    constructor({ secure_private_key = '', cipther_algorithm = 'aes-256-ctr', cipher_iv ='', rand_int_gen=null, verbose=false} = {}){
        if (!cipher_iv) cipher_iv = UUID()
        if (!secure_private_key || !cipther_algorithm || !cipher_iv) throw `Missing constructor arguments!`
        if (secure_private_key.length < 32) throw `secure_private_key has to be at least 32 characters! Got ${secure_private_key.length}`
        if (cipher_iv.length < 16) throw `cipher_iv has to be at least 16 characters! Got ${cipher_iv.length}`
        if (!(getCiphers().includes(cipther_algorithm))) throw `Unsupported algorithm [${cipther_algorithm}] by the Node.js Crypto module!`

        const te = new TextEncoder()

        this.#key = te.encode(secure_private_key).slice(0,32) //has to be this length
        this.#algo = cipther_algorithm
        this.#iv = te.encode(cipher_iv).slice(0, 16) //has to be this length

        this.verbose = verbose
        this.rand_int_gen = rand_int_gen
        if (this.verbose) done('Initialized SocioSecurity object succesfully')
    }
    
    //sql strings must be in single or double quotes and have an sql single line comment at the end with the socio marker, e.g. "--socio" etc. See the sql_string_regex pattern in core/utils
    SecureSouceCode(source_code = '') {
        const s = new MagicString(source_code);

        //loop over match iterator f
        for (const m of source_code.matchAll(string_regex)){ //loop over all strings in either '' or ""
            const found = m?.groups?.str?.match(sql_string_regex)?.groups || {}
            if (found?.sql && found?.marker && m.groups?.q)
                s.update(m.index, m.index + m[0].length, this.EncryptSocioString(m.groups.q, found.sql, found.marker));
        }

        return s
    }

    EncryptString(query = '') {
        const cipher = createCipheriv(this.#algo, Buffer.from(this.#key), this.#iv)
        return (cipher.update(query, 'utf-8', 'base64') + cipher.final('base64')) //Base64 only contains A–Z , a–z , 0–9 , + , / and =
    }

    DecryptString(query = '') {
        const decipther = createDecipheriv(this.#algo, Buffer.from(this.#key), this.#iv)
        return decipther.update(query, 'base64', 'utf-8') + decipther.final('utf-8')
    }

    //surrouded by the same quotes as original, the sql gets encrypted along with its marker, so neither can be altered on the front end. 
    //+ a random int to scramble and randomize the encrypted string for every build.
    EncryptSocioString(q='', sql='', marker=''){
        return q + this.EncryptString(sql + (marker ? marker : '--socio') + '-' + this.GenRandInt()) + q
    }

    GenRandInt(min = 100, max = 10_000){
        return this.rand_int_gen ? this.rand_int_gen(min, max) : Math.floor((Math.random() * (max - min)) + min)
    }
}


export function UUID() {
    return randomUUID()
}