import fs from 'fs';
import * as b64 from 'base64-js';
import { default as os_path } from "path";

//types
import type { SocioFiles, FS_Util_Response } from './types.js';

//FS interaction
export function SaveFilesToDiskPath(string_array_path: string[], files: SocioFiles): Promise<FS_Util_Response> {
    return new Promise((res, rej) => {
        try {
            if (!string_array_path || !files) return rej({ result: 0, error: 'function arguments are falsy' });
            for (const [filename, file_data] of files.entries()) {
                const file_path = os_path.join(...string_array_path, filename);
                const bin = b64.toByteArray(file_data.bin);
                fs.writeFileSync(file_path, bin, { flag: 'w' });
            }
            res({ result: 1 });
        } catch (e) { rej({ result: 0, error: e }); }
    })
}
export function ReadFilesFromDisk(file_paths: string[]): Promise<FS_Util_Response> {
    return new Promise((res, rej) => {
        try {
            if (!file_paths?.length) return rej({ result: 0, error: 'no file_paths provided' });
            const files: SocioFiles = new Map();
            for (const path of file_paths) {
                const filename = os_path.basename(path);
                const file = fs.readFileSync(path);
                const file_base64_string = b64.fromByteArray(file);
                files.set(filename, { meta: { size: file.byteLength }, bin: file_base64_string });
            }
            res({ result: 1, files });
        } catch (e: any) { rej({ result: 0, error: e }); }
    })
}

export function MapPathsToFolder(folder_path: string[], relative_file_paths: string[]) {
    const fp = os_path.join(...folder_path);
    return relative_file_paths.map(p => os_path.join(fp, p));
}