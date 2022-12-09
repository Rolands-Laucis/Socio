import { SocioServer } from '../../core/core.js' //i use this locally
import { SocioSecurity } from '../../core/secure.js' //i use this locally
// import {SocioServer} from 'socio/core.js' //for using the lib as a download from npm
// import { SocioSecurity } from 'socio/secure.js' //for using the lib as a download from npm

import { Sequelize } from 'sequelize';
import { log, done, setPrefix, setShowTime } from '@rolands/log'; setPrefix('SERVER'); setShowTime(false);

//constants
const ws_port = 3000 //can be set up that the websockets run on the same port as the http server

//init local RAM DB with 1 table - "users" and 2 rows.
const sequelize = new Sequelize('sqlite::memory:');
await sequelize.query('CREATE TABLE Users(name varchar(50), num INTEGER NOT NULL DEFAULT 0);')
await sequelize.query('INSERT INTO Users VALUES("Jane", 42);')
await sequelize.query('INSERT INTO Users VALUES("John", 69);')

//set up the WebSocket SocioServer and give it the DB querying function that comes from whatever your DB interface lib provides.
//it needs the raw sql string, which can contain formatting parameters - insert dynamic data into the string. 
//Either you in a wrapper function or your DB interface lib should do the sql validation and sanitization, as this lib does not!
async function QueryWrap({ id = 0, sql = '', params = {} } = {}){
    return (await sequelize.query(sql, { logging: false, raw: true, replacements: params }))[0]
}

//note that these key and iv are here for demonstration purposes and you should always generate your own. You may also supply any cipher algorithm supported by node's crypto module.
//It is always advised to load these keys from a .env file!
const socsec = new SocioSecurity({ secure_private_key: 'skk#$U#Y$7643GJHKGDHJH#$K#$HLI#H$KBKDBDFKU34534', cipher_iv: 'dsjkfh45h4lu45ilULIY$%IUfdjg', verbose:true })
const socserv = new SocioServer({ port: ws_port }, QueryWrap, { verbose: true, secure: socsec })

done(`Created SocioServer on port`, ws_port)