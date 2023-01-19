# Simple Documentation for Socio usage.
##### Those that know, do. Those that understand, teach. /Aristotle/

## Overview

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
import { SocioServer } from 'socio/core.js'
import type { SocioSession } from 'socio/core-session.js'
import type { IncomingMessage } from 'http'
import type { QueryFunction } from 'socio/core';

//SocioServer needs a "query" function that it can call to fetch data. This would usually be your preffered ORM lib interface raw query function, but really this function is as simple as input and output, so it can do whatever you want. Like read from a txt file or whatever. It should be async and Socio will always await its response to send back to the client.
//id is a unique auto incrementing index for the query itself that is sent from the client - not really important for you, but perhaps for debugging.
const QueryWrap = async ({ id = 0, sql = '', params = {} } = {}) => (await sequelize.query(sql, { logging: false, raw: true, replacements: params }))[0]

//The actual instance of the manager on port 3000 using the created query function. Verbose will make it print all incoming and outgoing traffic from all sockets in a pretty printed look :)
const socserv = new SocioServer({ port: 3000 }, QueryWrap as QueryFunction, {verbose:true} )

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
import {SocioClient} from 'socio/core-client.js'

//instantiate the Socio Client from lib on the expected websocket port and wait for it to connect
//NB! use wss secure socket protocol and use the ./core/Secure class to encrypt these queries in PROD!
const sc = new SocioClient(`ws://localhost:3000`, { verbose: true }) //each instance is going to be its own "session" on the server, but you can spawn and destroy these where ever in your code
await sc.ready() //wait until it has connected as confimed by the server

sc.client_id //can take a look at its ID, if that interests you idk

console.log((await sc.query("SELECT 42+69 AS RESULT;"))[0].RESULT)//will imediately send a one-time query to the DB and print the response result

//subscribe to the changes of this query - whenever the table is altered on the backend. And run the callback with the new received data
//this will also run the sql query to get the initial value, then indefinitely receive updates and rerun this callback.
sc.subscribe({ sql: "SELECT COUNT(*) AS RESULT FROM users;"}, (res) => {
    let ans = res[0].RESULT //res is whatever object your particular DB interface lib returns from a raw query
})

//now if we insert new data into the table, the above callback will rerun with the new data as refetched from the DB. Automagical.
await sc.query("INSERT INTO users VALUES('Bob', 420);")

//queries with dynamic data - via params:
await sc.query("SELECT COUNT(*) AS RESULT FROM users WHERE name = :name;", params: { name: 'Bob' } ) //it is up to you to sanitize 'Bob' here or hope your DB has injection protection.

//security:
await sc.query("SELECT COUNT(*) FROM users;--socio") //postfix a literal '--socio' at the end of your query, which by popular SQL notation should be a line comment and thus shouldnt interfere with the query itself, to mark it as to be encrypted by the SocioSecurity class during code building or bundling. Use the included Vite plugin or make your own way of integrating the class. NB! All strings in your entire frontend code base that end with the --socio marker will be encrypted. The marker also accepts an infinite amount of dash seperated params in any order, e.g. '--socio-perm-auth' to indicate, that this query shouldnt run without the required permissions on tables and that the session must be authenticated. Socio automatically appends a random integer as one of these params, just to randomize the encrypted string from being guessed or deduced.

//you may also want to be safe that the encrypted query can only be executed by "logged in" or authenticated users. Just include another postfix:
await sc.query("SELECT COUNT(*) FROM users;--socio-auth") //the backend will only execute this, if the session is marked as authenticated. But how would that come to be? 

//Fear not, after awaiting ready, just send an auth request:
const success = sc.authenticate({username:'Bob', password:'pass123'}) //success will be a boolean representing the status of the auth request. The params to the request are your free choice. This object will be passed to your auth hook callback, and it is there that you compute the decision yourself. Then you may execute --socio-auth queries. If this socket were to disconnect, you'd have to redo the auth, but that isnt very likely.


```

### Setup of ``SocioSecurity`` and ``SocioSecurityPlugin``

```ts
//server code - can be in express or SvelteKit's hooks.server.ts/js file or whatever way you have of running server side code once.
import { SocioServer } from 'socio/core.js'
import type { SocioSession } from 'socio/core-session.js'
import { SocioSecurity } from 'socio/secure';

//vite plugin and this instance must share the same private secret key, so perhaps use .env mechanism
const socsec = new SocioSecurity({ secure_private_key: 'skk#$U#Y$7643GJHKGDHJH#$K#$HLI#H$KBKDBDFKU34534', verbose: true });
const socserv = new SocioServer({ port: ws_port }, QueryWrap as QueryFunction, { verbose: true, socio_security: socsec });
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

### Server Props

```ts
//server code
import { SocioServer } from 'socio/core.js'
import type { PropValue } from 'socio/types';
const socserv = new SocioServer(...)

//set up a key "color" to hold an initial value of "#ffffff" and add an optional assigner function instead of the unsafe default.
socserv.RegisterProp('color', '#ffffff', (curr_val:PropValue, new_val:PropValue):boolean => {
  if(typeof new_val != 'string' || new_val.length != 7) return false;
  if (!new_val.match(/^#[0-9a-f]{6}/mi)) return false;
  //...more checks.
  
  //success, so assign
  curr_val = new_val; //assign any way you want, even just changing nested objects instead of the whole thing
  return true; //tell socio that everything went well
})
```

Though usable for realtime web chat applications, i advise against that, because props data traffic is not yet optimized. It sends the entire prop data structure both ways. Instead you should use the Emit() function on clients and store the chat messages yourself.

### Generic communication

To ensure extendability, i have created a simple generic communication mechanism. Clients can send any generic serializable object to the server, where Socio will just pass it to a special hook and not do anything else with it. It is then the servers responsibility to answer to the client.

```ts
//browser code - can be inside just a js script that gets loaded with a script tag or in components of whatever framework.
import {SocioClient} from 'socio/core-client.js'
const sc = new SocioClient(`ws://localhost:3000`, { verbose: true })
await sc.ready()

await sc.serv({some:'data'} || 'string' || ['anthing']) //use the serv() function to serve anything to the backend
```

```ts
//server code
import { SocioServer } from 'socio/core.js'
import type { MessageDataObj } from 'socio/core.js'
import type { SocioSession } from 'socio/core-session.js'
const socserv = new SocioServer(...)

socserv.LifecycleHookNames; //all the hook names for convenience
socserv.RegisterLifecycleHookHandler('serv', (ses:SocioSession, data:MessageDataObj) => {
  //data has field "id" and "data" that is the literal param to the client-side serv() function

  //respond, bcs the client always awaits some answer
  ses.Send('RES', {id:data.id, result:1}) //result is optional
})
```

Though the server can also intercept any msg that comes in from all clients via the 'msg' hook.

### Rate-limiting

Sometimes you might expect a lot of connections and each to have a lot of different queries firing often. To save the server from bombardment, HTTP webservers have well established rate-limiting mechanisms. Unfortunately, i am not aware of similar solutions for WebSockets, so i invent my own, which have a lot of downsides. However, they are super efficient and performant currently.

```ts
//server code
import { SocioServer } from 'socio/core.js'
import type { MessageDataObj } from 'socio/core.js'
import type { SocioSession } from 'socio/core-session.js'
const socserv = new SocioServer(...)

socserv.RateLimitNames; //all the hook names for convenience

//register a global rate-limit for the server instance for the internal Update() function, that notifies all cliends of new data.
//allows 10 calls per 1 second. Overflowing the limit will simply dead-stop the Update() function execution at the start. Clients dont get notified, since that would go against the point of limiting traffic.
socserv.RegisterRateLimit('upd', {n:10, seconds:1}) //either ms, seconds, minutes
```

Caution! This approach will inevitably lead to bad UX for your application. Rate-limiting by nature desyncs state between client and server. This leads to seeing and acting on outdated data, slow action feedback times and other problems. Rate-limiting should only be used when your server performance is more valuable than UX or the rate-limits are set so high, that only malicious users would run into them.

You may also add ratelimits to individual subscriptions on the front-end.
```ts
//browser code - can be inside just a js script that gets loaded with a script tag or in components of whatever framework.
import {SocioClient} from 'socio/core-client.js'
const sc = new SocioClient(`ws://localhost:3000`, { verbose: true })
await sc.ready()

sc.subscribe({ sql: "SELECT COUNT(*) AS RESULT FROM users;"}, (res) => {
    let ans = res[0].RESULT //res is whatever object your particular DB interface lib returns from a raw query
}, {}, {n:5, minutes:1}) //rate limit of 5 per 1 minute UPD receivable. Server wont send upd, if exceedes.

sc.subscribeProp('color', (c) => {let ans = c}, {n:5, minutes:1}) //rate limit of 5 per 1 minute UPD receivable. Server wont send upd, if exceedes.
```
This again leads to similar problems, but per query.