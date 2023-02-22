import fs from 'fs';
import b64 from 'base64-js'
import { default as os_path } from "path";

//types
import type { SocioFiles, FS_Util_Response } from './types.js';

export function SaveFilesToDiskPath(path_array: string[], files: SocioFiles): FS_Util_Response{
    try{
        if (!path_array || !files) return {result: 0, error:'function arguments are falsy'};
        for (const [filename, file_data] of Object.entries(files)) {
            const file_path = os_path.join(...path_array, filename);
            const bin = b64.toByteArray(file_data.bin);
            fs.writeFileSync(file_path, bin, { flag: 'w' });
        }
        return { result: 1 };
    } catch (e) { return { result: 0, error: e }; }
}

export function ReadFilesFromDisk(file_paths: string[]): FS_Util_Response {
    try{
        if (!file_paths?.length) return { result: 0, error:'no file_paths provided' };
        const files: SocioFiles = {};
        for (const path of file_paths) {
            const filename = os_path.basename(path);
            const file = fs.readFileSync(path);
            const file_base64_string = b64.fromByteArray(file);
            files[filename] = { meta: { size: file.byteLength }, bin: file_base64_string }
        }
        return { result: 1, files };
    } catch (e:any) { return { result: 0, error:e }; }
}