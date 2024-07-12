# QUICK START FOR LAZIES
```sh
npm i socio
```

```ts
//server code - whatever way you have of running this script once. You need to host a server.
import { SocioServer } from 'socio/dist/core-server.js'; //or .ts

const socserv = new SocioServer({ port: 3000 }, {
    db: {
      Query: async (client:SocioSession, id:id, sql:string, params: object | null | Array<any> = {}) => {return ...} //do ur SQL query however you want
    }, 
    logging: {verbose:true}
  }
);
```

```ts
//browser code
import { SocioClient } from 'socio/dist/core-client.js'; //or .ts

const sc = new SocioClient(`ws://localhost:3000`, { logging: {verbose:true} }); //make as many as u want
await sc.ready();

console.log(await sc.Query(`SELECT 42+69 AS RESULT;`));//one-time query

//subscribe to the changes of this query. Runs the callback with the new received data (including first time fetch)
sc.Subscribe({ sql: `SELECT COUNT(*) AS RESULT FROM users;`}, (res) => {...});
```

Keep reading for a billion more options and mechanisms Socio provides!

# Overview

* [WS](https://www.npmjs.com/package/ws) Socio uses on the server.
* [The WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) Socio uses on the browser.

The ``./core/core-server.ts`` file contains logic to be run on a backend server. It exports the class ``SocioServer`` that you instantiate and work with mostly during just the setup initialization of your backend. It creates a websocket server on a port and listens for clients to connect. It is the transaction middle-man between your DB and the SocioClient on the frontend doing queries.

The ``./core/core-client.ts`` file contains logic to be run on the frontend browser side of js. It exports the class ``SocioClient`` that you instantiate and work with during the entire lifetime of the page. Use it to make SQL and server-state queries to the backend, which will keep your data synced between the server and all clients.

The ``./core/secure.ts`` file contains logic to be run on a backend server. It exports the class ``SocioSecurity`` that you instantiate and work with mostly during just the setup initialization of your backend. There is also a Vite plugin (``SocioSecurityVitePlugin``) that wraps that class, that you can use instead in your Vite app config. Should also work as a Rollup plugin, but havent tested. This securely encrypts the socio SQL query strings before serving the production code to the client, such that the client cannot see nor alter, nor impersonate the query string. However, it is still up to you to sanitize and protect yourself from SQL injections when inserting dynamic data into a query string! An identical setup of this class should be created on the backend server and handed to the SocioServer instance, for it to be able to decrypt the incoming SQL queries. Use .env files to keep your project secrets safe and consistent!

**Use HTTPS and WSS secure protocols** to protect against snooping and man-in-the-middle attacks.

**Encryption** and decryption uses the **AES-256-GCM algorithm (symmetric encryption)**, which guarantees Confidentiality - cannot be read; Integrity - cannot be altered; and Authenticity - server can verify the author of the created cypher text. There is also protection against known-plain-text attacks by inserting random numbers into the raw string. So it would be fine, if an attacker sees the encrypted and decrypted ciphertexts. Additionally, since decyphering at runtime is costly, a cache is implemented, which is not initialized and persisted beyond the process memory.

## SQL and NoSQL
Currently the lib has been developed with a main focus on SQL queries being written on the frontend. This matters, bcs i parse the sent strings with the assumption that they are valid SQL syntax. However, the lib now also supports a NoSQL paradigm in the form of what i call "Server Props".

"Server props" are a way for the backend to set up a (serializable) JS object, that can be subscribed to and manipulated by clients. Esentially creating an automagically synced variable across the backend and all clients. Ofc you may alter the prop on the backend as well at any time. The safety of its data is ensured by you. When registering a new prop to SocioServer, you can supply an "assigner" function, within which it is your responsibility to validate the incoming new value and set it by whatever logic and report back to SocioServer, that the operation was successful or not. See ()[#Server-props] for more details.

In the future i may support more of the NoSQL ecosystem.

#### Youtube devlogs that talk more about some of the features here:
* [Socio.js v1.7.1 | Client-Side Reg-prop; File Compression; JSON to YAML](https://youtu.be/05mnpjxXx9M)
* [Socio.js v1.3.12 | Arbiter; Endpoint subs; prop encryption etc.](https://www.youtube.com/watch?v=HSbyOZ9dmH8)
* [Socio.js v0.8.2 & v0.9 | Socio strings & Request Progress](https://www.youtube.com/watch?v=wZQxjz1d868)
* [Socio.js - Getting started v0.7](https://www.youtube.com/watch?v=t8_QBzk5bUk)
* [Socio.js v0.7.0 | Real-Time Chat; Optimizations; Compression](https://www.youtube.com/watch?v=61tG9Xj244Q)
* [Socio.js v0.6.0 | WebSocket File Transfer; Query Security](https://www.youtube.com/watch?v=YA3gvZuFKII)
* [Socio.js v0.5.0 | WebSocket Persistence; Admin Client](https://www.youtube.com/watch?v=af2k7r-77mE)
* [Socio.js v0.4.5. | Demo in SvelteKit + Vite](https://www.youtube.com/watch?v=iJIC9B3cKME)
* [Socio.js v0.3.15 Demonstration in SvelteKit + Vite](https://www.youtube.com/watch?v=5MxAg-h38VA)

## Example code snippets

Interesting note: The snippets marked for browser use cannot be run on Node.js, however, can be run on the Deno JS backend runtime. Though, im not sure if the rest of the socio lib is Deno friendly. The "ws" lib Socio uses for the backend might not be compatible with Deno. This is interesting, because Socio maintains two versions of the "admin-client" implementation. You can pick yours depending on your JS runtime engine.

### Setup of ``SocioServer``

```ts
//server code - can be in express or SvelteKit's hooks.server.ts/js file or whatever way you have of running server side code once.
import { SocioServer } from 'socio/dist/core-server.js';
import type { SocioSession } from 'socio/dist/core-session.js';
import type { IncomingMessage } from 'http';
import type { QueryFunction } from 'socio/dist/core';
import type { id, Admin_Hook } from 'socio/dist/types';

//SocioServer needs a "query" function that it can call to fetch data from your DB. This would usually be your preffered ORM lib interface raw query function, but really this function is as simple as input and output, so it can work however you want. Like read from a local txt file or whatever. Socio will always await its response to send back to the client.
//id is a unique auto incrementing index for the query itself that is sent from the client - not really important for you, but perhaps for debugging.
const QueryWrap: QueryFunction = async (client:SocioSession, id:id, sql:string, params: object | null | Array<any> = {}) => (await sequelize.query(sql, { logging: false, raw: true, replacements: params }))?.at(0)
//https://sequelize.org/docs/v6/core-concepts/raw-queries/#replacements how replacements work. I use the sequelize lib here and in demos and my personal projects for very crude convecience, but it should be noted that i despise this ORM to my very core, its unreal. Implement this function in any other way you see fit.

//Instance of SocioServer on port 3000 using the created query function. Verbose will make it print all incoming and outgoing traffic from all sockets. The first object is WSS Options - https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback
const socserv = new SocioServer({ port: 3000 }, {
    db: {
      Query: QueryWrap as QueryFunction,
      ...//optional other db settings
    }, 
    logging: {verbose:true}
  }
);
//the clients can now interact with your backend DB via the SocioClient.Query() and other functions!


//---- More advanced stuff:

//This class has a few public fields that you can alter, as well as useful functions to call later in your program at any time. E.g. set up lifecycle hooks:
socserv.LifecycleHookNames; //get an array of the hooks currently recognized by Socio.
socserv.RegisterLifecycleHookHandler("con", (client:SocioSession, req:IncomingMessage) => {
    //woohoo a new client connection!
    //client is the already created instance of Session class, that has useful properties and methods, like the ID and IP of the client.
});

//all the hooks have their types in "socio/dist/types", so that you can see the hook param type inference in your IDE:
const handle_auth_hook: Auth_Hook = (client, ...) => {...}
socserv.RegisterLifecycleHookHandler("auth", handle_auth_hook);
```

#### Server and Client Hook definitions
The types.d.ts file contains type definitions for all the server-side and client-side hook functions, so that you know what args they pass to your callback.
You can import and use them as such:
```ts
//server hook functions:
import type { Admin_Hook } from 'socio/types';
const handle: Admin_Hook = (client, data) => {...}; //(client, data) both params should have automatic type inference with a TS language server in your IDE.
socserv.RegisterLifecycleHookHandler('admin', handle);

//client hook function signatures:
import type { Cmd_ClientHook, Msg_ClientHook, Discon_ClientHook, Timeout_ClientHook ... } from 'socio/types';
```
Perhaps you know of a better way to use them, but i am not as familiar with TS.

#### Authentification hook - a simple mechanism
```ts
//server code
import type { SocioSession } from 'socio/dist/core-session.js'

//keep track of which SocioSession client_id's have which of your database user_id's.
const auth_clients:{[client_id:string]: number} = {};
socserv.RegisterLifecycleHookHandler("auth", (client:SocioSession, params: object | null | Array<any>) => {
    const user_id = DB.get(params);//...do some DB stuff to get the user_id from params, that may contain like username and password. This data will be encrypted by lower OSI layers, if using WSS:// (secure sockets). However, its still a good practice, that DB passwords should not be sent in plain-text.
    auth_clients[client.id] = user_id;
    return true;
})

//then in your qeury function, add in the user_id dynamic param
async function QueryWrap (client:SocioSession, id:id, sql:string, params: object | null | Array<any> = {}) {
  if('user_id' in params) //replace the params client side dummy user_id with the real one. Because the client side user_id cannot be trusted.
    params.user_id = auth_clients[client.id]; 
  //you could also check if(client.authenticated) ... but that is unnecessary since the incoming msg wouldn't even get this far if the -auth flag is set and the user isnt authed.

  return (await sequelize.query(sql, { logging: false, raw: true, replacements: params }))[0];
}

//*of course you can set your own properties on the client instances. However, they will not be copied to a reconnect instance, so it is still advised to do this as shown.
```

#### Endpoint hook - storing your SQL queries on the backend.
In case you really want to burden your Dev-X, you may store your SQL query strings locally on the backend wherever and however you wish, even unencrypted. This is not the intended use of Socio, but i wont stand in your way.

Instead of a client subscribing to the encrypted socio string and sending that, an "endpoint keyname" unencrypted string can be passed, which will be sent to the backend and resolved to an actual SQL string there. It must be a valid SQL string, since the rest of the procedure is identical to a regular subscription.
```ts
//server code
const endpoints: {[e:string]: string} = {
  'all':'SELECT * FROM Users;'
}

const socserv = new SocioServer(...);

//this hook will be called when socio server gets a subscription request payload that contains an endpoint string and no sql string. Your callback must then by any means resolve to a valid SQL string and return it. The hook response can be async and it will be awaited. Here it is just fetched from a local dict instantly. These subscriptions work identically to regular ones.
socserv.RegisterLifecycleHookHandler('endpoint', async (client:SocioSession, endpoint:string) => {
  return endpoints[endpoint];
});
```

```ts
//browser code
const sc = new SocioClient(...);

//cannot supply both sql: and endpoint:
sc.Subscribe({endpoint:'all', params:{}}, (val) => { //params is, as always, optional
  log(val); //will log the result of 'SELECT * FROM Users;' query and send updates
});
//similar with Query
sc.Query('all', {sql_is_endpoint:true, params:{}}, (val) => {
  log(val);
});
```

#### All lifecycle hooks:

Descriptions of hook purpose. See [types.d.ts](./core/types.d.ts) for their type definitions.

Register hook handlers with
```ts
socserv.RegisterLifecycleHookHandler('...', (...) => {return ...});
```
If the hook returns a truthy value, then it is assumed, that the hook handled the msg and Socio will not. Otherwise, by default, Socio handles the msg.
All hooks are awaited, so you can do any async task in the callbacks.

##### SocioServer hooks:
* con: when a new WS/TCP connection with a client is created
* discon: when a session object disconnects (for whatever reason), but is not destroyed (forgotten) yet
* msg: receives all incomming msgs to the server. 
* serv: a generic message has come from the client, which you can handle yourself. Socio doesnt do anything for these.

* sub: a client wants to subscribe to a query
* unsub: a client wants to unsubscribe from a query
* upd: works the same as msg, but for every time that updates need to be propogated to all the sockets.
* endpoint: if the client happens to want to use an endpoint keyname instead of SQL, retrieve the SQL string from this hook call.

* gen_client_id: called to generate a unique ID for a client session. By default - UUID4
* gen_prop_name: called to generate a unique ID for a prop name. By default - UUID4. Usually used for generating party game room state prop and codes, when a prop is created client-side.

* auth: client wants to authentificate, which will set a special bool flag on the session, which is used for giving access to performing SQL calls, that require the client to be authentificated. Has to return a bool.
* grant_perm: for validating that the user has access to whatever tables or resources the sql is working with. A client will ask for permission to a verb (SELECT, INSERT...) and table(s). If you grant access, then the server will persist it (remember) for the entire connection.
* admin: when a socket attempts to use an ADMIN msg kind. It receives the SocioSession instance, that has id, ip and last seen fields you can use. Also the data it sent, so u can check your own secure key or smth. Return truthy to allow the admin action

* blob: the client has sent a BLOB (binary data) to the server. Socio doesnt do anything for these.
* file_upload: a client uploads a file(s) to the server. Socio doesnt do anything for these.
* file_download: a client requests a file(s from the server. Socio doesnt do anything for these.

##### SocioClient hooks:
* discon: the client disconnected from SocioServer
* msg: the client has received a message from SocioServer
* cmd: SocioServer has sent a generic command message for the client. Socio doesnt do anything for these.
* timeout: SocioServer notifys the client that its session has timed-out. The discon hook will fire seperately at some point.
* prop_drop: SocioServer has dropped (unregistered/destroyed) this prop, so there wont be any more updates for its state and it doesnt need to be unregistered by the client.

#### WebSocket perMessageDeflate (Zlib Message Compression)
You may want to compress incoming and outgoing messages of your WebSockets for less network traffic. However, note that the use of compression would obviously add to CPU and RAM loads. In addition, see other concerns - [slow speed and possible memory leaks](https://github.com/websockets/ws/issues/1369) [ws readme](https://github.com/websockets/ws#websocket-compression). I have provided the ``perMessageDeflate`` object for convenience, which is the default from the ws readme. From my investigation, this is enough to get it working. [See here](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#instance_properties) and check on SocioClient.ws.extensions

```ts
import { perMessageDeflate } from 'socio/dist/utils';
const socserv = new SocioServer({ port: 3000, perMessageDeflate }, {...} );
```

#### Session Timeouts (session max age since last seen active)
Simply declare a server config object with default options for all sessions. These properties can be altered at runtime on the SocioServer instance or some on SocioSession (aka "client" variable in most examples here)

```ts
const socserv = new SocioServer({ ... }, { 
  ..., 
  session_defaults:{
      timeouts:true, //if true, will set up a timer interval to check all sessions to be timed out. Default false.
      timeouts_check_interval_ms:1000 * 2, //^ timer check interval. E.g. every 2 minutes.
      ttl_ms:1000*60*60*2, //default to apply for all sessions. This same property on each SocioSession is public and can be changed at any time. E.g. 2h of inactivity will get timed out
      session_delete_delay_ms:1000, //delay grace period to wait since marked for deletion. This gives time for the client to attempt a reconn or whatever.
      recon_ttl_ms: 1000 * 60 * 60, //reconn token expiration time. E.g. 1h since issued.
      max_payload_size: 1024 //the max character count of a stringified JSON that is allowed to be sent out to clients. This is to prevent "payload bombs" by other nefarious clients.
    }
  });
```
If you want to have a fixed time period timeout since connection, you can do that yourself with server hooks or other ways. Set up a client_id and connection timestamp. And loop through checks on sessions in your own timer. Calling SocioSession.CloseConnection() will terminate the WS conn and clean up all associated SocioServer data structures.

You can quite easily mimic HTTP cookie sessions on whatever backend by using SocioServer hooks with SocioSession id's.

#### DB init object
```ts
//server code

//the "db" object can have more features than just the hook-up with your backend database.
type QueryFunction = (client: SocioSession, id: id, sql: string, params?: any) => Promise<object>;
type Arbiter = (initiator: { client: SocioSession, sql: string, params: any }, current: { client: SocioSession, hook: SubObj }) => boolean | Promise<boolean>;
const socserv = new SocioServer({ ... }, {
    db: {
      Query: fun as QueryFunction, //REQUIRED. If you wish to only use socio props or other features, then pass here () => {}
      
      Arbiter: fun as Arbiter //optional. Is called in the inner most loop of the SocioServer.Update() function. 
      //It lets you decide, if the update triggering query (made by some client or admin rpc call) alters the database enough such that another clients subscription should be updated. 
      //It asks you to arbitrate this call per subscription hook of every subscribed client. 
      //Returning false will skip this hook, whereas true will let it continue onto calling the DB and sending the UPD to the client.
      //You'd use this for medium to large sized projects with lots of concurrent users. In this function you'd parse the SQL WHERE clauses yourself and look at the dynamic parameters to judge, if the initiator client has altered another client's subscribed rows of data of some tables.
    }, 
    ...
  }
);
```

### Setup of ``SocioClient``

When using SocioSecurity, but advised to always do this, the "socio" [JS Template Literal Tag](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates) must be used, though it doesnt do much. It is just used to conveniently tag to later find socio strings within source code with regex during the encryption procedure. Kind of like a landmark in the soup of source code.

```ts
//browser code - can be inside just a js script that gets loaded with a script tag or in components of whatever framework.
import { SocioClient } from 'socio/dist/core-client.js';
import { socio } from 'socio/dist/utils';

//instantiate the Socio Client from lib on the expected websocket port and wait for it to connect
//NB! use wss secure socket protocol (wss) and use the ./core/Secure class to encrypt these queries in PROD!
const sc = new SocioClient(`ws://localhost:3000`, { logging: {verbose:true} }) ;//each instance is going to be its own "session" on the server, but you can spawn and destroy these where ever in your code
await sc.ready(); //wait until it has connected as confimed by the server

sc.client_id; //can take a look at its ID, if that interests you idk

console.log((await sc.Query(socio`SELECT 42+69 AS RESULT;`))[0].RESULT);//will imediately send a one-time query to the DB and print the response result

//subscribe to the changes of this query - whenever the table is altered on the backend. And run the callback with the new received data
//this will also run the sql query to get the initial value, then indefinitely receive updates and rerun this callback.
sc.Subscribe({ sql: socio`SELECT COUNT(*) AS RESULT FROM users;`}, (res) => {
    let ans = res[0].RESULT //res is whatever object your particular DB interface lib returns from a raw query
});

//-----------------more advanced stuff:

//now if we insert new data into the table, the above callback will rerun with the new data as refetched from the DB. Automagical.
const new_user_id = await sc.Query(socio`INSERT INTO users VALUES('Bob', 420) RETURNING id;`);

//queries with dynamic data - via params:
await sc.Query(socio`SELECT COUNT(*) AS RESULT FROM users WHERE name = :name;`, { name: 'Bob' } ); //it is up to you to sanitize 'Bob' here or hope your DB has injection protection.

//security:
await sc.Query(socio`SELECT COUNT(*) FROM users;`); //prefix a JS template literal tag "socio" to mark it to be encrypted by the SocioSecurity class during code building or bundling. Use the included Vite plugin or make your own way of integrating the class. NB! All strings in your entire frontend code base of this pattern will be encrypted. Postfix an SQL comment of dash seperated params in any order, e.g. '--perm-auth' to indicate, that this query shouldnt run without the required permissions on tables and that the session must be authenticated.

//you may also want to be safe that the encrypted query can only be executed by "logged in" or authenticated users. Just include another postfix:
await sc.Query(socio`SELECT COUNT(*) FROM users;--auth`); //the backend will only execute this, if the session is marked as authenticated. But how would that come to be? 

//Fear not, after awaiting ready, just send an auth request:
const auth_success = (await sc.Authenticate({username:'Bob', password:'pass123'}))?.result; //success = Promise<{ id: id, result: boolean }>. The params to the request are your free choice. This object will be passed to your auth hook callback, and it is there that you compute the decision yourself. Then you may execute --auth queries. If this socket were to disconnect, you'd have to redo the auth, but that isnt very likely. You can also at any time check the instance sc.authenticated property to see the state. Persistant socio clients will stay authenticated. NB! Use WSS and HTTPS protocols to avoid middle-man snooping on these private credentials.

//Similar mechanism for table permissions:
const perm_success = (await sc.AskPermission('SELECT', 'Users'))?.result; //The perm is asked and granted per VERB on a TABLE. This will be passed to your grant_perm hook callback, and it is there that you compute the decision yourself. Then you may execute --perm queries. If this socket were to disconnect, you'd have to redo the perm, but that isnt very likely. If you want to later check, if an instance has a perm, then you'd do this same procedure, but the server already knows what perms you have, so its quicker. Persistant socio clients will keep perms.
```
[Here is how to make the https/wss connection with SSL](#setup-for-https--wss-secure-sockets-with-ssl-certificates)

#### Client Sending Files
```ts
//browser code
//setup is the same as above until sc.ready()
const file_input_element = document.getElementByID('my-file-input'); //or any other way you'd normaly get the chosen files, like the onchange event etc.
const success = (await sc.SendFiles(file_input_element.files, {any:'other data here in this object'}))?.result; //important that the passed files are all of class File, which extends Blob.
```

#### Server Receiving Files
```ts
//server code
const socserv = new SocioServer(...)
import { SaveFilesToDiskPath } from 'socio/dist/fs-utils';

import type { SocioSession } from 'socio/dist/core-session';
import type { SocioFiles, FS_Util_Response } from 'socio/dist/types';

socserv.RegisterLifecycleHookHandler('file_upload', (client: SocioSession, files: SocioFiles) => {
    return SaveFilesToDiskPath(['.', 'files', 'images'], files).result; //simple function for your convenience, that cross platform saves your files to your FS directory
    //returns FS_Util_Response, but this function must return truthy or falsy to indicate success.
    //FS_Util_Response contains result and error fields, that indicate if the FS call was successful and/or the os error msg. So you can log errors yourself.
});
```

#### Client Requesting Files
```ts
//browser code
const files: File[] = await sc.GetFiles(data); //This will request files from the server and give back an array of browser File type with expected properties.
//data is anything you want to send to your file_download server hook. It can be an array of filenames, paths, numbers, anything json serializable.
//if unsuccessful or no files returned, then files will resolve to null.
```

#### Server Sending Files
```ts
//server code
import { ReadFilesFromDisk, MapPathsToFolder } from 'socio/dist/fs-utils';
import type { FS_Util_Response } from 'socio/dist/types';

socserv.RegisterLifecycleHookHandler('file_download', (client: SocioSession, data: any) => {
    //data is anything you passed into the client exactly the same. Up to you how you want to locate your files via paths, aliases, whatever.
    return ReadFilesFromDisk(['./images/hello.avif', ...data]); //simple utility. Does not include lastModified or mime type, but you can add those yourself with some lib.
    //MUST return the FS_Util_Response type!! ReadFilesFromDisk returns it.
    //FS_Util_Response contains result and error fields, that indicate if the FS call was successful and/or the os error msg. So you can log errors yourself.
    //MapPathsToFolder can be used to map the clients file paths to your static files folder.
});
```

#### Sending Blobs/Binary data
```ts
//browser code
//setup is the same as above until sc.ready()
const success = (await sc.SendBinary(new Blob() | ArrayBuffer | ArrayBufferView))?.result; 
//Note that this very primative and a special case. If you need to add extra data to this, then you're gonna have to start creating your own byte formats etc. This is handled on the server via the blob hook, and it will receive this exact same binary data, most likely as a Buffer.
```

### Setup of ``SocioSecurity`` and ``SocioSecurityVitePlugin``

```ts
//server code
import { SocioServer } from 'socio/dist/core-server.js'
import type { SocioSession } from 'socio/dist/core-session.js'
import { SocioSecurity } from 'socio/dist/secure';

//vite plugin and this instance must share the same private secret key, so perhaps use .env mechanism
const socsec = new SocioSecurity({ secure_private_key: 'skk#$U#Y$7643GJHKGDHJH#$K#$HLI#H$KBKDBDFKU34534', logging: {verbose:true} });
const socserv = new SocioServer({ ... }, { ... , socio_security: socsec });
//by default ecrypts all strings that end with the socio marker, but decryption can be individually turned off for either sql or prop key strings.
```

```ts
//vite.config.ts in a SvelteKit project

import { sveltekit } from '@sveltejs/kit/vite';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';//you may or may not need this. Idk, in my testing i dont have it.
import { SocioSecurityVitePlugin } from 'socio/dist/secure';

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [SocioSecurityVitePlugin({ secure_private_key: 'skk#$U#Y$7643GJHKGDHJH#$K#$HLI#H$KBKDBDFKU34534', logging: {verbose:true} }), viteCommonjs(), sveltekit()],
};

export default config;
```
The ``SocioSecurityVitePlugin`` also takes in an extra options object parameter that the base class doesnt. ``include_file_types`` = ``['js', 'svelte', 'vue', 'jsx', 'ts', 'tsx']`` (default) ; ``exclude_file_types`` = [] (default) ; ``exclude_svelte_server_files`` = true (default)

### Setup for HTTPS & WSS (secure sockets) with SSL certificates
```ts
//bakcend code when creating the HTTPS/WSS SocioServer
import * as https from 'https';
import fs from 'fs';

// Create a boostrapping HTTPS server, from where the WSS will takeover on each request.
// You can also use your existing http server, like what express.js creates.
const https_server = https.createServer({
    cert: fs.readFileSync('cert.pem'), //need to generate or aquire these with OpenSSL or other utility, but the certificate signing authority needs to be globaly recognized and valid or browsers will reject it.
    key: fs.readFileSync('key.pem')
});
https_server.listen(3000); //listen on port 3000

//then as normal, but pass the server instead of a port number
const socserv = new SocioServer({ server:https_server }, {...});
```
Now clients can connect to the socio server with a url as usual, but the url would start with ``wss://`` instead of ``ws://``

### Server Props
A shared JSON serializable value/object/state on the server that is live synced to subscribed clients and is modifyable by clients and the server.

```ts
//server code
import { SocioServer } from 'socio/dist/core'
import type { PropValue } from 'socio/dist/types';
const socserv = new SocioServer(...)

//set up a key "color" to hold an initial value of "#ffffff" 
//and add an optional assigner function instead of the unsafe default. The assigner does 2 things - validate the new_val and set the prop to that new_val.
//return truthy to report back to the prop upd function, that this is an accepted, valid action and the new prop val has been set.
//a default assigner is used for all props that just sets the value to whatever the new one is without checks (unsafe af tbh).
socserv.RegisterProp('color', '#ffffff', {
  assigner:(curr_val:PropValue, new_val:PropValue):boolean => {
    if(typeof new_val != 'string' || new_val.length != 7) return false;
    if (!new_val.match(/^#[0-9a-f]{6}/mi)) return false;
    //...more checks.
    
    //success, so assign
    return socserv.SetPropVal('color', new_val); //assign the prop. Returns truthy, if was set succesfully
  }, //default SocioServer.SetPropVal
  client_writable:true, //clients can change this value. Default true
  send_as_diff:false, //send only the differences in the prop values. Overrules the diff global flag. Default false.
  emit_to_sender:false, //emit an update to the original client, that set a prop val and caused the update to happen, if the client is subbed to this prop. Default false.
  observationaly_temporary:false //auto unregister this prop (clean up) when it has no more subscribers left. Useful for props as "rooms". Default false.
})
```

Then in the browser any client can subscribe to it:
```ts
//browser code
const sc = new SocioClient(...);
await sc.ready();
let col = await sc.GetProp('color'); //one-shot request the prop value from the server.
const res = await sc.SetProp('color', '#fff'); //request the server to set a prop to a val. Res contains info about the success of this action, since the server can deny it.

sc.SubscribeProp('color', color => col = color); //will call this callback function on realtime updates made to the prop either by other clients or the server.
//afterwards this prop will also be stored locally on the client, so you can also fetch its value without calling the server:
col = await sc.GetProp('color', true); //last arg local=true
```

Though usable for realtime web chat applications, i advise against that. There is a socio/chat.ts file that handles such a usecase in a more generic and extendable way.

To be more network efficient, Socio can be set to use the [recursive-diff](https://www.npmjs.com/package/recursive-diff) lib for props. This is a good idea when your prop is a large or deeply nested JS object and only small parts of its structure get updated. Only differeneces in this object will be sent through the network on PROP_UPD msgs. Keep in mind, that if one of these msgs gets lost for a client, then its frontend prop will go out of sync unnoticeably and irreparably. The setup is a flag on the SocioServer constructor options:

```ts
//server code
const socserv = new SocioServer({...}, {..., prop_upd_diff:true}); //will make all PROP_UPD msgs send differences in the complex object, rather than the whole object. NOTE that an initial subscription to a prop will send back a PROP_UPD msg, but it is not affected by this, and will always be the full value of the prop at that time.
socserv.RegisterProp(...);

//this global flag can be overwritten per UpdatePropVal call, to force either full or diff val to be sent:
socserv.UpdatePropVal(..., true); //last arg send_as_diff overwrites prop_upd_diff for this send to all subs.

//AND on the client side:
await socio_client.SetProp(..., true); //set the prop_upd_as_diff flag to a value, which will overwrite the socserv.prop_upd_diff global flag.
```

For more security/paranoia, props can be registered such that clients are not allowed to write, just read props.
```ts
//server code
socserv.RegisterProp(..., {client_writable:false});
```


Socio also lets clients create props new props on the fly. There are limitations to this however, observationaly_temporary is always set true. This is to prevent client spamming new props that nobody uses just to fill up the servers ram. Useful for creating "[Socio rooms](#socio-roomsspacespresentationscollabs-divided-shared-contexts)"
```ts
//browser code
const sc = new SocioClient(...);
// these all return the result object as usual
await sc.RegisterProp('new_prop', 'optional_init_val', {other_prop:opts}); //creates the prop on the server instance it is connected to
await sc.SubscribeProp('new_prop', () => {}); //works like a regular prop in every way
await sc.UnsubscribeProp('new_prop'); //the last unsub will trigger an automatic unregistration of this prop.
const prop_name_uuid = (await sc.RegisterProp(undefined)).prop; //prop name can be omitted, which creates a new prop on the server instance with a random unique UUID guaranteed without collision and returns it here
```

### Generic communication

To ensure extendability, i have created a simple generic communication mechanism. Clients can send any generic serializable object to the server, where Socio will just pass it to a special hook and not do anything else with it. It is then the servers responsibility to answer to the client.

```ts
//browser code
import {SocioClient} from 'socio/dist/core-client.js'
const sc = new SocioClient(`ws://localhost:3000`, { logging: {verbose:true} })
await sc.ready()

await sc.Serv({some:'data'} || 'string' || ['anthing']) //use the serv() function to serve anything to the backend
```

```ts
//server code
import { SocioServer } from 'socio/dist/core-server.js'
import { ClientMessageKind } from 'socio/core-client';
import type { MessageDataObj } from 'socio/dist/core-server.js'
import type { SocioSession } from 'socio/dist/core-session.js'
const socserv = new SocioServer(...)

socserv.RegisterLifecycleHookHandler('serv', (client:SocioSession, data:MessageDataObj) => {
  //data has field "id" and "data" that is the literal param to the client-side serv() function

  //respond, bcs the client always awaits some answer
  client.Send(ClientMessageKind.RES, {id:data.id, result:1}) //result is optional
})
```

Though the server can also intercept any msg that comes in from all clients via the 'msg' hook.

Likewise the server can send a command (CMD) to any client via the SendToClients() function, where your client-side hook can handle it.

```ts
//server code
const socserv = new SocioServer(...)
socserv.SendToClients([], {some:"data"}); //empty array of client_id's will emit to all connected. Returns void.
```

```ts
//browser code
const sc = new SocioClient(...)
sc.lifecycle_hooks.cmd = (data:any) => { console.log(data) }
```

### Socio Rooms/Spaces/Presentations/Collabs (Divided, shared Contexts)
For a lot of SaaS and Digital Document type Web Apps or multiplayer games you're gonna want some form of the idea of a "room" for users - a shared data/state context with certain users (subset of all possible users). Socio doesn't have a special solution for such a pattern, but only because it doesn't need one. 😎
You can create such a pattern simply with Socio Server Props. The prop name would be a unique "room" ID, that Socio Clients can subscribe to. Then the entire "room" or "game" shared state can be a large JSON serializable object. Thus only specific users will interact with this global state and it will be live synced to the others in that "room".
This object can grow large, because you can send just the differences in updates to the object and not the whole object. This happens automagically for you :)

The manual way with full control is something like this:
```ts
import { ClientMessageKind } from 'socio/core-client';
const socserv = new SocioServer(...)

//use the generic communications mechanism to init a room
socserv.RegisterLifecycleHookHandler('serv', (client:SocioSession, data:MessageDataObj) => {
  if(data.data.action == 'create_room'){
    //generate new room id
    const id = UUID()

    //generate new room server prop
    socserv.RegisterProp(id, {}, {send_as_diff:true}) //add a assigner function yourself or dont idk

    //tell the user their room ID so they can share with their friends.
    client.Send(ClientMessageKind.RES, {id:data.id, room_id:id})
  }else if(data.data.action == 'destroy_room'){
    //last person to exit the room should call to destroy it. You can think of ways to ensure this yourself. Get creative :)
    socserv.UnRegisterProp(data.data.room_id) //free memory of server
    client.Send(ClientMessageKind.RES, {id:data.id, result:1})
  }
})
```
The more convenient way is for the client to register a new prop from the front-end. [Server Props](#server-props)

This is great for Web games like "Kahoot", "Codenames", any kind of presentation with slides, perhaps even collaborative editable text documents etc.

#### Basic Real-Time Chat Mechanism
WebSockets were pretty much made to solve the issue of chats for the web. As Socio uses WebSockets for a much grander purpose, still I provide a convenient basic setup of chat rooms. This is more specialized and potentially less problematic than the [Socio Rooms](#Socio-Rooms) idea.

```ts
//server code
import { SocioServer } from 'socio/dist/core-server.js';
import type { MessageDataObj } from 'socio/dist/core-server.js';
import type { SocioSession } from 'socio/dist/core-session.js';
import { ServerChatRoom, HandleChatRoomServ } from 'socio/dist/chat.js'; //safe to import on both server and browser

const socserv = new SocioServer(...);
const chat_room = new ServerChatRoom(socserv.SendToClients.bind(socserv), 10); //create a chat room, that will use the SocioServer "emit" function to send to clients. Also specifies msg history length

socserv.RegisterLifecycleHookHandler('serv', (client: SocioSession, data: MessageDataObj) => {
    HandleChatRoomServ(client, data, [chat_room]); //convenience, if you use the socio CMD protocol. Will handle taking in new msgs from clients and emit to others in the room.
    //an array of chats, because this handles all rooms. Here we have 1 room.
})
```

```ts
//browser code
import {SocioClient, type ClientMessageDataObj} from 'socio/dist/core-client.js';
import { ChatRoomClient, type ChatRoomMessage, HandleChatRoomCMD } from 'socio/dist/chat.js'; //safe to import on both server and browser
const sc = new SocioClient(...);

//variable to hold state
let chat_messages:ChatRoomMessage[] = [];

//create a chat room connection client, that will use the SocioClient SERV protocol for communication.
const chat = new ChatRoomClient(sc.Serv.bind(sc), (msgs:ChatRoomMessage[]) => {
    chat_messages.push(...msgs);
    chat_messages = chat_messages; //Svelte reactive statement. Ignore, if not using Svelte.
});
//setup the CMD hook to handle incoming msgs, using the convenience handler
sc.lifecycle_hooks.cmd = (data:ClientMessageDataObj) => {HandleChatRoomCMD(data, chat)}

await sc.ready();
chat.Join(1); //room_id = 1
chat.Post('hello, world');
chat.Leave(); //will leave the current room
//note that these are not async functions and cannot be awaited. (bcs i was lazy) Thus, they might execute in unexpected order. Leave all else to the TCP packet gods.
```
However, this is a very basic implementation. It exposes client_id to all room members and room_id is sent with each msg, so users can pretty much hop rooms without regulation. There are also no private rooms or passwords and many other modern features, that chat rooms should have. Take a look at the convenience functions; I'm sure you can easily create better :)

### Rate-limiting

Sometimes you might expect a lot of connections and each to have a lot of different queries firing often. To save the server from bombardment, HTTP webservers have well established rate-limiting mechanisms. Unfortunately, i am not aware of similar solutions for WebSockets, so i invent my own, which have a lot of downsides. However, they are super efficient and performant currently.

```ts
//server code
import { SocioServer } from 'socio/dist/core-server.js';
import type { MessageDataObj } from 'socio/dist/core-server.js';
import type { SocioSession } from 'socio/dist/core-session.js';
const socserv = new SocioServer(...)

socserv.RateLimitNames; //all the hook names for convenience

//register a global rate-limit for the server instance for the internal Update() function, that notifies all cliends of new data.
//allows 10 calls per 1 second. Overflowing the limit will simply dead-stop the Update() function execution at the start. Clients dont get notified, since that would go against the point of limiting traffic.
socserv.RegisterRateLimit('upd', {n:10, seconds:1}) //either ms, seconds, minutes
```

Caution! This approach will inevitably lead to bad UX for your application. Rate-limiting by nature desyncs state between client and server. This leads to seeing and acting on outdated data, slow action feedback times and other problems. Rate-limiting should only be used when your server performance is more valuable than UX or the rate-limits are set so high, that only malicious users would run into them.

You may also add ratelimits to individual subscriptions on the front-end.
```ts
//browser code
import {SocioClient} from 'socio/dist/core-client.js';
import { socio } from 'socio/dist/utils';

const sc = new SocioClient(`ws://localhost:3000`, {logging: {verbose:true}})
await sc.ready()

sc.Subscribe({ sql: socio`SELECT COUNT(*) AS RESULT FROM users;`}, (res) => {
    let ans = res[0].RESULT //res is whatever object your particular DB interface lib returns from a raw query
}, {}, {n:5, minutes:1}) //rate limit of 5 per 1 minute UPD receivable. Server wont send upd, if exceedes.

sc.SubscribeProp('color', (c) => {let ans = c}, {n:5, minutes:1}) //rate limit of 5 per 1 minute UPD receivable. Server wont send upd, if exceedes.
```
This again leads to similar problems, but per query.

### Admin socket

Wouldnt it be nice to connect to the backend SocioServer and run instructions on there at runtime? Well you can, but the safety of that is completely in your hands. Opt-in mechanism.

```ts
//some node.js script. The server-admin.js runs only on node, and doesn't inherit from SocioClient, whereas admin-client.js does and runs only on the browser.
import {AdminClient} from 'socio/dist/admin-server.js';

//AdminClient is just a convenient wrapper for the actual mechanism, which you can do yourself. 
const ac = new AdminClient({url:"wss://localhost:3000", client_secret:'jh45kh345j34g53jh4g52hj3g542j3h2jh34g'}); //NOTE should always use WSS instead of ws protocol for safety, but i dont yet have a way of checking that on the server.
await ac.ready();
const res = await ac.Run('GetPropVal', 'color') //will call SocioServer.GetPropVal('color') and return the call return value. The name of the function and infinite args to pass to it.
```

```ts
//backend socio server setup to allow admin connections
//...imports

const socserv = new SocioServer(...);

//'admin' will be called whenever any socket attempts to take action as an admin.
socserv.RegisterLifecycleHookHandler('admin', (client:SocioSession, data:any) => {
    console.log(client.id, client.ipAddr, client.last_seen, data?.function, data?.args, data?.client_secret) //perform any checks with this - IMPORTANT for your own safety
    return true; //return truthy to grant access to the call.
    //Any public SocioServer instance method or object property can be called by its name
})
```

The neat thing is that, this mechanism just uses WebSockets, so you can implement your own admin client in any language, even from a remote computer and even on the browser! Imagine how simple it would be to create an admin dashboard with this! Just look at the wrapper code, and it should be clear how to make your own. Its not that long.

### Client page navigation persistence (reconnect/keep alive)

Since page navigation/reload unloads the entire document from memory and a new document is loaded in place, all client websocket sessions get wiped as well. This would mean re-authenticating and regaining all perms every reload. No good. Setting the ``persistent`` flag on SocioClient construction will automagically setup a mechanism that keeps the session data between page reloads. Though not between multiple tabs.

```ts
//browser code
import {SocioClient} from 'socio/dist/core-client.js';
const sc = new SocioClient(`ws://localhost:3000`, { 
  logging: {verbose:true},
  name: "Main", //Usually doesn't matter, but for persistent = true, this must be identical on the old page socket and new page socket. This is used as a unique key.
  persistent:true //enables a mechanism that upon the new connection to the server, gives the server a special one-time token that gives this connection a previous sessions setup, i.e. auth and perms
});
```

Note that the ``name`` must be set on the old and new instance and they must be identical, so that socio knows which 2 sessions are attempting to reconnect.
After the reconnection attempt, the client asks for a new future use token to be used after the next reload. And so the cycle goes. Tokens are encrypted; stored via the Local Storage API (which is domain scoped); are one-time use, even if that use was faulty; have an expiration ttl (1h default); they check change in IP and other safety meassures.

Or a more risky opproach is to recognize client connections by their IP (v4 or v6, whichever is used). Do this with a global flag on the SocioServer config:
```ts
//server code

const socserv = new SocioServer({ port: 3000 }, {
    db: {...}, 
    logging: {...},
    auto_recon_by_ip:true // <- this
  }
);
```
"Risky", because of the nature of IPv4 there are hierarchies of IP addresses, bcs there arent enough of them for billions of devices (unlike IPv6). So the IPv4 should be unique to users under the same hierarchy, e.g. same ISP, if the Socio Server is also under this same ISP. Otherwise the same IPv4 might point to multiple ppl, i.e. all devices under an ISP would have the same IPv4 visible to Socio and would treat them as the same client. Shivers me timbers. But still useful for localhost dev, so that the clients dont have to use the tokens.

This is also not needed if your framework implements CSR (client-side routing), whereby the page doesnt actually navigate or reload, but just looks like it does.

This also has better safety than traditional HTTP(S) session cookies. https://en.wikipedia.org/wiki/Session_hijacking

### Query progress tracking (request progress bars)

The WebSocket protocol doesnt specify any mechanism for tracking individual payloads. However, they have a global buffered amount property, that can be read from at any time. I use that and payload size of the request and lots of math to track them in the buffer, such that you can simply ask socio to tell you the progress % of any request. NOTE that this is hacky and only an approximation of the actual values at play. Unexpected, wacky results might be returned, like even the % flowing backwards for a bit sometimes.

```ts
let prog = 0;
async function UploadFiles(e:any){
  const q = sc.SendFiles(e.target.files); //q is a promise, that will resolve to the result, when you await it. Rather than awaiting immediately, you can start tracking its progress and await later.
  //pass the promise object to the tracking function, which will set up a timer for you. By default, fires @ 30fps (33.34 ms), but you can change this to be slower, if your app is intensive.
  const interval_id = sc.TrackProgressOfQueryPromise(q, (p) => prog = p, freq_ms = 33.34); // the callback fires on an interval and gives you a float value, which is the % (0-100)
  log(await q); //await the result.
  clearInterval(interval_id); //at any time you can delete this timer as well.
}
```

In Svelte, it is more convenient with native stores.

```ts
import {writable} from 'svelte/store';
let prog = writable(0);

async function UploadFiles(e:any){
  const q = sc.SendFiles(e.target.files);
  sc.TrackProgressOfQueryPromise(q, prog.set, freq_ms = 33.34); //writable has the .set method you can call, and it will assign
  ...
}
```

```svelte
<progress value={$prog} max="100"></progress>
```

### Logging
Socio has its own ``LogHandler`` class in ``logging.ts``, which you can configure in its constructor, its public properties at runtime, or the ``logging:{}`` parameter of higher order class constructors. It also has static methods with defaults for its various logging level functions, so that you dont have to instantiate the class. This file also contains stand-alone function exports, that are shorthands for calling those static methods, for your convenience. Here are some of its config options:
```ts
const x = new SocioClass({..., 
  logging:{
    handlers = {info: LogHandler.log, error: LogHandler.soft_error, debug: LogHandler.debug}, //this can be your custom function that logs to a file or whatever
    verbose = false, //overall stopper of all msgs from printing to console. Doesnt affect the log handlers ^ . They are evaluated first.
    hard_crash = false, //should thrown errors throw futher (bubble) after the error msg is written? Usually causes the entire process to crash.
    prefix ='', //msgs of this class will have a prefix, e.g. [SocioServer], to know which class instance created the msg. Higher order classes have their logical defaults.
    use_color = true, //the msg prefix will get a background color representing its severity level. Some terminals dont understand these special bytes. Chrome dev tools and VS Code powershell both work fine. You also prop dont want these in your log files. NOTE, this option is a static class property, so it can be set at any time from anywhere! All instances share this prop.
    log_level: LogLevel.INFO //set the initial log level in the constructor. This can be altered at runtime via x.log_level = 1 | LogLevel.INFO | LogLevel[1] | LogLevel['INFO']
  }
});
```

On Unix systems simply the output of the terminal can be piped to a log file for persistance. E.g. ``node run > ./log.log``. Otherwise you can get creative ;)
