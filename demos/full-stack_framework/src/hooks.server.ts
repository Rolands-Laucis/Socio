console.log('running hooks.server.ts ...')
import { SocioServer } from 'socio/core';
import { SocioSecurity } from 'socio/secure';
import type { QueryFunction, QueryFuncParams } from 'socio/core';
import type { PropValue } from 'socio/types';
// import { SocioStringParse } from 'socio/utils'

import { Sequelize } from 'sequelize';
import { log, info, done, soft_error } from 'socio/logging';

// log(SocioStringParse('SELECT * FROM users;--socio-32946486'))
// process.exit(0)

try{
    info('Starting SocioServer...');

    //constants
    const ws_port = 3000; //can be set up that the websockets run on the same port as the http server

    const sequelize = new Sequelize('sqlite::memory:');
    await sequelize.query('CREATE TABLE Users(userid INTEGER PRIMARY KEY AUTOINCREMENT, name varchar(50), num INTEGER NOT NULL DEFAULT 0);', { logging: false });
    await sequelize.query('INSERT INTO Users (name, num) VALUES("Jane", 42);', { logging: false });
    await sequelize.query('INSERT INTO Users (name, num) VALUES("John", 69);', { logging: false });

    //@ts-ignore
    async function QueryWrap({ id = undefined, sql = '', params = undefined } = { sql: '' }) {
        return (await sequelize.query(sql, { logging: false, raw: true, replacements: params }))[0];
    }

    const socsec = new SocioSecurity({ secure_private_key: 'skk#$U#Y$7643GJHKGDHJH#$K#$HLI#H$KBKDBDFKU34534', verbose: true });
    const socserv = new SocioServer({ port: ws_port }, QueryWrap as QueryFunction, { verbose: true, socio_security: socsec });
    done(`Created SocioServer on port`, ws_port);

    socserv.RegisterProp('color', '#ffffff', (curr_val: PropValue, new_val: PropValue): boolean => {
        if (typeof new_val != 'string' || new_val.length != 7) return false;
        if (!new_val.match(/^#[0-9a-f]{6}/mi)) return false;
        //...more checks.

        //success, so assign
        return socserv.SetPropVal('color', new_val);
    })
} catch (e:any) {
    soft_error(e);
}


/** @type {import('@sveltejs/kit').Handle} */
//@ts-ignore
export async function handle({ event, resolve }) {
    return await resolve(event);
}