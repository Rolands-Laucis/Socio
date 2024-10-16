import fs from 'fs';
import { default as os_path } from "path";
import pako from 'pako'; //https://github.com/nodeca/pako

//types
import type { SocioFiles, FS_Util_Response } from './types';

//FS interaction
export function SaveFilesToDiskPath(string_array_path: string[], files: SocioFiles): Promise<FS_Util_Response> {
    return new Promise((res, rej) => {
        try {
            if (!string_array_path || !files) return rej({ result: 0, error: 'function arguments are falsy' });
            for (const [filename, file_data] of files.entries()) {
                const file_path = os_path.join(...string_array_path, filename);
                //@ts-expect-error
                const bin = pako.inflate(Buffer.from(file_data.bin, 'base64')); //file_data.bin should be a base64 encoded string, so make a buffer from it and decompress with pako
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
                //@ts-expect-error
                files.set(filename, { meta: { size: file.byteLength }, bin: Buffer.from(pako.deflate(file)).toString('base64')}); //compress the file binary and conver to base64 string
            }
            res({ result: 1, files });
        } catch (e: any) { rej({ result: 0, error: e }); }
    })
}

export function MapPathsToFolder(folder_path: string[], relative_file_paths: string[]) {
    const fp = os_path.join(...folder_path);
    return relative_file_paths.map(p => os_path.join(fp, p));
}