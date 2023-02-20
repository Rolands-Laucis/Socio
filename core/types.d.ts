export type id = string | number;
export type Bit = 0 | 1;

export type PropKey = string;
export type PropValue = object | string | number | null;
export type PropAssigner = (key: PropKey, new_val:PropValue) => boolean;

//msg kinds
export type CoreMessageKind = 'SUB' | 'UNSUB' | 'SQL' | 'PING' | 'AUTH' | 'GET_PERM' | 'PROP_SUB' | 'PROP_UNSUB' | 'PROP_GET' | 'PROP_SET' | 'SERV' | 'ADMIN' | 'RECON' | 'FILES';
export type ClientMessageKind = 'CON' | 'UPD' | 'PONG' | 'AUTH' | 'GET_PERM' | 'RES' | 'ERR' | 'PROP_UPD' | 'CMD' | 'RECON';

export type QueryMarker = 'socio' | 'auth' | 'perm';