# Socio.js

## Connect frontend to backend DB reactively! (under active early development)

Say goodbye to REST APIs. No more API middleware and DB interfacing functions and wrappers and handlers. Write your SQL queries on the frontend and have their results be automagically refreshed on all clients when a resource is changed on the server DB.

Check [basic demo](./demos/basic/readme.md) to try an interactive bare-bones demonstration.
Check [framework demo](./demos/framework/README.md) to try an interactive demonstration on a Svelte-Vite app!

## TODOs
* Backend Life-cycle hooks
* Session ID sync with backend webserver sessions
* Keyed SQL queries
* Better SQL dependency distinguisher on queries
* Bundler plugins for securing query strings
* Typescript migration
* plenty more

## Name:
"Socio.js" comes from the latin verb "socio", which means to link or associate. Since this lib syncs your frontend and backend. Its also a play on words for "WebSockets" and "IO".
