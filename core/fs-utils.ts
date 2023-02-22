import fs from 'fs';
import b64 from 'base64-js'
import { default as os_path } from "path";

//types
import type { SocioFiles } from './types.js';

export function SaveFilesToDiskPath(path_array: string[], files: SocioFiles){
    if(!path_array || !files) return;
    for (const [filename, file_data] of Object.entries(files)) {
        const file_path = os_path.join(...path_array, filename);
        const bin = b64.toByteArray(file_data.bin);
        fs.writeFileSync(file_path, bin, {flag:'w'});
    }
}

export function ReadFilesFromDisk(file_paths: string[]) {
    if (!file_paths) return;
    const files: SocioFiles = {};
    for(const path in file_paths){
        const filename = os_path.basename(path);
        const file = fs.readFileSync(path);
        const file_base64_string = b64.fromByteArray(file);
        files[filename] = { meta: { size: file.byteLength }, bin: file_base64_string }
    }
}