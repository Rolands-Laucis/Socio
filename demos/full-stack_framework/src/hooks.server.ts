//socio stuff
import { log, info, done, soft_error } from 'socio/dist/logging';
import { SocioServer } from 'socio/dist/core-server';
import { SocioSecurity } from 'socio/dist/secure';
import { perMessageDeflate } from 'socio/dist/utils'; //for auto compressing WS messages. Carefully read documentation before using this! Possible memory leaks!
import { SaveFilesToDiskPath } from 'socio/dist/fs-utils';

//DB stuff
import { Sequelize } from 'sequelize';

//types
import type { PropValue, id, PropAssigner, SocioFiles } from 'socio/dist/types';
import type { SocioSession } from 'socio/dist/core-session';

try {
    info('Starting SocioServer...');

    //constants
    const db_interface = await SetUpDBInterface();

    //load in the secure_private_key with dotenv or smth. Dont hardcode like this
    const socsec = new SocioSecurity({ secure_private_key: 'skk#$U#Y$7643GJHKGDHJH#$K#$HLI#H$KBKDBDFKU34534', logging: { verbose: false } });
    const socserv = new SocioServer({ port: 3000, perMessageDeflate }, { db: db_interface, logging: { verbose: true, hard_crash: false }, socio_security: socsec });

    socserv.RegisterProp('color', '#ffffff', {
        // assigner is optional and has a default to just accept whatever new value comes in.
        assigner: (curr_val: PropValue, new_val: PropValue) => {
            if (typeof new_val !== 'string' || new_val.length <= 6) return false;
            if (!new_val.match(/^#[0-9a-f]{6}/mi)) return false;
            return socserv.SetPropVal('color', new_val);
        }
    });
    socserv.RegisterProp('num', 0);

    socserv.RegisterLifecycleHookHandler('file_upload', async (client: SocioSession, files: SocioFiles) => {
        return (await SaveFilesToDiskPath(['.', 'upload_files'], files)).result;
    });
}
catch (e: any) { soft_error(e) }

async function SetUpDBInterface() {
    const sequelize = new Sequelize('sqlite::memory:');
    await sequelize.query('CREATE TABLE Users(userid INTEGER PRIMARY KEY AUTOINCREMENT, name varchar(50), num INTEGER NOT NULL DEFAULT 0);', { logging: false });
    await sequelize.query('INSERT INTO Users (name, num) VALUES("Jane", 42);', { logging: false });
    await sequelize.query('INSERT INTO Users (name, num) VALUES("John", 69);', { logging: false });

    return {
        Query: async (client: SocioSession, id: id, sql: string, params: any) => {
            return (await sequelize.query(sql, { logging: false, raw: true, replacements: params }))?.at(0) as Promise<object>;
        }
    };
}