# Socio.js

## Connect frontend to backend DB reactively!

Say goodbye to REST APIs. No more API middleware and DB interfacing functions and wrappers and handlers. Write your SQL queries on the frontend and have their results be automagically refreshed on all clients when a resource is changed on the server DB.

Check [demo](./demo/readme.md) to try an interactive bare-bones demonstration.

You might need to link the core lib to the demo manually, since it is not yet published to npm:
```bash
cd core
npm link
cd ../demo
npm link ../core
```

## TODOs
* Backend Life-cycle hooks
* Session ID sync with backend webserver sessions
* Keyed SQL queries
* Better SQL dependency distinguisher on queries
* Bundler plugins for securing query strings
* Typescript migration

## Name:
"Socio.js" comes from the latin verb "socio", which means to link or associate. Since this lib syncs your frontend and backend. Its also a play on words for "WebSockets" and "IO".
