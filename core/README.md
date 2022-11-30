# Socio.js - WebSocket live/reactive API paradigm with Client-Side SQL queries. (under active early development)

## Connecting frontend to backend DB reactively!

Say goodbye to REST APIs. No more API middleware and DB interfacing functions and wrappers and handlers. Write your SQL queries on the frontend and have their results be automagically refreshed on all clients when a resource is changed on the server DB.

Check [basic demo](./demos/basic/README.md) to try an interactive bare-bones demonstration.

Check [secure framework demo](./demos/framework/README.md) to try an interactive demonstration on a Svelte-Vite app!

NB! These might not work sometimes, bcs i use them to develop the lib and forget to reset them. Just look for the import errors and in the source uncomment the right import.

Check [docs](./docs.md) to see direct examples and explinations of how to use various parts of the lib. Might be out of date, but the lib core files arent that big, and they are full of comments, so u can read up on those.

Comes with a class for auto securing the SQL, so no worries about injections. And even a simple Vite plugin that wraps it 🥳

## TODOs 📝
* Session ID sync with backend webserver sessions
* Keyed SQL queries
* Better SQL dependency distinguisher on queries
* Typescript migration
* Rate-limit query updates
* Threading paralization pipelines for async querry queues
* Data loading and success or fail states
* plenty more

# Dont be shy to try this out on your small project. Feedback from real world use cases is much appreciated 🥰

## Name:
"Socio.js" comes from the latin verb "socio", which means to link or associate. Since this lib syncs your frontend and backend. Its also a play on words for "WebSockets" and "IO".
