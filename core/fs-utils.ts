import fs from 'fs';
import b64 from 'base64-js'
import { default as os_path } from "path";

//types
import type { SocioFiles } from './types.js';

export async function SaveFilesToDiskPath(path_array: string[], files: SocioFiles){
    for (const [filename, file_data] of Object.entries(files)) {
        const file_path = os_path.join(...path_array, filename);
        const bin = b64.toByteArray(file_data.bin);
        fs.writeFileSync(file_path, bin, {flag:'w'});
    }
}