//socio stuff
import { log, info, done, soft_error } from 'socio/dist/logging';
import { SocioServer } from 'socio/dist/core';
import { SocioSecurity } from 'socio/dist/secure';
import {perMessageDeflate} from 'socio/dist/utils'; //for auto compressing WS messages. Carefully read documentation before using this! Possible memory leaks!
import { SaveFilesToDiskPath } from 'socio/dist/fs-utils';

//DB stuff
import { Sequelize } from 'sequelize';

//types
import type { QueryFunction, QueryFuncParams } from 'socio/dist/core';
import type { PropValue, id, PropAssigner, SocioFiles } from 'socio/dist/types';
import type { SocioSession } from 'socio/dist/core-session';

try{
    info('Starting SocioServer...');

    //constants
    const Query = await InitDB_GetQueryFunc();

    //load in the secure_private_key with dotenv or smth. Dont hardcode like this
    const socsec = new SocioSecurity({ secure_private_key: 'skk#$U#Y$7643GJHKGDHJH#$K#$HLI#H$KBKDBDFKU34534', logging: { verbose: false } });
    const socserv = new SocioServer({ port: 3000, perMessageDeflate }, { DB_query_function: Query, logging: { verbose: true, hard_crash:false }, socio_security: socsec });

    const validate_color_prop: PropAssigner = (curr_val: PropValue, new_val: PropValue): boolean => {
        if (typeof new_val != 'string' || new_val.length != 7) return false;
        if (!new_val.match(/^#[0-9a-f]{6}/mi)) return false;
        return socserv.SetPropVal('color', new_val);
    }
    socserv.RegisterProp('color', '#ffffff', validate_color_prop);
    socserv.RegisterProp('num', 0);

    socserv.RegisterLifecycleHookHandler('file_upload', (client: SocioSession, files: SocioFiles) => {
        return SaveFilesToDiskPath(['.', 'upload_files'], files).result;
    });
}
catch (e:any) {soft_error(e)}

async function InitDB_GetQueryFunc() {
    const sequelize = new Sequelize('sqlite::memory:');
    await sequelize.query('CREATE TABLE Users(userid INTEGER PRIMARY KEY AUTOINCREMENT, name varchar(50), num INTEGER NOT NULL DEFAULT 0);', { logging: false });
    await sequelize.query('INSERT INTO Users (name, num) VALUES("Jane", 42);', { logging: false });
    await sequelize.query('INSERT INTO Users (name, num) VALUES("John", 69);', { logging: false });

    const QueryWrap = async (client: SocioSession, id: id, sql: string, params: object | null = null) => {
        //@ts-expect-error
        return (await sequelize.query(sql, { logging: false, raw: true, replacements: params }))[0] as Promise<object>;
    }

    return QueryWrap as QueryFunction;
}