console.log('running hooks.server.ts ...')

import { log, info, done, soft_error } from 'socio/dist/logging';
import { SocioServer } from 'socio/dist/core';
import { SocioSecurity } from 'socio/dist/secure';
import { Sequelize } from 'sequelize';

//types
import type { QueryFunction, QueryFuncParams } from 'socio/dist/core';
import type { PropValue, id } from 'socio/dist/types';
import type { SocioSession } from 'socio/dist/core-session';

try{
    info('Starting SocioServer...');

    //constants
    const ws_port = 3000; //can be set up that the websockets run on the same port as the http server

    const sequelize = new Sequelize('sqlite::memory:');
    await sequelize.query('CREATE TABLE Users(userid INTEGER PRIMARY KEY AUTOINCREMENT, name varchar(50), num INTEGER NOT NULL DEFAULT 0);', { logging: false });
    await sequelize.query('INSERT INTO Users (name, num) VALUES("Jane", 42);', { logging: false });
    await sequelize.query('INSERT INTO Users (name, num) VALUES("John", 69);', { logging: false });

    async function QueryWrap(client: SocioSession, id: id, sql: string, params: object | null = null) {
        //@ts-expect-error
        return (await sequelize.query(sql, { logging: false, raw: true, replacements: params }))[0] as Promise<object>;
    }

    const socsec = new SocioSecurity({ secure_private_key: 'skk#$U#Y$7643GJHKGDHJH#$K#$HLI#H$KBKDBDFKU34534', verbose: true });
    const socserv = new SocioServer({ port: ws_port }, { DB_query_function: QueryWrap as QueryFunction, verbose: true, socio_security: socsec });

    socserv.RegisterProp('color', '#ffffff', (curr_val: PropValue, new_val: PropValue): boolean => {
        if (typeof new_val != 'string' || new_val.length != 7) return false;
        if (!new_val.match(/^#[0-9a-f]{6}/mi)) return false;
        return socserv.SetPropVal('color', new_val);
    });
} catch (e:any) {
    soft_error(e);
}


/** @type {import('@sveltejs/kit').Handle} */
//@ts-ignore
export async function handle({ event, resolve }) {
    return await resolve(event);
}