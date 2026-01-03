import type { SocioSession } from "./core-session";
import type { MessageDataObj } from "./core-server";
import type { ClientMessageDataObj, SocioClient } from './core-client';
import type { IncomingMessage } from 'http';
import type { E, LoggerOptions } from "./logging";
import type { RateLimit } from './ratelimit';

//general types
type id = string | number;
type ClientID = string;
type Bit = 0 | 1;
type Base64String = string;

//props
type PropKey = string;
type PropValue = any;
type PropAssigner = (key: PropKey, new_val: PropValue, sender_client?: SocioSession) => boolean;
type PropOpts = { client_writable?: boolean, send_as_diff?: boolean, emit_to_sender?: boolean, observationaly_temporary?: boolean };

//misc
type SocioFiles = Map<string, { meta: { size: number, lastModified?: number, type?: string }, bin: Uint8Array }> | { [filename: string]: { meta: { size: number, lastModified?: number, type?: string }, bin: Uint8Array } }; //bin is raw compressed binary (MessagePack), files can be Map or object
type QueryMarker = 'socio' | 'auth' | 'perm';
type FS_Util_Response = { result: Bit, error?: string | Error | E | object | any, files?: SocioFiles }
type LoggingOpts = { logging?: LoggerOptions };
type SessionOpts = { session_timeout_ttl_ms: number, max_payload_size?: number };

// client types
type ClientSubscribeOpts = { sql?: string, endpoint?: string, params?: object | null };

//Hook functions and types
type discovery_resp_obj = { [client_id: string]: { name?: string, ip: string, [key: string]: any } };
type ServerHookDefinitions = {
    con?: (caller_client: SocioSession, request: IncomingMessage) => void | Promise<void>,
    discon?: (caller_client: SocioSession) => void | Promise<void>,
    msg?: (caller_client: SocioSession, kind: ServerMessageKind, data: MessageDataObj) => boolean | void | Promise<boolean> | Promise<void>,
    sub?: (caller_client: SocioSession, kind: ServerMessageKind, data: MessageDataObj) => boolean | Promise<boolean>,
    unsub?: (caller_client: SocioSession, kind: ServerMessageKind, data: MessageDataObj) => boolean | Promise<boolean>,
    upd?: (sessions: Map<ClientID, SocioSession>, initiator: SocioSession, sql: string, params: object | null) => boolean | Promise<boolean>,
    auth?: (caller_client: SocioSession, params: object | null) => boolean | Promise<boolean>,
    gen_client_id?: () => ClientID | Promise<ClientID>,
    grant_perm?: (caller_client: SocioSession, data: GET_PERM_data) => boolean | Promise<boolean>,
    serv?: (caller_client: SocioSession, data: MessageDataObj) => void | Promise<void>,
    admin?: (caller_client: SocioSession, data: MessageDataObj) => boolean | Promise<boolean>,
    blob?: (caller_client: SocioSession, request: Buffer | ArrayBuffer | Buffer[]) => boolean | Promise<boolean>,
    file_upload?: (caller_client: SocioSession, files?: SocioFiles, data?: any) => Bit | boolean | Promise<Bit | boolean>,
    file_download?: (caller_client: SocioSession, data: any) => FS_Util_Response | Promise<FS_Util_Response>,
    endpoint?: (caller_client: SocioSession, endpoint: string) => string | Promise<string>,
    gen_prop_name?: (caller_client: SocioSession) => string | Promise<string>,
    identify?: (caller_client: SocioSession, name: string) => Promise<void>,
    discovery?: (caller_client: SocioSession, data: MessageDataObj) => Promise<{ [client_id: string]: { name?: string, ip: string, [key: string]: any } } | any>,
    rpc?: (target_client: ClientID | string | null, f_name: string, args: any[]) => Promise<any> | any,
};
// Use a mapped type to define individual importable types. Import this and use like ServerLifecycleHooks['con']
type ServerLifecycleHooks = {
    [K in keyof ServerHookDefinitions]?: ServerHookDefinitions[K];
};

// Define a base record of hook names and their signatures
type ClientHookDefinitions = {
    discon: (client: SocioClient, url: string, keep_alive: boolean, verbose: boolean, reconnect_tries: number, event: Event | CloseEvent) => void,
    msg: (client: SocioClient, kind: ClientMessageKind, data: ClientMessageDataObj) => boolean | void | Promise<boolean> | Promise<void>,
    cmd: (data: ClientMessageDataObj) => void,
    timeout: (client: SocioClient) => void,
    prop_drop: (client: SocioClient, prop_key: PropKey, sub_id: id) => void,
    server_error: (client: SocioClient, error_msgs: string[]) => void,
    rpc: (client: SocioClient, caller_id: ClientID | string, f_name: string, args: any[]) => Promise<any> | any,
};
// Use a mapped type to define individual importable types. Import this and use like ClientLifecycleHooks['con']
type ClientLifecycleHooks = {
    [K in keyof ClientHookDefinitions]?: ClientHookDefinitions[K];
};


// over network data types
type data_base = { id: id };
type data_result_block = { result: { success: BIT, res?: any, error?: string } };

// server receive data in Message from client
type S_SUB_data = data_base & ClientSubscribeOpts & { rate_limit: RateLimit | null };
type S_UNSUB_data = data_base & { unreg_id: id };
type S_SQL_data = data_base & { sql: string, params: object | null | Array<any>, sql_is_endpoint: boolean };
type S_AUTH_data = data_base & { params: object };
type S_GET_PERM_data = data_base & { verb: string, table: string };
type S_PROP_SUB_data = data_base & { prop: PropKey, rate_limit: RateLimit | null, data: { receive_initial_update: boolean } };
type S_PROP_UNSUB_data = data_base & { prop: PropKey };
type S_PROP_GET_data = data_base & { prop: PropKey };
type S_PROP_SET_data = data_base & { prop: PropKey, prop_val: PropValue, prop_upd_as_diff?: boolean };
type S_PROP_REG_data = data_base & { prop: PropKey | null | undefined, initial_value: any, opts?: Omit<PropOpts, "observationaly_temporary"> };
type S_RECON_GET_data = data_base & { type: 'GET' };
type S_RECON_USE_data = data_base & { type: 'USE', token: string };
type S_UP_FILES_data = data_base & { files: SocioFiles, data?: object };
type S_GET_FILES_data = data_base & { data: any };
type S_SERV_data = data_base & { data?: any };
type S_RPC_data = data_base & { target_client: ClientID | string | null, origin_client: ClientID | string, f_name: string, args: any[] };
type ServerMessageDataObj = data_base | S_SERV_data | S_GET_FILES_data | S_UP_FILES_data | S_RECON_USE_data | S_RECON_GET_data | S_PROP_REG_data | S_PROP_SET_data | S_PROP_GET_data | S_PROP_UNSUB_data | S_GET_PERM_data | S_PROP_SUB_data | S_SUB_data | S_UNSUB_data | S_SQL_data | S_AUTH_data;

// client receive data in Message from server
type C_CON_data = string;
type C_RES_data = data_base & data_result_block;
type C_UPD_data = data_base & data_result_block;
type C_AUTH_data = data_base & data_result_block;
type C_GET_PERM_data = data_base & data_result_block & { verb: string, table: string };
type C_PROP_UPD_data = data_base & { prop: string } & ({ prop_val?: PropValue, prop_val_diff?: diff_lib.rdiffResult[] });
type C_RECON_Data = data_base & data_result_block & { old_client_id: ClientID, auth: boolean, name?: string };
type C_RECV_FILES_Data = data_base & data_result_block & { files: SocioFiles };
// type C_PROP_REG_data = data_base & data_result_block & { prop?: string, initial_value: any, opts: Omit<PropOpts, "observationaly_temporary"> };
type ClientMessageDataObj = data_base | CON_data | RES_data | AUTH_data | PROP_UPD_data | RECON_Data | RECV_FILES_Data;