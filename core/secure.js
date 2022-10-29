import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from 'crypto'

export class Secure{
    constructor({ secure_private_key = '', cipther_algorithm = 'AES-256-ctr', cipher_iv =''} = {}){
        if (!cipher_iv) cipher_iv = UUID()
        if (!secure_private_key || !cipther_algorithm || !cipher_iv) throw `Missing constructor arguments!`

        const te = new TextEncoder()

        this.key = te.encode(secure_private_key).slice(0,32)
        this.algo = cipther_algorithm
        this.iv = te.encode(cipher_iv).slice(0, 16)
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
        const cipher = createCipheriv(this.algo, Buffer.from(this.key), this.iv)
        return (cipher.update(query, 'utf-8', 'base64') + cipher.final('base64')).replace(/\\/g, '\\\\') //escape backslashes to avoid escaping in the js string when this is put back into the souce code
    }

    DecryptString(query = '') {
        const decipther = createDecipheriv(this.algo, Buffer.from(this.key), this.iv)
        query = query.replace(/\\\\/g, '\\') //remove the escaped backslashes to just backslashes
        return decipther.update(query, 'base64', 'utf-8') + decipther.final('utf-8')
    }
}


export function UUID() {
    return randomUUID()
}