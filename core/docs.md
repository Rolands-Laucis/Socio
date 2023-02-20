# Simple Documentation for Socio usage.
##### Those that know, do. Those that understand, teach. /Aristotle/

### Overview

The ``./core.js`` file contains logic to be run on a backend server. It exports the class ``SocioServer`` that you instantiate and work with mostly during just the setup initialization of your backend. It creates a websocket server on a port and listens for clients to connect. It is the transaction middle-man between your DB and the SocioClient on the frontend doing queries.

The ``./core-client.js`` file contains logic to be run on the frontend browser side of js. It exports the class ``SocioClient`` that you instantiate and work with during the entire lifetime of the page. Use it to make SQL queries to the backend that do some magic to keep your data realtime using WebSocket technology.

The ``./secure.js`` file contains logic to be run on a backend server. It exports the class ``SocioSecurity`` that you instantiate and work with mostly during just the setup initialization of your backend. There is also a Vite plugin (``SocioSecurityPlugin``) that wraps that class, that you can use instead in your Vite app config. Should also work as a Rollup plugin, but havent tested. This securely encrypts the socio SQL query strings before serving the production code to the client, such that the client cannot see nor alter the query string, protecting against SQL attacks and general fuckery. However, it is still up to you to sanitize and protect yourself from SQL injections when inserting dynamic data into a query string! An identical setup of this class should be created on the backend server and handed to the SocioServer instance, for it to be able to decrypt the incoming SQL queries. Use .env files to keep your project secrets safe and consistent!

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

//SocioServer needs a "query" function that it can call to fetch data. This would usually be your preffered ORM lib interface raw query function, but really this function is as simple as input and output, so it can do whatever you want. Like read from a txt file or whatever. It should be async and Socio will always await its response to send back to the client.
//id is a unique auto incrementing index for the query itself that is sent from the client - not really important for you, but perhaps for debugging.
const QueryWrap = async ({ id = 0, sql = '', params = {} } = {}) => (await sequelize.query(sql, { logging: false, raw: true, replacements: params }))[0]

//The actual instance of the manager on port 3000 using the created query function. Verbose will make it print all incoming and outgoing traffic from all sockets in a pretty printed look :)
const socserv = new SocioServer({ port: 3000 }, {DB_query_function: QueryWrap as QueryFunction, verbose:true} )

//This class has a few public fields that you can alter, as well as useful functions to call later in your program at any time. E.g. set up lifecycle hooks:
manager.LifecycleHookNames //get an array of the hooks currently recognized in Socio. Or look them up yourself in the core lib :)
socserv.RegisterLifecycleHookHandler("con", (ses:SocioSession, req:IncomingMessage) => {
    //woohoo a new client connection!
    //ses is the already created instance of Session class, that has useful properties and methods.
})

//currently N/A, bcs found bug in it. More important features right now. But similar stuff can be done with Server Props right now!
socserv.Emit({data:'literally data.', all:'currently connected clients will receive this object now!'}) //imagine using this to send a new css style sheet to change how a button looks for everyone without them refreshing the page - realtime madness aaaa!
```

### Setup of ``SocioClient``

```ts
//browser code - can be inside just a js script that gets loaded with a script tag or in components of whatever framework.
import {SocioClient} from 'socio/dist/core-client.js'

//instantiate the Socio Client from lib on the expected websocket port and wait for it to connect
//NB! use wss secure socket protocol and use the ./core/Secure class to encrypt these queries in PROD!
const sc = new SocioClient(`ws://localhost:3000`, { verbose: true }) ;//each instance is going to be its own "session" on the server, but you can spawn and destroy these where ever in your code
await sc.ready(); //wait until it has connected as confimed by the server

sc.client_id //can take a look at its ID, if that interests you idk

console.log((await sc.query("SELECT 42+69 AS RESULT;"))[0].RESULT);//will imediately send a one-time query to the DB and print the response result

//subscribe to the changes of this query - whenever the table is altered on the backend. And run the callback with the new received data
//this will also run the sql query to get the initial value, then indefinitely receive updates and rerun this callback.
sc.subscribe({ sql: "SELECT COUNT(*) AS RESULT FROM users;"}, (res) => {
    let ans = res[0].RESULT //res is whatever object your particular DB interface lib returns from a raw query
});

//-----------------more advanced stuff:

//now if we insert new data into the table, the above callback will rerun with the new data as refetched from the DB. Automagical.
const new_user_id = await sc.query("INSERT INTO users VALUES('Bob', 420) RETURNING id;");

//queries with dynamic data - via params:
await sc.query("SELECT COUNT(*) AS RESULT FROM users WHERE name = :name;", params: { name: 'Bob' } ); //it is up to you to sanitize 'Bob' here or hope your DB has injection protection.

//security:
await sc.query("SELECT COUNT(*) FROM users;--socio"); //postfix a literal '--socio' at the end of your query, which by popular SQL notation should be a line comment and thus shouldnt interfere with the query itself, to mark it as to be encrypted by the SocioSecurity class during code building or bundling. Use the included Vite plugin or make your own way of integrating the class. NB! All strings in your entire frontend code base that end with the --socio marker will be encrypted. The marker also accepts an infinite amount of dash seperated params in any order, e.g. '--socio-perm-auth' to indicate, that this query shouldnt run without the required permissions on tables and that the session must be authenticated. Socio automatically appends a random integer as one of these params, just to randomize the encrypted string from being guessed or deduced.

//you may also want to be safe that the encrypted query can only be executed by "logged in" or authenticated users. Just include another postfix:
await sc.query("SELECT COUNT(*) FROM users;--socio-auth"); //the backend will only execute this, if the session is marked as authenticated. But how would that come to be? 

//Fear not, after awaiting ready, just send an auth request:
const auth_success = (await sc.authenticate({username:'Bob', password:'pass123'}))?.result; //success = Promise<{ id: id, result: boolean }>. The params to the request are your free choice. This object will be passed to your auth hook callback, and it is there that you compute the decision yourself. Then you may execute --socio-auth queries. If this socket were to disconnect, you'd have to redo the auth, but that isnt very likely. You can also at any time check the instance sc.authenticated property to see the state.

//Similar mechanism for table permissions:
const perm_success = (await sc.askPermission('SELECT', 'Users'))?.result; //The perm is asked and granted per VERB on a TABLE. This will be passed to your grant_perm hook callback, and it is there that you compute the decision yourself. Then you may execute --socio-perm queries. If this socket were to disconnect, you'd have to redo the perm, but that isnt very likely. If you want to later check, if an instance has a perm, then you'd do this same procedure, but the server already knows what perms you have, so its quicker.
```

#### Sending Files/
```ts
//browser code
//setup is the same as above until sc.ready()
const file_input_element = document.getElementByID('my-file-input'); //or any other way you'd normaly get the chosen files, like the onchange event etc.
const success = (await sc.SendFiles(file_input_element.files, {any:'other data here in this object'}))?.result; //important that the passed files are all of class File, which extends Blob.
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
import { SocioSecurityPlugin } from 'socio/dist/dist/secure';

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [SocioSecurityPlugin({ secure_private_key: 'skk#$U#Y$7643GJHKGDHJH#$K#$HLI#H$KBKDBDFKU34534', verbose: true }), viteCommonjs(), sveltekit()],
};

export default config;
```

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

await sc.serv({some:'data'} || 'string' || ['anthing']) //use the serv() function to serve anything to the backend
```

```ts
//server code
import { SocioServer } from 'socio/dist/core.js'
import type { MessageDataObj } from 'socio/dist/core.js'
import type { SocioSession } from 'socio/dist/core-session.js'
const socserv = new SocioServer(...)

socserv.LifecycleHookNames; //all the hook names for convenience
socserv.RegisterLifecycleHookHandler('serv', (ses:SocioSession, data:MessageDataObj) => {
  //data has field "id" and "data" that is the literal param to the client-side serv() function

  //respond, bcs the client always awaits some answer
  ses.Send('RES', {id:data.id, result:1}) //result is optional
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

sc.subscribe({ sql: "SELECT COUNT(*) AS RESULT FROM users;"}, (res) => {
    let ans = res[0].RESULT //res is whatever object your particular DB interface lib returns from a raw query
}, {}, {n:5, minutes:1}) //rate limit of 5 per 1 minute UPD receivable. Server wont send upd, if exceedes.

sc.subscribeProp('color', (c) => {let ans = c}, {n:5, minutes:1}) //rate limit of 5 per 1 minute UPD receivable. Server wont send upd, if exceedes.
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

### Client page navigation persistance (reconnect/keep alive)

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