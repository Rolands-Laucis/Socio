//I ask not for a lighter burden, but for broader shoulders. -Atlas, when asking Zeus for sympathy.

import type { QueryMarker } from "./types.d.ts";
import type { SocioStringObj } from "./sql-parsing.js";

// these are not types, but compile to js dicts, so cannot be imported as types, but also cannot be declared in types.d.ts, bcs that doesnt produce a js file
export enum CoreMessageKind {
    SUB, UNSUB, SQL, PING, AUTH, GET_PERM, PROP_SUB, PROP_UNSUB, PROP_GET, PROP_SET, PROP_REG, SERV, ADMIN, RECON, UP_FILES, GET_FILES, IDENTIFY, DISCOVERY
};

//socio string marker utils
export const socio_string_markers_regex = /--(?<markers>(?:-?(?:socio|auth|perm))*)/i;
export function SocioStringParse(str: string): SocioStringObj {
    const markers = str.match(socio_string_markers_regex)?.groups?.markers;
    return { str, markers: markers ? markers.split('-') : [] };
}
export function SocioMarkerHas(marker: QueryMarker, { parsed = null, str = '' }: { parsed?: string[] | null, str?: string }) {
    return marker ? (parsed ? parsed.includes(marker) : (str ? SocioStringParse(str).markers.includes(marker) : false)) : false
}

// TS/JS helpers
// Helper to dynamically generate default hooks dict of undefineds
export function initLifecycleHooks<T extends Record<string, unknown>>(): T {
    return {} as T; // Use an empty object to simulate "undefined" for all properties
}

//misc
export function sleep(seconds: number = 2) {
    return new Promise(res => setTimeout(res, seconds * 1000))
}
export function clamp(x:number, min:number, max:number){
    return Math.min(Math.max(x, min), max);
}

//Credit: https://stackoverflow.com/a/40577337/8422448 (modified)
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

//copy pasted from WS repo: https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback:~:text=subprotocols%20is%20used.-,perMessageDeflate,-can%20be%20used
export const perMessageDeflate = {
    zlibDeflateOptions: {
        // See zlib defaults.
        chunkSize: 1024,
        memLevel: 7,
        level: 3
    },
    zlibInflateOptions: {
        chunkSize: 10 * 1024
    },
    // Other options settable:
    clientNoContextTakeover: true, // Defaults to negotiated value.
    serverNoContextTakeover: true, // Defaults to negotiated value.
    serverMaxWindowBits: 10, // Defaults to negotiated value.
    // Below options specified as default values.
    concurrencyLimit: 10, // Limits zlib concurrency for perf.
    threshold: 1024 // Size (in bytes) below which messages
    // should not be compressed if context takeover is disabled.
}

//JSON utils for Maps ------------- Credit: STEVE SEWELL https://www.builder.io/blog/maps
// export function MapReplacer(key: string, value: any) {
//     if (value instanceof Map) {
//         return { __type: 'Map', value: Object.fromEntries(value) }
//     }
//     if (value instanceof Set) {
//         return { __type: 'Set', value: Array.from(value) }
//     }
//     return value
// }
// export function MapReviver(key: string, value: any) {
//     if (value?.__type === 'Set') {
//         return new Set(value.value)
//     }
//     if (value?.__type === 'Map') {
//         return new Map(Object.entries(value.value))
//     }
//     return value
// }

// YAML utils for Maps and Sets ------------- https://www.npmjs.com/package/js-yaml
import yaml from 'js-yaml';
const mapType = new yaml.Type('!map', {
    kind: 'mapping',
    construct: (data) => new Map(Object.entries(data)),
    instanceOf: Map,
    // @ts-expect-error
    represent: (map:Map<string, any>) => Object.fromEntries(map.entries())
});
const setType = new yaml.Type('!set', {
    kind: 'sequence',
    construct: data => new Set(data),
    instanceOf: Set,
    // @ts-expect-error
    represent: (set:Set<any>) => Array.from(set)
});
export const schema = yaml.DEFAULT_SCHEMA.extend([mapType, setType]);
// export const yaml_dump_opts = { schema, indent: 1, noArrayIndent: true };
export function yaml_stringify(o:any){return yaml.dump(o, { schema, indent: 1, noArrayIndent: true });}
export function yaml_parse(str: string) {return yaml.load(str, { schema }) as any;}

// Credit: https://gist.github.com/jlevy/c246006675becc446360a798e2b2d781 (modified) 
// super simple, naive, yet fast way to generate a hash for a subscription query. Used to keep a cache while in the core Update function.
export function FastHash(str:string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return hash;
}