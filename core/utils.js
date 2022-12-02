//I ask not for a lighter burden, but for broader shoulders. -Atlas, when asking Zeus for sympathy.

"use strict";

export const sql_string_regex = /(?<sql>.+?)(?<marker>--socio(?:-\w+?)*)?;?$/mi

export function QueryIsSelect(sql = '') {
    return /^SELECT/im.test(sql)
}

export function ParseQueryTables(q = '') {
    return q
        .match(/(?:FROM|INTO)[\s\n\t](?<tables>[\w,\s\n\t]+?)[\s\n\t]?(?:WHERE|VALUES|;|LIMIT|GROUP|ORDER)/mi)
        ?.groups?.tables
        .split(/,[\s\n\t\r]*/mig)
        .map((t) => t.split(/[\s\n\t\r]/mi)[0].trim()) || []
}

export function SocioArgsParse(str=''){
    const marker = str.match(sql_string_regex)?.groups?.marker
    if(marker) return marker.slice(2).split('-')
    else return []
}

export function SocioArgHas(val = '', { parsed = null, str = '' } = {}){
    return parsed ? parsed.includes(val) : SocioArgsParse(str).includes(val)
}

//always returns uppercase verb if found
export function ParseQueryVerb(q=''){
    return q.match(/^(?<verb>SELECT|INSERT|DROP|UPDATE|CREATE)/mi)?.groups?.verb.toUpperCase() || null
}

export class SocioRateLimit{
    constructor(){
        
    }
}