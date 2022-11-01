// import { SessionManager } from '../../core/core.js' //i use this locally
import {SessionManager} from 'socio/core.js' //for using the lib as a download from npm

import { Sequelize } from 'sequelize';
import { log, info, setPrefix, setShowTime } from '@rolands/log'; setPrefix('SERVER'); setShowTime(false);

//constants
const ws_port = 3000 //can be set up that the websockets run on the same port as the http server

//init local RAM DB with 1 table - "users" and 2 rows.
const sequelize = new Sequelize('sqlite::memory:');
await sequelize.query('CREATE TABLE Users(name varchar(50), num INTEGER NOT NULL DEFAULT 0);')
await sequelize.query('INSERT INTO Users VALUES("Jane", 42);')
await sequelize.query('INSERT INTO Users VALUES("John", 69);')

//set up the WebSocket manager and give it the DB querying function that comes from whatever your DB interface lib provides.
//it needs the raw sql string, which can contain formatting parameters - insert dynamic data into the string. 
//Either you in a wrapper function or your DB interface lib should do the sql validation and sanitization, as this lib does not!
const QueryWrap = async (sql = '', params = {}) => (await sequelize.query(sql, { logging: false, raw: true, replacements: params }))[0]
const manager = new SessionManager({ port: ws_port }, QueryWrap, { verbose: true })
info(`Created SessionManager on port`, ws_port)

//init
// const sec = Secure({})