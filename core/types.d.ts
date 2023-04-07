import type { SocioSession } from "./core-session.ts";
import type { MessageDataObj } from "./core.ts";
import type { ClientMessageDataObj } from './core-client.js';
import type { IncomingMessage } from 'http';

//general types
export type id = string | number;
export type ClientID = string;
export type Bit = 0 | 1;
export type Base64String = string;

//props
export type PropKey = string;
export type PropValue = object | string | number | null;
export type PropAssigner = (key: PropKey, new_val:PropValue) => boolean;

//misc
export type SocioFiles = Map<string, { meta: { size: number, lastModified?: number, type?: string }, bin: Base64String }>; //bin is a base64 string of the bytes of the raw file
export type QueryMarker = 'socio' | 'auth' | 'perm';
export type FS_Util_Response = { result: Bit, error?: string | Error | E | object | any, files?: SocioFiles }

//msg kinds
export type CoreMessageKind = 'SUB' | 'UNSUB' | 'SQL' | 'PING' | 'AUTH' | 'GET_PERM' | 'PROP_SUB' | 'PROP_UNSUB' | 'PROP_GET' | 'PROP_SET' | 'SERV' | 'ADMIN' | 'RECON' | 'UP_FILES' | 'GET_FILES';
export type ClientMessageKind = 'CON' | 'UPD' | 'PONG' | 'AUTH' | 'GET_PERM' | 'RES' | 'ERR' | 'PROP_UPD' | 'CMD' | 'RECON' | 'RECV_FILES';

//server hook functions
export type GenCLientID_Hook = () => ClientID;
export type Con_Hook = (client: SocioSession, request: IncomingMessage) => void;
export type Discon_Hook = (client: SocioSession) => void;
export type Blob_Hook = (client: SocioSession, request: Buffer | ArrayBuffer | Buffer[]) => boolean;
export type Msg_Hook = (client: SocioSession, kind: CoreMessageKind, data: MessageDataObj) => boolean;
export type Sub_Hook = (client: SocioSession, kind: CoreMessageKind, data: MessageDataObj) => boolean;
export type Unsub_Hook = (client: SocioSession, kind: CoreMessageKind, data: MessageDataObj) => boolean;
export type Auth_Hook = (client: SocioSession, params: object | null) => boolean;
export type GrantPerm_Hook = (client: SocioSession, data:MessageDataObj) => boolean;
export type Serv_Hook = (client: SocioSession, data: MessageDataObj) => void;
export type Admin_Hook = (client: SocioSession, data: MessageDataObj) => boolean;
export type FileUpload_Hook = (client: SocioSession, files?: SocioFiles, data:any) => Bit | boolean;
export type FileDownload_Hook = (client: SocioSession, data: any) => FS_Util_Response;
export type Upd_Hook = (sessions: Map<ClientID, SocioSession>, tables: string[]) => boolean;
// export type _Hook = (client: SocioSession) => boolean;

//client hook functions
export type Discon_ClientHook = (name:string, client_id:ClientID, url:string, keep_alive:boolean, verbose:boolean, reconnect_tries:number) => void;
export type Msg_ClientHook = (name: string, client_id: ClientID, kind: ClientMessageKind, data: ClientMessageDataObj) => boolean;
export type Cmd_ClientHook = (data:ClientMessageDataObj) => void;
// export type _ClientHook = (name: string, client_id: ClientID,) => boolean;