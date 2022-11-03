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

Notice how this demo also makes the SQL secure on the frontend - by encrypting the raw sql string, such that it cannot be altered or decrypted by anything other than the serving server and is not human readable. To do this, the SQL queries are in a more strict format - written in double quote string format and the sql ends with a comment "--socio" (which is ignored during encrypting and decrypting). This is all done for you via the SocioSecure class and/or the included Vite plugin :)

## Next check out the ``App.svelte`` file to see how the magic is done on the frontend - its super simple ;)
## And check out ``vite.config.js`` to see how to use the Vite plugin and ``core/secure.js`` to see how to use the raw class to do all this as well without a bundler