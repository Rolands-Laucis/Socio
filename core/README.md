# Socio.js - WebSocket live/reactive API paradigm with Client-Side SQL queries. (under active early development)

## Connecting frontend to backend DB reactively!

Say goodbye to REST APIs 👋. No more API middleware and DB interfacing functions and wrappers and handlers. Write your SQL queries on the frontend and have their results be automagically refreshed on all clients when a resource is changed on the server DB.

Check [Basic Demo](https://github.com/Rolands-Laucis/Socio.js/blob/master/demos/basic/readme.md) to try an interactive bare-bones demonstration.

Check [Secure Framework Demo](https://github.com/Rolands-Laucis/Socio.js/blob/master/demos/framework/README.md) to try an interactive demonstration on a Svelte-Vite app!

Check the [Simple Documentation](https://github.com/Rolands-Laucis/Socio.js/blob/master/core/README.md) page to see direct examples and explinations of how to use various parts of the lib. Might be out of date, but the lib core files arent that big, and they are full of comments, so u can read up on those.

Comes with a class for auto securing the SQL, so no worries about injections. And even a simple Vite plugin that wraps it 🥳

## TODOs 📝
* Keyed SQL queries
* Better SQL dependency distinguisher on queries
* Typescript migration
* Rate-limit query updates
* Threading paralization pipelines for async querry queues
* Data loading and success or fail states
* Caching and dedup UPD msg kind
* File and blob sending and replacing on the client side
* plenty more

### Dont be shy to try this out on your small project. Feedback from real world use cases is much appreciated 🥰

## Name:
"Socio.js" comes from the latin verb "socio", which means to link or associate. Since this lib syncs your frontend and backend. Its also a play on words for "WebSockets" and "IO".

I also have no idea how to describe this lib with technical terms, so let me know if you know :) also before starting this lib, i researched for something similar, but didnt find anything that does exactly this. Let me know if you are aware of a similar lib and i will include a link to it here!
