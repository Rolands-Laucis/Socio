# Socio Full-Stack Framework demo in SvelteKit

## Prerequisites
* Node.js >= 16 LTS
* NPM or any other package manager

## Setup and run
* Download or clone this repo
* ```cd demos/full-stack_framework```
* ```npm i```
* ```npm run dev```

Should start the SvelteKit Vite local webserver and print out its url, that you can visit on your browser to begin the interactive demo.
Should also log some startup status messages upon the first http request.

* Visi the URL on one or multiple tabs or browser instances. 
* Then press the big INSERT button, which will insert a new row into the DB on that table. 
* Then you should see the subscribed queries update their values to whatever the queries returned.

As you will notice, all instances of the browsers and their tabs update their values instantly. This is because the API isnt built with the REST method, but rather with WebSockets, which means the server can push its updates to the clients, if they have registered to receive them. Instead of the traditional way of pooling resquests.

This is powerful because you nolonger need to write a REST API middle layer between front and back end and manually sync states and data, which in practice is often challenging and laborious. With Socio this is all done automatically for you. As well as no need to write DB query interfacing middle layers, since your SQL queries can just sit in one place - the front end - where their use sits. 

In addition, this demo makes use of the included SocioSecure Vite plugin to encrypt the actual SQL queries on the front end source code. You can check the console logs, websocket messages in the browser Network panel or the Svelte source code on the browser. The sent SQL messages are scrambled gibberish. However, the dynamic parameters are not.

## Next check out the [src/routes/+page.svelte](https://github.com/Rolands-Laucis/Socio/blob/master/demos/full-stack_framework/src/routes/%2Bpage.svelte) file to see how the magic is done on the frontend - it's super simple ;)

This is because im new to TypeScript and am not yet aware of the configuration options i need to get stuff working for everyone. Would be nice, if someone could help with this :)

## Building this for production
* ```npm i @sveltejs/adapter-node``` or other production adapter you need. For Node.js backend servers, this will work.
* In ``svelte.config.js`` replace ``import adapter from "@sveltejs/adapter-auto";`` with ``import adapter from "@sveltejs/adapter-node";``
* Set up .env config loading in Vite. Either the npm lib `dotenv` or use ``import.meta.env`` ES property, which Vite should populate with env vars automatically on build.
* ```npm run build``` to build the project to a default dir called ``./build``
* ``node build/index.js`` to run the built node.js backend server, that will host the entire built SvelteKit project. Or ```node build``` for short.
* Probably a good idea to set up NginX reverse proxy and launch the run cmd through ``pm2`` (process manager 2), so that it is revived, if it crashes.