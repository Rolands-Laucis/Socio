# Socio Full-Stack Framework demo in SvelteKit

#### Only depends on having Node installed.

* Download or clone this repo
* ```cd demos/basic```
* ```npm i```
* ```npm run demo```

Should start the express webserver and print out its url, that you can visit on your fav browser to begin the interactive demo.
Should also log some startup status messages upon the first http request.

* Visi the URL on one or multiple tabs or browser instances. 
* Then press the big INSERT button, which will insert a new row into the DB on that table. 
* Then you should see the subscribed queries update their values to whatever the queries returned.

As you will notice, all instances of the browsers and their tabs update their values instantly. This is because the API isnt built with the REST method, but rather with WebSockets, which means the server can push its updates to the clients, if they have registered to receive them. Instead of the traditional way of pooling resquests.

This is powerful because you nolonger need to write a REST API middle layer between front and back end and manually sync states and data, which in practice is often challenging and laborious. With Socio this is all done automatically for you. As well as no need to write DB query interfacing middle layers, since your SQL queries can just sit in one place - the front end - where their use sits. 

In addition, this demo makes use of the included SocioSecure Vite plugin to encrypt the actual SQL queries on the front end. You can check the console logs, websocket messages in the Network panel or the svelte source code on the browser. The sent SQL messages are scrambled gibberish. However, the dynamic parameters are not.

## Next check out the [src/routes/+page.svelte](https://github.com/Rolands-Laucis/Socio/blob/master/demos/full-stack_framework/src/routes/%2Bpage.svelte) file to see how the magic is done on the frontend - its super simple ;)

## Note that this demo project has some specific setup and configuration rules to get everything working. Notably, the use of ``@originjs/vite-plugin-commonjs`` plugin in the Vite config.
This is because im new to TypeScript and am not yet aware of the configuration options i need to get stuff working for everyone. Would be nice, if someone could help with this :)