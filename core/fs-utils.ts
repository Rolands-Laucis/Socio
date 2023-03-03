import fs from 'fs';
import b64 from 'base64-js'
import { default as os_path } from "path";

//types
import type { SocioFiles, FS_Util_Response } from './types.js';

//FS interaction
export function SaveFilesToDiskPath(string_array_path: string[], files: SocioFiles): FS_Util_Response {
    try {
        if (!string_array_path || !files) return { result: 0, error: 'function arguments are falsy' };
        for (const [filename, file_data] of files.entries()) {
            const file_path = os_path.join(...string_array_path, filename);
            const bin = b64.toByteArray(file_data.bin);
            fs.writeFileSync(file_path, bin, { flag: 'w' });
        }
        return { result: 1 };
    } catch (e) { return { result: 0, error: e }; }
}
export function ReadFilesFromDisk(file_paths: string[]): FS_Util_Response {
    try {
        if (!file_paths?.length) return { result: 0, error: 'no file_paths provided' };
        const files: SocioFiles = new Map();
        for (const path of file_paths) {
            const filename = os_path.basename(path);
            const file = fs.readFileSync(path);
            const file_base64_string = b64.fromByteArray(file);
            files.set(filename, { meta: { size: file.byteLength }, bin: file_base64_string });
        }
        return { result: 1, files };
    } catch (e: any) { return { result: 0, error: e }; }
}

export function MapPathsToFolder(folder_path: string[], relative_file_paths: string[]) {
    const fp = os_path.join(...folder_path);
    return relative_file_paths.map(p => os_path.join(fp, p));
}

//Persisting Maps -------------
// export function SaveQueryMap(string_array_path: string[] = ['.', 'SocioQueryMap.json'], map: Map<string, string>) {
//     const file_path = os_path.join(...string_array_path);
//     const json = JSON.stringify(map, MapReplacer);
//     fs.writeFileSync(file_path, json, { flag: 'w' });
// }
// export function ReadQueryMap(string_array_path: string[] = ['.', 'SocioQueryMap.json']): QueryMapType {
//     const file_path = os_path.join(process.cwd(), ...string_array_path);
//     const json_obj = JSON.parse(fs.readFileSync(file_path, { flag: 'r', encoding: 'utf8' }), MapReviver);
//     return new Map(Object.entries(json_obj));
// }