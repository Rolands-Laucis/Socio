# Socio.js - WebSocket live/reactive API paradigm with Client-Side SQL queries. (under active early development)

## Connecting your Front-End to Back-End DB reactively!

Say goodbye to REST APIs 👋. No more API middleware and DB interfacing functions and wrappers and handlers. Write your SQL queries on the frontend and have their results be automagically refreshed on all clients when a resource is changed on the server DB.

Check [Basic Demo](https://github.com/Rolands-Laucis/Socio.js/blob/master/demos/basic/readme.md) to try an interactive bare-bones demonstration.

Check [Secure Framework Demo](https://github.com/Rolands-Laucis/Socio.js/blob/master/demos/framework/README.md) to try an interactive demonstration on a Svelte-Vite app!

Check the [Simple Documentation](https://github.com/Rolands-Laucis/Socio.js/blob/master/core/README.md) page to see direct examples and explinations of how to use various parts of the lib. Might be out of date, but the lib core files arent that big, and they are full of comments, so u can read up on those.

## How?

On the backend instantiate the ``SocioServer`` class and provide it a single DB (of your choice) raw query function, that will receive the SQL string and dynamic parameters object. The raw result of that is passed back to the caller on the client side, where the SQL and params sit - where an instance of ``SocioClient`` has made a .query() call. Using the same mechanism, an automagical subscription to that SQL resource can be registered via the .subscribe() method, that runs your callback function whenever the data this query relies upon has changed on the backend DB for any reason.

## What about SQL injections and overall data safety?

Included is a class for auto securing the SQL via server-side string symetric encryption run at build time.
Preventing the client seeing or altering the query string. Dynamic data inserted as query parameters should be sanitized by your DB interface function, since Socio passes the SQL and params to you seperately. Or you can wrap the DB interface function and sanatize them yourself.
In addition, all queries have opt-in flags for authentification and table permissions requirements, that are managed on the backend.
And even a simple Vite plugin that wraps it this functionality for all of your front-end souce code 🥳

## Does it scale?

Currently the performance is neglegable for small projects. I havent stress tested yet, as its still early dev, but i optimize my data structures, where i can as i go. Current estimate is about 100 concurrent users should be a breeze on a cheap Linode server. There are plans for more optimizations for less traffic of signals via caching and dedup queries and ratelimiting, but i also expect your backend DB to be set up properly with table indexing and caching queries.

## TODOs 📝
* Keyed SQL queries
* Better SQL dependency distinguisher on queries
* Rate-limit decorators
* Server Props
* Threading paralization pipelines for async querry queues (perhaps offloading queries to another machine)
* Caching and dedup UPD msg kind
* File and blob sending and replacing on the client side
* plenty more

#### Dont be shy to try this out on your small project. Feedback from real world use cases is much appreciated 🥰

## Related lib and tech
* [https://github.com/ghostebony/sse](https://github.com/ghostebony/sse)
* [Server-sent events API](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
* [The WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) *Socio uses on the browser*

## Name:
"Socio.js" comes from the latin verb "socio", which means to link or associate. Since this lib syncs your frontend and backend. Its also a play on words for "WebSockets" and "IO".

I also have no idea how to describe this lib with technical terms, so let me know if you know :) also before starting this lib, i researched for something similar, but didnt find anything that does exactly this. Let me know if you are aware of a similar lib and i will include a link to it here!
