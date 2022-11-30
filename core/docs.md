# Simple Documentation for Socio usage.

## Overview

The ``./core.js`` file contains logic to be run on a backend server. It exports the class ``SessionManager`` that you instantiate and work with mostly during just the setup initialization of your backend. It creates a websocket server on a port and listens for clients to connect. It is the transaction middle-man between your DB and the SocioClient on the frontend doing queries.

The ``./core-client.js`` file contains logic to be run on the frontend browser side of js. It exports the class ``SocioClient`` that you instantiate and work with during the entire lifetime of the page. Use it to make SQL queries to the backend that do some magic to keep your data realtime using WebSocket technology.

The ``./secure.js`` file contains logic to be run on a backend server. It exports the class ``SocioSecurity`` that you instantiate and work with mostly during just the setup initialization of your backend. There is also a Vite plugin (``SocioSecurityPlugin``) that wraps that class, that you can use instead in your Vite app config. Should also work as a Rollup plugin, but havent tested. This securely encrypts the socio SQL query strings before serving the production code to the client, such that the client cannot see nor alter the query string, protecting against SQL attacks and general fuckery. However, it is still up to you to sanitize and protect yourself from SQL injections when inserting dynamic data into a query string! An identical setup of this class should be created on the backend server and handed to the SessionManager instance, for it to be able to decrypt the incoming SQL queries. Use .env files to keep your project secrets safe and consistent!

## Example code snippets

### Setup of ``SessionManager``

```js
import { SessionManager } from 'socio/core.js'

//SessionManager needs a "query" function that it can call to fetch data. This would usually be your preffered ORM lib interface raw query function, but really this function is as simple as input and output, so it can do whatever you want. Like read from a txt file or whatever. It should be async and Socio will always await its response to send back to the client.
//id is a unique auto incrementing index for the query itself that is sent from the client - not really important for you, but perhaps for debugging.
//ses_id is the session identifier, for which one or more clients (with their own ID) may have connected, that you can use to validate the sql access params or whatever. You can also use it to ask Socio for the Session of this client, to do whatever you want with it.
const QueryWrap = async ({ id = 0, ses_id = '', sql = '', params = {} } = {}) => (await sequelize.query(sql, { logging: false, raw: true, replacements: params }))[0]

//The actual instance of the manager on port 3000 using the created query function. Verbose will make it print all incoming and outgoing traffic from all sockets in a pretty printed look :)
const manager = new SessionManager({ port: 3000 }, QueryWrap, {verbose:true} )

//This class has a few public fields that you can alter, as well as useful functions to call later in your program at any time. E.g. set up lifecycle hooks:
console.log(manager.LifecycleHookNames) //get an array of the hooks currently recognized in Socio. Or look them up yourself in the core lib :)
manager.RegisterLifecycleHookHandler("con", (ses, req) => {
    //woohoo a new client connection!
    //ses is the already created instance of Session class, that has useful properties and methods.
})

manager.Emit({data:'literally data.', all:'currently connected clients will receive this object now!'}) //imagine using this to send a new css style sheet to change how a button looks for everyone without them refreshing the page - realtime madness aaaa!
```

### Setup of ``SocioClient``

```js
import {SocioClient} from 'socio/core-client.js'

//instantiate the Socio Client from lib on the expected websocket port and wait for it to connect
//NB! use wss secure socket protocol and use the ./core/Secure class to encrypt these queries in PROD!
const sc = new SocioClient(`ws://localhost:3000`, { verbose: true }) //each instance is going to be its own "session" on the server, but you can spawn and destroy these where ever in your code
await sc.ready() //wait until it has connected as confimed by the server

console.log(sc.client_id) //can take a look at its ID, if that interests you idk

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
await sc.query("SELECT COUNT(*) FROM users;--socio") //postfix a literal '--socio' at the end of your query, which by popular SQL notation should be a line comment and thus shouldnt interfere with the query itself, to mark it as to be encrypted by the SocioSecurity class during code building or bundling. Use the included Vite plugin or make your own way of integrating the class.

//you may also want to be safe that the encrypted query can only be executed by "logged in" or authenticated users. Just include another postfix:
await sc.query("SELECT COUNT(*) FROM users;--socio-auth") //the backend will only execute this, if the session is marked as authenticated. But how would that come to be? 

//Fear not, after awaiting ready, just send an auth request:
const success = sc.authenticate({username:'Bob', password:'pass123'}) //success will be a boolean representing the status of the auth request. The params to the request are your free choice. This object will be passed to your auth hook callback, and it is there that you compute the decision yourself. Then you may execute --socio-auth queries. If this socket were to disconnect, you'd have to redo the auth.
```