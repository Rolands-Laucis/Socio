//I ask not for a lighter burden, but for broader shoulders. -Atlas, when asking Zeus for sympathy.

import { QueryMarker } from "./types.js"

export type SocioStringObj = { str: string, markers: string[] };

//regex
export const socio_string_regex = /(?<str>.+?)(?<marker>--socio(?:-\w+?)*)?;?$/mi //markers currently support - auth, perm, \d+

//query helper functions
export function QueryIsSelect(sql: string):boolean {
    return /^SELECT/im.test(sql)
}

// /(?:FROM|INTO)[\s\n\t](?<tables>[\w,\s\n\t]+?)[\s\n\t]?(?:\([\w\s,]+\)|WHERE|VALUES|;|LIMIT|GROUP|ORDER)/mi
export function ParseQueryTables(q: string): string[] {
    return q
        .match(/(?:FROM|INTO)[\s\n\r\t]+(?<tables>[\w,\s\n\t]+?)([\s\n\r\t]+)?(?:\(|WHERE|VALUES|;|LIMIT|GROUP|ORDER)/mi)
        ?.groups?.tables
        .split(/,[\s\n\t\r]*/mig)
        .map((t) => t.split(/[\s\n\t\r]/mi)[0].trim()) || []
}

//always returns uppercase verb if found
export function ParseQueryVerb(q:string): string | null{
    return q.match(/^(?<verb>SELECT|INSERT|DROP|UPDATE|CREATE)/mi)?.groups?.verb.toUpperCase() || null
}

//socio string marker utils
export function SocioStringParse(str:string): SocioStringObj {
    const m = str.match(socio_string_regex)?.groups
    return { str: m?.str || '', markers: m?.marker ? m.marker.slice(2).split('-') : [] } //the slice(2) is to remove the starting --
}

export function SocioMarkerHas(marker: QueryMarker, { parsed = null, str = '' }: { parsed?: string[] | null, str?: string }) {
    return marker ? (parsed ? parsed.includes(marker) : (str ? SocioStringParse(str).markers.includes(marker) : false)) : false
}

//random
export function sleep(seconds:number=2){
    return new Promise(res => setTimeout(res, seconds *1000))
}

//https://stackoverflow.com/a/40577337/8422448
export function GetAllMethodNamesOf(obj: any): string[] {
    const methods: Set<string> = new Set();
    while (obj = Reflect.getPrototypeOf(obj)) {
        Reflect.ownKeys(obj)
            .map(k => k.toString()) //bcs some might be symbols
            .filter(k =>
                k != 'constructor'
                && !k.startsWith('__')
            ).forEach((k) => methods.add(k));
    }
    return [...methods];
}