# Simple Documentation for Socio usage.
##### Those that know, do. Those that understand, teach. /Aristotle/

### Overview

* [WS](https://www.npmjs.com/package/ws) Socio uses on the server.
* [The WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) Socio uses on the browser.

The ``./core/core.ts`` file contains logic to be run on a backend server. It exports the class ``SocioServer`` that you instantiate and work with mostly during just the setup initialization of your backend. It creates a websocket server on a port and listens for clients to connect. It is the transaction middle-man between your DB and the SocioClient on the frontend doing queries.

The ``./core/core-client.ts`` file contains logic to be run on the frontend browser side of js. It exports the class ``SocioClient`` that you instantiate and work with during the entire lifetime of the page. Use it to make SQL queries to the backend that do some magic to keep your data realtime using WebSocket technology.

The ``./core/secure.ts`` file contains logic to be run on a backend server. It exports the class ``SocioSecurity`` that you instantiate and work with mostly during just the setup initialization of your backend. There is also a Vite plugin (``SocioSecurityVitePlugin``) that wraps that class, that you can use instead in your Vite app config. Should also work as a Rollup plugin, but havent tested. This securely encrypts the socio SQL query strings before serving the production code to the client, such that the client cannot see nor alter, nor impersonate the query string. However, it is still up to you to sanitize and protect yourself from SQL injections when inserting dynamic data into a query string! An identical setup of this class should be created on the backend server and handed to the SocioServer instance, for it to be able to decrypt the incoming SQL queries. Use .env files to keep your project secrets safe and consistent!
**Use HTTPS and WSS secure protocols** to protect against snooping and man-in-the-middle attacks on the dynamic query data.

### SQL and NoSQL
Currently the lib has been developed with a main focus on SQL queries being written on the frontend. This matters, bcs i parse the sent strings with the assumption that they are valid SQL syntax. However, the lib now also supports a NoSQL paradigm in the form of what i call "Server Props".

"Server props" are a way for the backend to set up a (serializable) JS object, that can be subscribed to and manipulated by clients. Esentially creating an automagically synced value across the backend and all clients. Ofc you may alter the prop on the backend as well at any time. The safety of its data is ensured by you. When registering a new prop to SocioServer, you can supply an "assigner" function, within which it is your responsibility to validate the incoming new value and set it by whatever logic and report back to SocioServer, that the operation was successful or not. If, for example, you hold a prop "color" that is a hex color string, you would have to validate that the new value your assigner receives is a string, starts with #, is 7 char long etc., then set it as the current value. Otherwise a default assigner is used for all props that just sets the value to whatever the new one is without checks (unsafe af tbh).

In the future i may support more of the NoSQL ecosystem.

## Example code snippets

### Setup of ``SocioServer``

```ts
//server code - can be in express or SvelteKit's hooks.server.ts/js file or whatever way you have of running server side code once.
import { SocioServer } from 'socio/dist/core.js'
import type { SocioSession } from 'socio/dist/core-session.js'
import type { IncomingMessage } from 'http'
import type { QueryFunction } from 'socio/dist/core';
import type { id } from 'socio/dist/types';

//SocioServer needs a "query" function that it can call to fetch data. This would usually be your preffered ORM lib interface raw query function, but really this function is as simple as input and output, so it can do whatever you want. Like read from a txt file or whatever. It should be async and Socio will always await its response to send back to the client.
//id is a unique auto incrementing index for the query itself that is sent from the client - not really important for you, but perhaps for debugging.
const QueryWrap = async (client:SocioSession, id:id, sql:string, params: object | null | Array<any> = {}) => (await sequelize.query(sql, { logging: false, raw: true, replacements: params }))[0]
//https://sequelize.org/docs/v6/core-concepts/raw-queries/#replacements how replacements work

//Instance of SocioServer on port 3000 using the created query function. Verbose will make it print all incoming and outgoing traffic from all sockets. The first object is WSS Options - https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback
const socserv = new SocioServer({ port: 3000 }, {DB_query_function: QueryWrap as QueryFunction, verbose:true} ); //the clients can now interact with your backend DB!

//This class has a few public fields that you can alter, as well as useful functions to call later in your program at any time. E.g. set up lifecycle hooks:
socserv.LifecycleHookNames; //get an array of the hooks currently recognized in Socio.
socserv.RegisterLifecycleHookHandler("con", (client:SocioSession, req:IncomingMessage) => {
    //woohoo a new client connection!
    //client is the already created instance of Session class, that has useful properties and methods, like the ID and IP of the client.
});
```

#### Authentification hook - a simple mechanism
```ts
//server code
import type { SocioSession } from 'socio/dist/core-session.js'

//keep track of which SocioSession client_id's have which of your database user_id's.
const auth_clients:{[client_id:string]: number} = {};
socserv.RegisterLifecycleHookHandler("auth", (client:SocioSession, params: object | null | Array<any>) => {
    const user_id = DB.get(params);//...do some DB stuff to get the user_id from params, that may contain like username and password
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

#### WebSocket perMessageDeflate (Zlib Message Compression)
You may want to compress incoming and outgoing messages of your WebSockets for less network traffic. However, note that the use of compression would obviously add to CPU and RAM loads. In addition, see other concerns - [slow speed and possible memory leaks](https://github.com/websockets/ws/issues/1369) [ws readme](https://github.com/websockets/ws#websocket-compression). I have provided the ``perMessageDeflate`` object for convenience, which is the default from the ws readme. From my investigation, this is enough to get it working. [See here](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#instance_properties) and check on SocioClient.ws.extensions

```ts
import { perMessageDeflate } from 'socio/utils';
const socserv = new SocioServer({ port: 3000, perMessageDeflate }, {...} );
```

### Setup of ``SocioClient``

```ts
//browser code - can be inside just a js script that gets loaded with a script tag or in components of whatever framework.
import {SocioClient} from 'socio/dist/core-client.js'

//instantiate the Socio Client from lib on the expected websocket port and wait for it to connect
//NB! use wss secure socket protocol and use the ./core/Secure class to encrypt these queries in PROD!
const sc = new SocioClient(`ws://localhost:3000`, { verbose: true }) ;//each instance is going to be its own "session" on the server, but you can spawn and destroy these where ever in your code
await sc.ready(); //wait until it has connected as confimed by the server

sc.client_id; //can take a look at its ID, if that interests you idk

console.log((await sc.Query("SELECT 42+69 AS RESULT;"))[0].RESULT);//will imediately send a one-time query to the DB and print the response result

//subscribe to the changes of this query - whenever the table is altered on the backend. And run the callback with the new received data
//this will also run the sql query to get the initial value, then indefinitely receive updates and rerun this callback.
sc.Subscribe({ sql: "SELECT COUNT(*) AS RESULT FROM users;"}, (res) => {
    let ans = res[0].RESULT //res is whatever object your particular DB interface lib returns from a raw query
});

//-----------------more advanced stuff:

//now if we insert new data into the table, the above callback will rerun with the new data as refetched from the DB. Automagical.
const new_user_id = await sc.Query("INSERT INTO users VALUES('Bob', 420) RETURNING id;");

//queries with dynamic data - via params:
await sc.Query("SELECT COUNT(*) AS RESULT FROM users WHERE name = :name;", { name: 'Bob' } ); //it is up to you to sanitize 'Bob' here or hope your DB has injection protection.

//security:
await sc.Query("SELECT COUNT(*) FROM users;--socio"); //postfix a literal '--socio' at the end of your query, which by popular SQL notation should be a line comment and thus shouldnt interfere with the query itself, to mark it as to be encrypted by the SocioSecurity class during code building or bundling. Use the included Vite plugin or make your own way of integrating the class. NB! All strings in your entire frontend code base that end with the --socio marker will be encrypted. The marker also accepts an infinite amount of dash seperated params in any order, e.g. '--socio-perm-auth' to indicate, that this query shouldnt run without the required permissions on tables and that the session must be authenticated. Socio automatically appends a random integer as one of these params, just to randomize the encrypted string from being guessed or deduced.

//you may also want to be safe that the encrypted query can only be executed by "logged in" or authenticated users. Just include another postfix:
await sc.Query("SELECT COUNT(*) FROM users;--socio-auth"); //the backend will only execute this, if the session is marked as authenticated. But how would that come to be? 

//Fear not, after awaiting ready, just send an auth request:
const auth_success = (await sc.Authenticate({username:'Bob', password:'pass123'}))?.result; //success = Promise<{ id: id, result: boolean }>. The params to the request are your free choice. This object will be passed to your auth hook callback, and it is there that you compute the decision yourself. Then you may execute --socio-auth queries. If this socket were to disconnect, you'd have to redo the auth, but that isnt very likely. You can also at any time check the instance sc.authenticated property to see the state. Persistant socio clients will stay authenticated.

//Similar mechanism for table permissions:
const perm_success = (await sc.AskPermission('SELECT', 'Users'))?.result; //The perm is asked and granted per VERB on a TABLE. This will be passed to your grant_perm hook callback, and it is there that you compute the decision yourself. Then you may execute --socio-perm queries. If this socket were to disconnect, you'd have to redo the perm, but that isnt very likely. If you want to later check, if an instance has a perm, then you'd do this same procedure, but the server already knows what perms you have, so its quicker. Persistant socio clients will keep perms.
```

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

### Setup of ``SocioSecurity`` and ``SocioSecurityPlugin``

```ts
//server code
import { SocioServer } from 'socio/dist/core.js'
import type { SocioSession } from 'socio/dist/core-session.js'
import { SocioSecurity } from 'socio/dist/secure';

//vite plugin and this instance must share the same private secret key, so perhaps use .env mechanism
const socsec = new SocioSecurity({ secure_private_key: 'skk#$U#Y$7643GJHKGDHJH#$K#$HLI#H$KBKDBDFKU34534', verbose: true });
const socserv = new SocioServer({ port: ws_port }, { DB_query_function: QueryWrap as QueryFunction, verbose: true, socio_security: socsec });
//by default ecrypts all strings that end with the socio marker, but decryption can be individually turned off for either sql or prop key strings.
```

```ts
//vite.config.ts in a SvelteKit project

import { sveltekit } from '@sveltejs/kit/vite';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs'
import { SocioSecurityPlugin } from 'socio/dist/secure';

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [SocioSecurityPlugin({ secure_private_key: 'skk#$U#Y$7643GJHKGDHJH#$K#$HLI#H$KBKDBDFKU34534', verbose: true }), viteCommonjs(), sveltekit()],
};

export default config;
```
The ``SocioSecurityPlugin`` also takes in an extra options object parameter that the base class doesnt. ``include_file_types`` = ``['js', 'svelte', 'vue', 'jsx', 'ts', 'tsx']`` (default) ; ``exclude_file_types`` = [] (default) ; ``exclude_svelte_server_files`` = true (default)

### Server Props

```ts
//server code
import { SocioServer } from 'socio/dist/core.js'
import type { PropValue } from 'socio/dist/types';
const socserv = new SocioServer(...)

//set up a key "color" to hold an initial value of "#ffffff" and add an optional assigner function instead of the unsafe default.
socserv.RegisterProp('color', '#ffffff', (curr_val:PropValue, new_val:PropValue):boolean => {
  if(typeof new_val != 'string' || new_val.length != 7) return false;
  if (!new_val.match(/^#[0-9a-f]{6}/mi)) return false;
  //...more checks.
  
  //success, so assign
  return socserv.SetPropVal('color', new_val); //assign the prop. Returns truthy, if was set succesfully
})
```

Though usable for realtime web chat applications, i advise against that, because props data traffic is not yet optimized. It sends the entire prop data structure both ways. Instead you should use the SendToClients() function and store the chat messages yourself. A built in solution for this is in the works.

### Generic communication

To ensure extendability, i have created a simple generic communication mechanism. Clients can send any generic serializable object to the server, where Socio will just pass it to a special hook and not do anything else with it. It is then the servers responsibility to answer to the client.

```ts
//browser code
import {SocioClient} from 'socio/dist/core-client.js'
const sc = new SocioClient(`ws://localhost:3000`, { verbose: true })
await sc.ready()

await sc.Serv({some:'data'} || 'string' || ['anthing']) //use the serv() function to serve anything to the backend
```

```ts
//server code
import { SocioServer } from 'socio/dist/core.js'
import type { MessageDataObj } from 'socio/dist/core.js'
import type { SocioSession } from 'socio/dist/core-session.js'
const socserv = new SocioServer(...)

socserv.RegisterLifecycleHookHandler('serv', (client:SocioSession, data:MessageDataObj) => {
  //data has field "id" and "data" that is the literal param to the client-side serv() function

  //respond, bcs the client always awaits some answer
  client.Send('RES', {id:data.id, result:1}) //result is optional
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

### Basic Real-Time Chat Mechanism
WebSockets were pretty much made to solve the issue of chats for the web. As Socio uses WebSockets for a much grander purpose, still I provide a convenient basic setup of chat rooms.

```ts
//server code
import { SocioServer } from 'socio/dist/core.js'
import type { MessageDataObj } from 'socio/dist/core.js'
import type { SocioSession } from 'socio/dist/core-session.js'
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
import {SocioClient, type ClientMessageDataObj} from 'socio/dist/core-client.js'
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
import { SocioServer } from 'socio/dist/core.js'
import type { MessageDataObj } from 'socio/dist/core.js'
import type { SocioSession } from 'socio/dist/core-session.js'
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
import {SocioClient} from 'socio/dist/core-client.js'
const sc = new SocioClient(`ws://localhost:3000`, { verbose: true })
await sc.ready()

sc.Subscribe({ sql: "SELECT COUNT(*) AS RESULT FROM users;"}, (res) => {
    let ans = res[0].RESULT //res is whatever object your particular DB interface lib returns from a raw query
}, {}, {n:5, minutes:1}) //rate limit of 5 per 1 minute UPD receivable. Server wont send upd, if exceedes.

sc.SubscribeProp('color', (c) => {let ans = c}, {n:5, minutes:1}) //rate limit of 5 per 1 minute UPD receivable. Server wont send upd, if exceedes.
```
This again leads to similar problems, but per query.

### Admin socket

Wouldnt it be nice to connect to the backend SocioServer and run instructions on there at runtime? Well you can, but the safety of that is completely in your hands. Opt-in mechanism.

```ts
//some node.js script. The server-admin.js runs only on node, and doesn't inherit from SocioClient, whereas admin-client.js does and runs only on the browser.
import {AdminClient} from 'socio/dist/admin-server.js'

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
import {SocioClient} from 'socio/dist/core-client.js'
const sc = new SocioClient(`ws://localhost:3000`, { 
  verbose: true,
  name: "Main", //Usually doesn't matter, but for persistent = true, this must be identical on the old page socket and new page socket. This is used as a unique key.
  persistent:true //enables a mechanism that upon the new connection to the server, gives the server a special one-time token that gives this connection a previous sessions setup, i.e. auth and perms
});
```

Note that the ``name`` must be set on the old and new instance and they must be identical, so that socio knows which 2 sessions are attempting to reconnect.
After the reconnection attempt, the client asks for a new future use token to be used after the next reload. And so the cycle goes. Tokens are encrypted; stored via the Local Storage API (which is domain scoped); are one-time use, even if that use was faulty; have an expiration ttl (1h default); check change in IP; and other safety meassures.

This is also not needed if your framework implements CSR (client-side routing), whereby the page doesnt actually navigate or reload, but just looks like it does.

This also has better safety than traditional HTTP(S) session cookies. https://en.wikipedia.org/wiki/Session_hijacking