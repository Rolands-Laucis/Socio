# Socio - A WebSocket based realtime duplex Front-End and Back-End synced API paradigm framework (under active early development)

## Connecting your Front-End to Back-End DB reactively!

[Youtube video Demo](https://www.youtube.com/watch?v=iJIC9B3cKME&ab_channel=CepuminsLV "Youtube video Demo")

Say goodbye to REST APIs 👋. No more API middleware and DB interfacing functions and wrappers and handlers. Write your SQL queries on the frontend and have their results be automagically refreshed on all clients when a resource is changed on the server DB.

Check [Basic Demo](https://github.com/Rolands-Laucis/Socio/blob/master/demos/basic/readme.md) to try an interactive bare-bones demonstration.

Check [Secure Full-Stack Framework Demo](https://github.com/Rolands-Laucis/Socio/tree/master/demos/full-stack_framework#readme) to try an interactive demonstration on a Svelte-Vite app!

Check the [Simple Documentation](https://github.com/Rolands-Laucis/Socio/blob/master/core/docs.md) page to see direct examples and explinations of how to use various parts of the lib. Might be out of date, but the lib core files arent that big, and they are full of comments, so u can read up on those.

## How?

On the backend instantiate the ``SocioServer`` class and provide it a single DB (of your choice) raw query function, that will receive the SQL string and dynamic parameters object. The raw result of that is passed back to the caller on the client side, where the SQL and params sit - where an instance of ``SocioClient`` has made a .query() call. Using the same mechanism, an automagical subscription to that SQL resource can be registered via the .subscribe() method, that runs your callback function whenever the data this query relies upon has changed on the backend DB for any reason.

## What about SQL injections and overall data safety?

Included is a class for auto securing the SQL via server-side string symetric encryption run at build time using the AES-256-GCM algorithm.
Preventing the client seeing or altering the query string. Dynamic data inserted as query parameters should be sanitized by your DB interface function, since Socio passes the SQL and params to you seperately. Or you can wrap the DB interface function and sanatize them yourself.
In addition, all queries have opt-in flags for authentification and table permissions requirements, that are managed on the backend.
And even a simple Vite plugin that wraps it this functionality for all of your front-end souce code 🥳

## Does it scale?

Currently the performance is neglegable for small projects. I havent stress tested yet, as its still early dev, but i optimize my data structures, where i can as i go. Current estimate is about 100 concurrent users should be a breeze on a cheap Linode server. There are plans for more optimizations for less traffic of signals via caching and dedup queries and ratelimiting, but i also expect your backend DB to be set up properly with table indexing and caching queries.

## Code snippets

Examples given in TS, since the lib is written like that and its more secure, but ofc can use the lib in JS scripts just the same.

```ts
//TS server side
import { SocioServer } from 'socio/core';
import { SocioSecurity } from 'socio/secure';
import type { QueryFunction, QueryFuncParams } from 'socio/core';
function QueryWrap({ id = undefined, sql = '', params = undefined }:QueryFuncParams = { sql: '' }){
    //do whatever u need to run the sql on your DB and return its result
}

const socsec = new SocioSecurity({ secure_private_key: '...', verbose:true }); //for decrypting incoming queries
const socserv = new SocioServer({ port: 3000 }, QueryWrap as QueryFunction, { verbose: true, socio_security: socsec }); //creates localhost:3000 web socket server
```

```ts
//client side browser code
import {SocioClient} from 'socio/core-client'
const sc = new SocioClient('ws://localhost:3000', {verbose:true, name:'Main'});
await sc.ready();

const id = sc.subscribe({sql:'SELECT * FROM Users;--socio'}, (res) => {
    console.log(res);
})

console.log(await sc.query('INSERT INTO Users (name, num) VALUES(:name, :num);--socio', {name:'bob', num:42})); //sanatize dynamic data yourself!
sc.unsubscribe(id);
```

# Caveats
For SQL queries the automagic happens because i regex parse the strings myself with simple patterns. The most basic usecases should be covered, but more complex SQL queries are not. Situations like: nested queries; multiple queries in a single string. Only table names are extracted, so sometimes subscriptions would receive an update, even though for its specific WHERE clauses it would logically not have changed data. E.g. if you alter a specific users info on a Users table, all subscribed users would get an update. I am planning to fix these, but there are no great solutions.

Currently everything is single threaded, but i do make good use of async Promise patterns to not block the event loop. If you are mad enough like me to use Socio in production, you should use a load balancer. Otherwise one good multi-core CPU should be fine for small projects.

HTTP has well established session patterns using cookies. WebSockets do not. They are identified only by the TCP pipes id's, which i keep track of. You can quite easily mimic cookie sessions on whatever backend by using SocioServer hooks.

I cannot guarantee perfect safety of the query encryption and thus that clients could not destroy your data. Neither can anyone, though. And neither can traditional HTTP backends. Every year new scientific papers come out breaking previously thought "unbreakable, future-proof" cryptographic algorithms. You may use SocioServer hooks to double check the incoming data yourself for your peace of mind.

The SocioSecurity Vite plugin searches many types of frontend script file extensions and will encrypt any string that ends with --socio[-args].

## TODOs 📝
* Keyed SQL queries
* Better SQL dependency distinguisher on queries
* Threading paralization pipelines for async querry queues (perhaps offloading queries to another machine)
* Caching and dedup UPD msg kind
* File and blob sending and replacing on the client side
* Redo the update dependency mechanism to serious data structures - dependency graph or tree or smth
* Different solution for sql parsing. Perhaps the 40MB js lib... (but that seems insane to me)
* Special Admin connection with privileges.
* plenty more

#### Dont be shy to try this out on your small project. Feedback from real world use cases is much appreciated 🥰

## Related lib and tech
* [https://github.com/ghostebony/sse](https://github.com/ghostebony/sse)
* [Server-sent events API](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
* [The WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) *Socio uses on the browser*
* [Firebase Realtime Database](https://firebase.google.com/docs/database) Google backed.
* [PocketBase](https://pocketbase.io/) Firebase alternative written in GO.
* [RethinkDB](https://rethinkdb.com/) Distributed architecture.
* [WebRTC standard](https://webrtc.org/) another web protocol, but aimed at realtime binary data transmission like audio and video.
* [gRPC](https://grpc.io/) Google's Remote Procedure Call (RPC, another web protocol) framework, for interconnecting computers over a standardized data format between and inside data center machines and devices.

## Name:
"Socio.js" comes from the latin verb "socio", which means to link or associate. Since this lib syncs your frontend and backend. Its also a play on words for "WebSockets" and "IO".

I also have no idea how to describe this lib with technical terms, so let me know if you know :) also before starting this lib, i researched for something similar, but didnt find anything that does exactly this. Let me know if you are aware of a similar lib and i will include a link to it here!
