import { SocioServer } from 'socio/dist/core.js' //for using the lib as a download from npm
import { log, info, done } from 'socio/dist/logging.js';

import express from 'express'
import { Sequelize } from 'sequelize';

info('Starting SocioServer...');

//constants
const server_port = 5000, ws_port = 3000 //can be set up that the websockets run on the same port as the http server

//init local RAM DB with 1 table - "users" and 2 rows.
const sequelize = new Sequelize('sqlite::memory:');
await sequelize.query('CREATE TABLE Users(name varchar(50), num INTEGER NOT NULL DEFAULT 0);', { logging: false })
await sequelize.query('INSERT INTO Users VALUES("Jane", 42);', { logging: false })
await sequelize.query('INSERT INTO Users VALUES("John", 69);', { logging: false })

//set up the WebSocket SocioServer and give it the DB querying function that comes from whatever your DB interface lib provides.
//it needs the raw sql string, which can contain formatting parameters - insert dynamic data into the string. 
//Either you in a wrapper function or your DB interface lib should do the sql validation and sanitization, as this lib does not!
async function QueryWrap(client, id, sql = '', params = null) {
    return (await sequelize.query(sql, { logging: false, raw: true, replacements: params }))[0]
}

const socserv = new SocioServer({ port: ws_port }, { DB_query_function: QueryWrap, verbose:true} );

//express js serve static files like html page and the client.js which does the magic
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express()
app.use("/", express.static(__dirname));
app.use("/socio", express.static(join(__dirname, "node_modules/socio/dist/")));
app.use("/base64-js", express.static(join(__dirname, "node_modules/base64-js/index.js")));

app.listen(server_port, () => {
    done(`Express webserver listening on port`, server_port, `http://localhost:${server_port}/`)
})