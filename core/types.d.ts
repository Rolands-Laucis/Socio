//general types
export type id = string | number;
export type Bit = 0 | 1;

//props
export type PropKey = string;
export type PropValue = object | string | number | null;
export type PropAssigner = (key: PropKey, new_val:PropValue) => boolean;

//misc
export type SocioFiles = {[filename: string]: {meta: {lastModified: number, size: number, type: string}, bin: string } }; //bin is a base64 string of the bytes of the raw file
export type QueryMarker = 'socio' | 'auth' | 'perm';

//msg kinds
export type CoreMessageKind = 'SUB' | 'UNSUB' | 'SQL' | 'PING' | 'AUTH' | 'GET_PERM' | 'PROP_SUB' | 'PROP_UNSUB' | 'PROP_GET' | 'PROP_SET' | 'SERV' | 'ADMIN' | 'RECON' | 'UP_FILES' | 'GET_FILES';
export type ClientMessageKind = 'CON' | 'UPD' | 'PONG' | 'AUTH' | 'GET_PERM' | 'RES' | 'ERR' | 'PROP_UPD' | 'CMD' | 'RECON' | 'RECV_FILES';