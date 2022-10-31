import { randomUUID, createCipheriv, createDecipheriv } from 'crypto'

//The aim of the wise is not to secure pleasure, but to avoid pain. /Aristotle/
export class SocioSecurity{
    //private:
    #key=''
    #algo=''
    #iv=''

    constructor({ secure_private_key = '', cipther_algorithm = 'AES-256-ctr', cipher_iv =''} = {}){
        if (!cipher_iv) cipher_iv = UUID()
        if (!secure_private_key || !cipther_algorithm || !cipher_iv) throw `Missing constructor arguments!`
        if (secure_private_key.length < 32) throw `secure_private_key has to be at least 32 characters! Got ${secure_private_key.length}`
        if (cipher_iv.length < 16) throw `cipher_iv has to be at least 16 characters! Got ${cipher_iv.length}`
        if (!crypto.getCiphers().includes(cipther_algorithm)) throw `Unsupported algorithm [${cipther_algorithm}] by the Node.js Crypto module!`

        const te = new TextEncoder()

        this.#key = te.encode(secure_private_key).slice(0,32) //has to be this length
        this.#algo = cipther_algorithm
        this.#iv = te.encode(cipher_iv).slice(0, 16) //has to be this length
    }
    
    //sql strings must be in single quotes and have an sql single line comment at the end with the name socio - "--socio"
    Secure(source_code = '') {
        const sql_string_regex = /'(?<sql>[^']+?)--socio'/i
        return source_code.split('\n').map(line => {
            const m = line.match(sql_string_regex)
            return m?.groups?.sql ? line.replace(sql_string_regex, '\'' + this.EncryptString(m.groups.sql) + '\'') : line
        }).join('\n')
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