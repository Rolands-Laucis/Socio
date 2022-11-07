import MagicString from 'magic-string'; //https://github.com/Rich-Harris/magic-string
import { randomUUID, createCipheriv, createDecipheriv, getCiphers } from 'crypto'

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
export function SocioSecurityPlugin({ secure_private_key = '', cipther_algorithm = 'aes-256-ctr', cipher_iv = '', verbose = false } = {}){
    const ss = new SocioSecurity({secure_private_key:secure_private_key, cipther_algorithm:cipther_algorithm, cipher_iv:cipher_iv, verbose:verbose})
    return{
        name:'vite-socio-security',
        enforce: 'pre',
        transform(code, id){
            const ext = id.split('.').slice(-1)[0]
            if (['js', 'svelte', 'vue', 'jsx', 'ts'].includes(ext) && !id.match(/\/(node_modules|socio\/(core|core-client|secure))\//)) { // , 'svelte' 
                const s = ss.SecureSouceCode(code) //uses MagicString lib
                // log(id)
                return {
                    code: s.toString(),
                    map: s.generateMap({source:id, includeContent:true})
                }
            }                
        }
    }
}

///(?<pre>\.subscribe\(\s*|\.query\(\s*|sql\s*:\s*)"(?<sql>[^"]+?)(?<post>--socio)"/ig
const string_regex = /(?<q>["'])(?<str>[^ ]+? .+?)\1/g // /(?<q>["'])(?<str>.+?)\1/ig // match all strings
const sql_string_regex = /(?<sql>.+?)(?<post>--socio;?)$/im //get the sql out of the string

//The aim of the wise is not to secure pleasure, but to avoid pain. /Aristotle/
export class SocioSecurity{
    //private:
    #key=''
    #algo=''
    #iv=''

    constructor({ secure_private_key = '', cipther_algorithm = 'aes-256-ctr', cipher_iv ='', verbose=false} = {}){
        if (!cipher_iv) cipher_iv = UUID()
        if (!secure_private_key || !cipther_algorithm || !cipher_iv) throw `Missing constructor arguments!`
        if (secure_private_key.length < 32) throw `secure_private_key has to be at least 32 characters! Got ${secure_private_key.length}`
        if (cipher_iv.length < 16) throw `cipher_iv has to be at least 16 characters! Got ${cipher_iv.length}`
        if (!(getCiphers().includes(cipther_algorithm))) throw `Unsupported algorithm [${cipther_algorithm}] by the Node.js Crypto module!`

        const te = new TextEncoder()

        this.#key = te.encode(secure_private_key).slice(0,32) //has to be this length
        this.#algo = cipther_algorithm
        this.#iv = te.encode(cipher_iv).slice(0, 16) //has to be this length

        if (verbose) done('Initialized SocioSecurity object succesfully')
    }
    
    //sql strings must be in double quotes and have an sql single line comment at the end with the name socio - "--socio" ^ see the sql_string_regex pattern
    SecureSouceCode(source_code = '') {
        const s = new MagicString(source_code);

        for (const m of source_code.matchAll(string_regex)){
            const sql = m.groups.str.match(sql_string_regex)
            if (sql?.groups?.sql){
                s.update(m.index, m.index + m[0].length, m.groups.q + this.EncryptString(sql.groups.sql) + m.groups.q)
            }
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
}


export function UUID() {
    return randomUUID()
}