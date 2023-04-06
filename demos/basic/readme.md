# This is a super simple locally runnable demonstration of the Socio lib and how to use it.

## Prerequisites
* Node.js >= 16 LTS
* NPM - comes with Node (because of how lib files are served from express and node_modules file structure. You can edit the paths for your package manager, like pnpm)

## Setup and run
* Download or clone this repo
* ```cd demos/basic```
* ```npm i```
* ```npm run demo```

Should start the express webserver and print out its url, that you can visit on your fav browser to begin the interactive demo.

* Visi the URL on one or multiple tabs or browser instances. 
* Then press the big INSERT button, which will insert a new row into the DB on the users table. 
* Then you should see the subscribed queries update their values to whatever the queries returned.

As you will notice, all instances of the browsers and their tabs update their values. This is because the API isnt built with the REST method, but rather with WebSockets, which means the server can push its updates to the clients. Instead of the traditional way of pooling GET resquests.

This is powerful because you nolonger need to write a REST API middle layer between front and back end and manually sync states and data, which in practice is often challenging and laborious. With Socio this is all done automagically for you. As well as no need to write DB query interfacing middle layers, since your SQL queries can just sit in one place - the front end - where their use sits.

## Next check out the ``client.js`` file to see how the magic is done on the frontend - its super simple ;)