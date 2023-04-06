# Socio - A WebSocket Real-Time Communication (RTC) API framework.

## Connecting your Front-End logic to Back-End Database reactively! ⇄

<a href="https://www.youtube.com/watch?v=iJIC9B3cKME&ab_channel=CepuminsLV" target="_blank">3 min - Youtube video demo.</a>

<a href="https://www.youtube.com/watch?v=t8_QBzk5bUk" target="_blank">16 min - Getting started with Socio 0.7, SvelteKit, Vite.</a>

No more API middleware and backend DB interfacing functions and wrappers and handlers. Write your SQL queries on the frontend and have their results be automagically refreshed on all clients when a resource is changed on the server DB. This is secure.

[Basic Demo](https://github.com/Rolands-Laucis/Socio/blob/master/demos/basic/readme.md) - interactive bare-bones demo project.

[Secure Full-Stack Framework Demo](https://github.com/Rolands-Laucis/Socio/tree/master/demos/full-stack_framework#readme) - interactive demo project with SvelteKit and Vite.

[Simple Documentation](https://github.com/Rolands-Laucis/Socio/blob/master/Documentation.md) page to see direct examples and explanations of how to use various parts of the lib.

Ready for use in your small to mid sized web app 🥰 feedback is welcome.

### Instalation
In your Node.js project root dir:
```bash
npm i socio
```

## How? ✨

Socio is a "middle man" framework between your DB and clients. The ``SocioServer`` creates a WebSocket server on your backend, that is hooked up to any DB. The ``SocioClient`` sits on the browser and communicates with your server through WebSockets and socios protocols and mechanisms. E.g. ``SocioClient``.Query() or .Subscribe() with raw SQL strings. Additionally, the server can also at any time push information to clients, creating a duplex real-time connection. Pretty much everything you'd need, including file transfer, is supported.

## SQL injections and overall data safety? 💉

Client-side JS source files contain only encrypted strings of your SQL. The AES-256-GCM algorithm guarantees Confidentiality (cannot be read), Integrity (cannot be altered) and Authenticity (server can verify the author of the created cypher text). Dynamic data inserted as query parameters should be server-side sanitized by you as usual. In addition, all queries can use opt-in markers for authentification and table permissions requirements, that are managed by Socio Server for you.
This is all done with the ``SocioSecurity`` class manually or automagically with the included Vite plugin ``SocioSecurityVitePlugin``.

## Code snippets

Written in TypeScript, but of course can use the lib in JS scripts just the same.

```ts
//TS server side
import { SocioServer } from 'socio/dist/core'; //this way for both JS and TS
import { SocioSecurity } from 'socio/dist/secure'; //this way for both JS and TS
import type { QueryFunction, QueryFuncParams } from 'socio/dist/core';
async function QueryWrap(client: SocioSession, id: id, sql: string, params: object | null | Array<any> = null):Promise<object> {
    //do whatever u need to run the sql on your DB and return its result
    //sanatize dynamic params!
}

const socsec = new SocioSecurity({ secure_private_key: '...', verbose:true }); //for decrypting incoming queries. This same key is used for encrypting the source files when you build and bundle them.
const socserv = new SocioServer({ port: 3000 }, { DB_query_function: QueryWrap as QueryFunction, verbose: true, socio_security: socsec }); //creates localhost:3000 web socket server
```
```ts
//client side browser code. For SvelteKit, this can be in proj_root/src/hooks.server.ts .Check the Framework Demo for an example.
import {SocioClient} from 'socio/dist/core-client' //this way for both JS and TS
const sc = new SocioClient('ws://localhost:3000', {verbose:true, name:'Main'}); //create as many as you like
await sc.ready(); //wait to establish the connection

//will recall the callback whenever the Users table data gets altered
const id = sc.Subscribe({sql:'SELECT * FROM Users;--socio'}, (res:object) => {
    console.log(res);
});

//send a single query and wait for its result
console.log(await sc.Query('INSERT INTO Users (name, num) VALUES(:name, :num);--socio', {name:'bob', num:42})); //sanatize dynamic data yourself in QueryWrap!
sc.Unsubscribe(id); //notify the server.
```
```ts
//vite.config.ts when using SvelteKit.
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SocioSecurityVitePlugin } from 'socio/dist/secure';

export default defineConfig({
	plugins: [
        SocioSecurityVitePlugin({ secure_private_key: 'skk#$U#Y$7643GJHKGDHJH#$K#$HLI#H$KBKDBDFKU34534', verbose: true }), 
        sveltekit()
    ]
});
```

## Does it scale? ⚖️

Currently the performance is neglegable for small projects. I havent stress tested yet, as its still early dev, but i optimize my data structures, where i can as i go. Current estimate is about 100 concurrent users should be a breeze on a cheap Linode server. I expect your backend DB to be set up properly with table indexing and caching queries.

## Sportsmanship 🤝

The use of the Socio lib **does not** prohibit the use of standard HTTP technologies. Even better - socio server can be configured to run on your existing http webserver, like one that you'd create with express.js. Since WebSockets are established over HTTP, then take over with their own protocol. Though, seeing as they are different technologies, there are situations where you'd need to "stitch" your own solutions between the two, e.g. tracking sessions.

## Caveats

For SQL queries, the automagic happens because i regex parse the strings myself with simple patterns. The most basic usecases should be covered, but more complex SQL queries are not - situations like: nested queries and multiple queries in a single string. Only table names are extracted, so sometimes subscriptions would receive an update, even though for its specific WHERE clauses it would logically not have changed data. E.g. if you alter a specific users info on a Users table, all subscribed users would get an update.

You can quite easily mimic HTTP cookie sessions on whatever backend by using SocioServer hooks with SocioSession id's.

I cannot guarantee perfect safety of the query encryption. Neither can traditional HTTP backends. You may use SocioServer hooks to double check the incoming data yourself for your peace of mind.

You should be using WSS:// and HTTPS:// protocols for everything, so that the data is secure over the network. But that's easier said than done.

## Socio in Production
* [Real-time rent prices in Riga, Latvia](http://riga.rolandslaucis.lv/) made by me. SvelteKit, Vite, Socio, NginX, Ubuntu server.

## Related lib and tech 🔗
* [WS](https://www.npmjs.com/package/ws) *Socio uses on the server*
* [The WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) *Socio uses on the browser*
* [https://github.com/ghostebony/sse](https://github.com/ghostebony/sse)
* [Server-sent events API](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
* [Firebase Realtime Database](https://firebase.google.com/docs/database) serverless database. Google backed.
* [PocketBase](https://pocketbase.io/) serverless database.
* [SurrealDB](https://surrealdb.com/) serverless database.
* [RethinkDB](https://rethinkdb.com/) distributed architecture serverless database.
* [WebRTC standard](https://webrtc.org/) another web protocol, but aimed at realtime binary data transmission like audio and video over UDP.
* [gRPC](https://grpc.io/) Google's Remote Procedure Call (RPC, another web protocol) framework, for interconnecting computers over a standardized data format between and inside data center machines and devices.
* [CRDT](https://crdt.tech/) "Conflict-free Replicated Data Type" a data structure that simplifies distributed data storage systems and multi-user applications.
* [Yjs](https://docs.yjs.dev/) a general CRDT implementation for JS to power Live Collaboration webapps like editable documents.
* [RocketRPC](https://github.com/akash-joshi/rocketrpc) an upcoming new project very similar to Socio.
* [tRPC](https://github.com/trpc/trpc) allows you to easily build & consume fully typesafe APIs without schemas or code generation.

## Name:
"Socio.js" comes from the latin verb "socio", which means to link or associate. Since this lib syncs your frontend and backend. Its also a play on words for "WebSockets" and "IO".