import type { SocioSession } from "./core-session.js";
import type { MessageDataObj } from "./core-server.ts";
import type { ClientMessageDataObj, SocioClient } from './core-client.js';
import type { IncomingMessage } from 'http';
import type { E, LoggerOptions } from "./logging.js";
import type { RateLimit } from './ratelimit.js';
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
// export type BasicClientRes = { id: id, result: Bit };
// export type BasicClientResPromise = Promise<{ id: id, result: Bit, error?:string, msg?:string }>;
// export type BasicClientQuery = { id: id, result: Bit };
// export type BasicClientResPromise = Promise<{ id: id, result: Bit, error?: string, msg?: string }>;

// client types
export type ClientSubscribeOpts = { sql?: string, endpoint?: string, params?: object | null };

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
export type GrantPerm_Hook = (client: SocioSession, data: GET_PERM_data) => boolean | Promise<boolean>;
export type Serv_Hook = (client: SocioSession, data: MessageDataObj) => void | Promise<void>;
export type Admin_Hook = (client: SocioSession, data: MessageDataObj) => boolean | Promise<boolean>;
export type FileUpload_Hook = (client: SocioSession, files?: SocioFiles, data?: any) => Bit | boolean | Promise<Bit | boolean>;
export type FileDownload_Hook = (client: SocioSession, data: any) => FS_Util_Response | Promise<FS_Util_Response>;
export type Upd_Hook = (sessions: Map<ClientID, SocioSession>, initiator: SocioSession, sql: string, params:object|null) => boolean | Promise<boolean>;
export type Endpoint_Hook = (client: SocioSession, endpoint: string) => string | Promise<string>;
export type Gen_Prop_Name_Hook = () => string | Promise<string>;
// export type _Hook = (client: SocioSession) => boolean;

//client hook functions
export type ClientLifecycleHooks = { discon?: Discon_ClientHook, msg?: Msg_ClientHook, cmd?: Cmd_ClientHook, timeout?: Timeout_ClientHook, prop_drop?: PropDrop_ClientHook, server_error?: Server_Error_ClientHook };
export type Discon_ClientHook = (client:SocioClient, url:string, keep_alive:boolean, verbose:boolean, reconnect_tries:number, event: Event | CloseEvent) => void;
export type Msg_ClientHook = (client:SocioClient, kind: ClientMessageKind, data: ClientMessageDataObj) => boolean | void | Promise<boolean> | Promise<void>;
export type Cmd_ClientHook = (data:ClientMessageDataObj) => void;
export type Timeout_ClientHook = (client:SocioClient) => void;
export type PropDrop_ClientHook = (client:SocioClient, prop_key:PropKey, sub_id:id) => void;
export type Server_Error_ClientHook = (client:SocioClient, error_msgs:string[]) => void;
// export type _ClientHook = (client:SocioClient,) => boolean;

// over network data types
export type data_base = { id: id };
export type data_result_block = { result: { success: BIT, res?: any, error: string } };

// server receive data in Message from client
export type S_SUB_data = data_base & ClientSubscribeOpts & { rate_limit: RateLimit | null };
export type S_UNSUB_data = data_base & { unreg_id: id };
export type S_SQL_data = data_base & { sql: string, params: object | null | Array<any>, sql_is_endpoint: boolean };
export type S_AUTH_data = data_base & { params: object };
export type S_GET_PERM_data = data_base & { verb: string, table: string };
export type S_PROP_SUB_data = data_base & { prop: PropKey, rate_limit: RateLimit | null, data: { receive_initial_update: boolean } };
export type S_PROP_UNSUB_data = data_base & { prop: PropKey };
export type S_PROP_GET_data = data_base & { prop: PropKey };
export type S_PROP_SET_data = data_base & { prop: PropKey, prop_val: PropValue, prop_upd_as_diff?: boolean };
export type S_PROP_REG_data = data_base & { prop: PropKey | null | undefined, initial_value: any, opts?: Omit<PropOpts, "observationaly_temporary"> };
export type S_RECON_GET_data = data_base & { type: 'GET' };
export type S_RECON_USE_data = data_base & { type: 'USE', token: string };
export type S_UP_FILES_data = data_base & { files: SocioFiles, data?: object };
export type S_GET_FILES_data = data_base & { data: any };
export type S_SERV_data = data_base & { data?:any };
export type ServerMessageDataObj = data_base | S_SERV_data | S_GET_FILES_data | S_UP_FILES_data | S_RECON_USE_data | S_RECON_GET_data | S_PROP_REG_data | S_PROP_SET_data | S_PROP_GET_data | S_PROP_UNSUB_data | S_GET_PERM_data | S_PROP_SUB_data | S_SUB_data | S_UNSUB_data | S_SQL_data | S_AUTH_data;

// client receive data in Message from server
export type C_CON_data = string;
export type C_RES_data = data_base & data_result_block;
export type C_UPD_data = data_base & data_result_block;
export type C_AUTH_data = data_base & data_result_block;
export type C_GET_PERM_data = data_base & data_result_block & { verb: string, table: string };
export type C_PROP_UPD_data = data_base & { prop: string } & ({ prop_val: PropValue } | { prop_val_diff: diff_lib.rdiffResult[] });
export type C_RECON_Data = data_base & data_result_block & { old_client_id: ClientID, auth: boolean };
export type C_RECV_FILES_Data = data_base & data_result_block & { files: SocioFiles };
// export type C_PROP_REG_data = data_base & data_result_block & { prop?: string, initial_value: any, opts: Omit<PropOpts, "observationaly_temporary"> };

export type ClientMessageDataObj = data_base | CON_data | RES_data | AUTH_data | PROP_UPD_data | RECON_Data | RECV_FILES_Data;