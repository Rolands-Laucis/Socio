# This is a simple locally runnable demonstration of the Socio lib and how to use it within a frontend framework like Svelte. Only depends on having Node installed.

* Download or clone this repo
* ```cd demos/framework```
* ```npm i```

In 2 paralel terminals:
* ```npm run dev``` for the Svelte-Vite dev server
* ```npm run soc``` for the WebSocketServer

_if it prints an import error, that might be bcs locally i test by npm linking the local package and have commented out the import of the released npm package. You can find the import and switch the commented lines._

* Visi the Svelte dev server URL on one or multiple tabs or browser instances. 
* Then press the big INSERT button, which will insert a new row into the DB on that table. 
* Then you should see the subscribed queries update their values to whatever the queries returned.

As you will notice, all instances of the browsers and their tabs update their values. This is because the API isnt built with the REST method, but rather with WebSockets, which means the server can push its updates to the clients, if they have registered to receive them. Instead of the traditional way of pooling resquests.

This is powerful because you nolonger need to write a REST API middle layer between front and back end and manually sync states and data. This is all done automatically for you. As well as no need to write DB query interfacing middle layers, since your SQL queries can just sit in one place - the front end.

## Next check out the ``App.svelte`` file to see how the magic is done on the frontend - its super simple ;)