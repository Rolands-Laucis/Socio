//I ask not for a lighter burden, but for broader shoulders. -Atlas, when asking Zeus for sympathy.

//regex
export const sql_string_regex = /(?<sql>.+?)(?<marker>--socio(?:-\w+?)*)?;?$/mi //markers currently support - auth, perm, \d+

//query helper functions
export function QueryIsSelect(sql = ''):boolean {
    return /^SELECT/im.test(sql)
}

export function ParseQueryTables(q = ''): string[] {
    return q
        .match(/(?:FROM|INTO)[\s\n\t](?<tables>[\w,\s\n\t]+?)[\s\n\t]?(?:\([\w\s,]+\)|WHERE|VALUES|;|LIMIT|GROUP|ORDER)/mi)
        ?.groups?.tables
        .split(/,[\s\n\t\r]*/mig)
        .map((t) => t.split(/[\s\n\t\r]/mi)[0].trim()) || []
}

//always returns uppercase verb if found
export function ParseQueryVerb(q=''): string | null{
    return q.match(/^(?<verb>SELECT|INSERT|DROP|UPDATE|CREATE)/mi)?.groups?.verb.toUpperCase() || null
}

//socio string marker utils
export function SocioArgsParse(str = ''): string[] {
    const marker = str.match(sql_string_regex)?.groups?.marker
    if (marker) return marker.slice(2).split('-')
    else return []
}

export function SocioArgHas(val = '', { parsed = null, str = '' }: { parsed?: string[] | null, str?: string }) {
    return val ? (parsed ? parsed.includes(val) : (str ? SocioArgsParse(str).includes(val) : false)) : false
}

//random
export function sleep(s=1){
    return new Promise(res => setTimeout(res, s*1000))
}