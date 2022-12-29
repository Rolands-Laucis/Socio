//I ask not for a lighter burden, but for broader shoulders. -Atlas, when asking Zeus for sympathy.

import { QueryMarker } from "./types.js"

//regex
export const sql_string_regex = /(?<sql>.+?)(?<marker>--socio(?:-\w+?)*)?;?$/mi //markers currently support - auth, perm, \d+

//query helper functions
export function QueryIsSelect(sql: string):boolean {
    return /^SELECT/im.test(sql)
}

export function ParseQueryTables(q: string): string[] {
    return q
        .match(/(?:FROM|INTO)[\s\n\t](?<tables>[\w,\s\n\t]+?)[\s\n\t]?(?:\([\w\s,]+\)|WHERE|VALUES|;|LIMIT|GROUP|ORDER)/mi)
        ?.groups?.tables
        .split(/,[\s\n\t\r]*/mig)
        .map((t) => t.split(/[\s\n\t\r]/mi)[0].trim()) || []
}

//always returns uppercase verb if found
export function ParseQueryVerb(q:string): string | null{
    return q.match(/^(?<verb>SELECT|INSERT|DROP|UPDATE|CREATE)/mi)?.groups?.verb.toUpperCase() || null
}

//socio string marker utils
export function SocioArgsParse(str:string): string[] {
    const marker = str.match(sql_string_regex)?.groups?.marker
    if (marker) return marker.slice(2).split('-')
    else return []
}

export function SocioArgHas(marker: QueryMarker, { parsed = null, str = '' }: { parsed?: string[] | null, str?: string }) {
    return marker ? (parsed ? parsed.includes(marker) : (str ? SocioArgsParse(str).includes(marker) : false)) : false
}

//random
export function sleep(seconds:number=2){
    return new Promise(res => setTimeout(res, seconds *1000))
}