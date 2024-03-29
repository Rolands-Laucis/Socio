import type { SocioSession } from "./core-session.js";
import type { MessageDataObj } from "./core-server.ts";
import type { ClientMessageDataObj } from './core-client.js';
import type { IncomingMessage } from 'http';
import type { E, LoggerOptions } from "./logging.js";
import exp from "constants";

//general types
export type id = string | number;
export type ClientID = string;
export type Bit = 0 | 1;
export type Base64String = string;

//props
export type PropKey = string;
export type PropValue = any;
export type PropAssigner = (key: PropKey, new_val:PropValue, sender_client?:SocioSession) => boolean;
export type PropOpts = { client_writable?: boolean, send_as_diff?: boolean, emit_to_sender?: boolean, observationaly_temporary?:boolean };

//misc
export type SocioFiles = Map<string, { meta: { size: number, lastModified?: number, type?: string }, bin: Base64String }>; //bin is a base64 string of the bytes of the raw file
export type QueryMarker = 'socio' | 'auth' | 'perm';
export type FS_Util_Response = { result: Bit, error?: string | Error | E | object | any, files?: SocioFiles }
export type LoggingOpts = { logging?: LoggerOptions };
export type SessionOpts = { session_timeout_ttl_ms: number, max_payload_size?: number };
export type BasicClientRes = { id: id, result: Bit };
export type BasicClientResPromise = Promise<{ id: id, result: Bit, error?:string, msg?:string }>;

//server hook functions
export type ServerLifecycleHooks = { con?: Con_Hook, discon?: Discon_Hook, msg?: Msg_Hook, sub?: Sub_Hook, unsub?: Unsub_Hook, upd?: Upd_Hook, auth?: Auth_Hook, gen_client_id?: GenCLientID_Hook, grant_perm?: GrantPerm_Hook, serv?: Serv_Hook, admin?: Admin_Hook, blob?: Blob_Hook, file_upload?: FileUpload_Hook, file_download?: FileDownload_Hook, endpoint?: Endpoint_Hook, gen_prop_name?: Gen_Prop_Name_Hook };
export type GenCLientID_Hook = () => ClientID | Promise<ClientID>;
export type Con_Hook = (client: SocioSession, request: IncomingMessage) => void | Promise<void>;
export type Discon_Hook = (client: SocioSession) => void | Promise<void>;
export type Blob_Hook = (client: SocioSession, request: Buffer | ArrayBuffer | Buffer[]) => boolean | Promise<boolean>;
export type Msg_Hook = (client: SocioSession, kind: CoreMessageKind, data: MessageDataObj) => boolean | void | Promise<boolean> | Promise<void>;
export type Sub_Hook = (client: SocioSession, kind: CoreMessageKind, data: MessageDataObj) => boolean | Promise<boolean>;
export type Unsub_Hook = (client: SocioSession, kind: CoreMessageKind, data: MessageDataObj) => boolean | Promise<boolean>;
export type Auth_Hook = (client: SocioSession, params: object | null) => boolean | Promise<boolean>;
export type GrantPerm_Hook = (client: SocioSession, data: MessageDataObj) => boolean | Promise<boolean>;
export type Serv_Hook = (client: SocioSession, data: MessageDataObj) => void | Promise<void>;
export type Admin_Hook = (client: SocioSession, data: MessageDataObj) => boolean | Promise<boolean>;
export type FileUpload_Hook = (client: SocioSession, files?: SocioFiles, data?: any) => Bit | boolean | Promise<Bit | boolean>;
export type FileDownload_Hook = (client: SocioSession, data: any) => FS_Util_Response | Promise<FS_Util_Response>;
export type Upd_Hook = (sessions: Map<ClientID, SocioSession>, initiator: SocioSession, sql: string, params:object) => boolean | Promise<boolean>;
export type Endpoint_Hook = (client: SocioSession, endpoint: string) => string | Promise<string>;
export type Gen_Prop_Name_Hook = () => string | Promise<string>;
// export type _Hook = (client: SocioSession) => boolean;

//client hook functions
export type ClientLifecycleHooks = { discon?: Discon_ClientHook, msg?: Msg_ClientHook, cmd?: Cmd_ClientHook, timeout?: Timeout_ClientHook, prop_drop?: PropDrop_ClientHook };
export type Discon_ClientHook = (name:string, client_id:ClientID, url:string, keep_alive:boolean, verbose:boolean, reconnect_tries:number, event: Event | CloseEvent) => void;
export type Msg_ClientHook = (name: string, client_id: ClientID, kind: ClientMessageKind, data: ClientMessageDataObj) => boolean | void | Promise<boolean> | Promise<void>;
export type Cmd_ClientHook = (data:ClientMessageDataObj) => void;
export type Timeout_ClientHook = (name: string, client_id: ClientID) => void;
export type PropDrop_ClientHook = (name: string, client_id: ClientID, prop_key:PropKey, sub_id:id) => void;
// export type _ClientHook = (name: string, client_id: ClientID,) => boolean;