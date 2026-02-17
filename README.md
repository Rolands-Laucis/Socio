[![npm downloads](https://img.shields.io/npm/dw/socio)](https://www.npmjs.com/package/socio)
[![npm version](https://img.shields.io/npm/v/socio)](https://www.npmjs.com/package/socio)
![license](https://img.shields.io/npm/l/socio)
![TS](https://img.shields.io/badge/types-TypeScript-blue)
![stars](https://img.shields.io/github/stars/Rolands-Laucis/Socio)

<p align="center"><a href="https://www.npmjs.com/package/socio" target="_blank" rel="noopener noreferrer"><img height="100" src="https://github.com/Rolands-Laucis/Socio/blob/main/SocioLogo.webp" alt="Socio logo"></a></p>

# Socio - A WebSocket Real-Time Communication (RTC) API framework. Realtime Front-end, Back-end reactivity.

* <a href="https://youtu.be/pu78XwY25O4" target="_blank">Socio in 100 Seconds</a>
* <a href="https://www.youtube.com/watch?v=t8_QBzk5bUk" target="_blank">16 min video - Getting started with Socio 0.7, SvelteKit, Vite</a>

---

* [Interactive Basic Demo project](https://github.com/Rolands-Laucis/Socio/blob/main/demos/basic/readme.md) in Vanilla JS.
* [Interactive Secure Full-Stack Framework Demo project](https://github.com/Rolands-Laucis/Socio/tree/main/demos/full-stack_framework#readme) with SvelteKit and Vite.
* [Simple Documentation](https://github.com/Rolands-Laucis/Socio/blob/main/Documentation.md)

---
This lets you write SQL in your frontend code, that automagically refreshes on all clients when a resource is changed on any (optionally) connected DB. Additionally, create any generic JS variables on your server to be realtime synced across all clients using "Server Props".

Agnostic of framework, build tool, server lib and SQL database. Requires Node.js >= 16 LTS.

### Instalation 🔧
In your project root dir:
```bash
npm i socio
```
Contains compiled JS files + TS type definition files.

## How? ✨

Socio is a "middle man" framework between your DB and browser clients. The ``SocioServer`` creates a WebSocket server on your backend, that can optionally be hooked up to any DB. The ``SocioClient`` sits on the browser (or backend with Deno) and communicates with your server through socios protocols and mechanisms. E.g. ``SocioClient.Query()`` or ``.Subscribe()`` with SQL strings and/or ``.SetProp()`` and ``.SubscribeProp()`` for generic data. Additionally, the server can also at any time push any data to any client(s), creating duplex real-time connections. Pretty much everything you'd need, including file transfer, is supported.

## SQL injections and overall data safety? 💉

When using SQL, client-side JS source files contain only encrypted strings of your SQL. The used AES-256-GCM algorithm guarantees Confidentiality (cannot be read), Integrity (cannot be altered) and Authenticity (server can verify the author of the created cypher text). Dynamic data inserted as query parameters should be server-side sanitized by you as usual. In addition, all queries can use opt-in markers for authentification and table permissions requirements, that are managed by Socio Server for you.
The encryption preproc step is done with the ``SocioSecurity`` class manually or automagically with the included Vite plugin ``SocioSecurityVitePlugin``.

## Code snippets 📜
### Backend:
```ts
//TS server side. For SvelteKit, this can be in proj_root/src/hooks.server.ts . Check the Framework Demo for an example.
import { SocioServer } from 'socio/dist/core-server'; //Might need to put .js at the end.
import { SocioSecurity } from 'socio/dist/secure';
async function QueryWrap(client: SocioSession, id: id, sql: string, params: any):Promise<object> {
    //do whatever u need to run the sql on your DB and return its result. E.g. sequelize.query()
    //Or any other way you want to retrieve data, like reading a local txt etc.
    //sanatize dynamic params!
}

const socsec = new SocioSecurity({ secure_private_key: '...', logging:{verbose:true} }); //for decrypting incoming queries. This same key is used for encrypting the source files when you build and bundle them. Has to be the same in the Vite plugin.
const socserv = new SocioServer({ port: 3000 }, { db:{Query:QueryWrap}, socio_security: socsec, logging:{verbose:true} }); //creates localhost:3000 web socket server
```
### Frontend:
```ts
//client side browser code.
import { SocioClient } from 'socio/dist/core-client'; //Might need to put .js at the end.
import { socio } from 'socio/dist/utils';
const sc = new SocioClient({ url: `ws://localhost:3000`, logging: {verbose:true} }); //or sc.Connect({url:'ws://localhost:3000'}) called later. Create as many as you like.
await sc.ready(); //wait to establish the connection

//will recall the callback whenever the Users table is altered. Can also unsubscribe.
const sub_id = sc.Subscribe({sql:socio`SELECT * FROM Users;`}, (res:object) => {...});
```

```ts
//send a single query and wait for its result:
await sc.Query(socio`INSERT INTO Users (name, num) VALUES(:name, :num);`, {name:'bob', num:42}); //sanatize dynamic data yourself in QueryWrap on the server!
```

```ts
//work with general server side data - "props":
const my_obj = await sc.Prop('my_obj') as {num:0}; //in this case the prop must be a js object registered on the server
if(my_obj?.num === 0) my_obj.num += 1; // use it like a regular js obj, but its value is always synced across clients and server (magic!):
my_obj.num--; my_obj['num'] = 0; //etc.
```

```ts
// or have manual control over any js datatype as a prop:
let color = await sc.GetProp('color') as string; //the prop needs first to be created on the server and can be any json serializable object (including Map and Set)
sc.SubscribeProp('color', (c:string) => color = c); //can be unsubscribed
const res = await sc.SetProp('color', '#ffffff'); //this will rerun ^ the sub, if/when the server has set it, so no need to double your code everywhere!
```

## Does it scale? ⚖️

Currently the performance is neglegable for small projects. I havent stress tested yet, but I optimize my data structures and procedures. Current estimate is about 100 concurrent users should be a breeze on a cheap Linode server. I expect your backend DB to be set up properly with table indexing and caching.

[According to this blog](https://medium.com/nativeai/websocket-vs-http-for-collecting-events-for-web-analytics-c45507bd7949) WebSockets are much more network traffic efficient than HTTP at scale.

Socio uses [@msgpack/msgpack](https://www.npmjs.com/package/@msgpack/msgpack) for efficient binary serialization of messages over the network 🔥

## Sportsmanship 🤝
The use of the Socio lib **does not** prohibit the use of standard HTTP technologies. Even better - socio server can be configured to run on your existing http webserver, like one that you'd create with express.js. Since WebSockets are established over HTTP, then take over with their own protocol. Though, seeing as they are different technologies, there are situations where you'd need to "stitch" your own solutions between the two, e.g. tracking sessions.

## Caveats 🚩
I cannot guarantee perfect safety of the query encryption. Neither can anything. You may use SocioServer hooks to double check the incoming data yourself for your peace of mind. However, I can guarantee this is safer than HTTP cookie based sessions (search "cookie spoofing").

You should be using WSS:// and HTTPS:// protocols for everything, so that the data is secure over the network. That's up to you and your server configuration. Search "Let's encrypt, certbot, nginx, SSL".

<!-- ## Socio in Production 🥳
* [Real-time rent prices in Riga, Latvia](http://riga.rolandslaucis.lv/) made by me. SvelteKit, Vite, Socio, NginX, Ubuntu server. -->

## Related lib and tech 🔗
* [WS](https://www.npmjs.com/package/ws) *Socio uses on the server*
* [The WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) *Socio uses on the browser*
* [NATS](https://nats.io/) This has recently come to my attention. Together with the [Node.js](https://github.com/nats-io/nats.js) implementation of it and [Nats.ws](https://github.com/nats-io/nats.ws) lib for running it on a browser, this technology seems to me like the future. If not Socio, you should use this imo.
* [Server-sent events API](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
* [Firebase Realtime Database](https://firebase.google.com/docs/database) serverless database. Google backed.
* [PocketBase](https://pocketbase.io/) serverless database.
* [SurrealDB](https://surrealdb.com/) serverless database.
* [RethinkDB](https://rethinkdb.com/) distributed architecture serverless database.
* [SpacetimeDB](https://github.com/clockworklabs/SpacetimeDB) realtime DB and web-server.
* [WebRTC standard](https://webrtc.org/) another web protocol, but aimed at realtime binary data transmission like audio and video over UDP.
* [gRPC](https://grpc.io/) Google's Remote Procedure Call (RPC, another web protocol) framework, for interconnecting computers over a standardized data format between and inside data center machines and devices.
* [CRDT](https://crdt.tech/) "Conflict-free Replicated Data Type" a data structure that simplifies distributed data storage systems and multi-user applications.
* [Yjs](https://docs.yjs.dev/) a general CRDT implementation for JS to power Live Collaboration webapps like editable documents.
* [RocketRPC](https://github.com/akash-joshi/rocketrpc) an upcoming new project very similar to Socio.
* [tRPC](https://github.com/trpc/trpc) allows you to easily build & consume fully typesafe APIs without schemas or code generation.

## Name:
"Socio.js" comes from the latin verb "socio", which means to link or associate. Since this lib syncs your frontend and backend. Its also a play on words for "WebSockets" and "IO".
