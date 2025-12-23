import fs from 'fs';
import { default as os_path } from "path";
import pako from 'pako'; //https://github.com/nodeca/pako

//types
import type { SocioFiles, FS_Util_Response } from './types.d.ts';

//FS interaction
export function SaveFilesToDiskPath(string_array_path: string[], files: SocioFiles): Promise<FS_Util_Response> {
    return new Promise((res, rej) => {
        try {
            if (!string_array_path || !files) return rej({ result: 0, error: 'SaveFilesToDiskPath: Function arguments are falsy. [#SaveFilesToDiskPath-falsy-args]' });
            // Handle both Map (original) and plain object (MessagePack converts Maps to objects)
            const entries = files instanceof Map ? files.entries() : Object.entries(files);
            for (const [filename, file_data] of entries) {
                const file_path = os_path.join(...string_array_path, filename);
                console.log('DEBUG file_data.bin:', typeof file_data.bin, file_data.bin instanceof Uint8Array, file_data.bin instanceof Buffer, Array.isArray(file_data.bin));
                const bin = pako.inflate(file_data.bin);  // Decompress binary data
                    ?pako.inflate(Buffer.from(file_data.bin, 'base64').buffer as ArrayBuffer)  // Legacy Base64 format
                    : pako.inflate(file_data.bin);  // MessagePack sends raw compressed binary (Uint8Array)
                fs.writeFileSync(file_path, bin, { flag: 'w' });
            }
            res({ result: 1 });
        } catch (e) { rej({ result: 0, error: e }); }
    })
}
export function ReadFilesFromDisk(file_paths: string[]): Promise<FS_Util_Response> {
    return new Promise((res, rej) => {
        try {
            if (typeof file_paths !== 'object') return rej({ result: 0, error: 'ReadFilesFromDisk: file_paths argument must be an array of string paths. [#file-paths-must-be-array]' });
            if (!file_paths?.length) return rej({ result: 0, error: 'ReadFilesFromDisk: No file_paths provided. [#no-file-paths]' });
            if (file_paths.some(fp => typeof fp !== 'string')) return rej({ result: 0, error: 'ReadFilesFromDisk: file_paths argument must be an array of string paths. [#file-paths-must-be-array-of-string]' });
            const files: SocioFiles = new Map();
            for (const path of file_paths) {
                const filename = os_path.basename(path);
                const file = fs.readFileSync(path);
                files.set(filename, { meta: { size: file.byteLength }, bin: pako.deflate(file.buffer as ArrayBuffer) }); // MessagePack handles binary natively
            }
            res({ result: 1, files });
        } catch (e: any) { rej({ result: 0, error: e?.message || String(e) }); }
    })
}

export function MapPathsToFolder(folder_path: string[], relative_file_paths: string[]) {
    const fp = os_path.join(...folder_path);
    return relative_file_paths.map(p => os_path.join(fp, p));
}