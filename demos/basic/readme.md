# This is a super simple locally runnable demonstration of the Socio lib and how to use it. Only depends on having Node installed.

#### I saw the angel in the marble and carved until I set him free. /Michelangelo/

* Download or clone this repo
* ```cd demos/basic```
* ```npm i```
* ```npm run demo```

_if it prints an import error, that might be bcs locally i test by npm linking the local package and have commented out the import of the released npm package. You can find the import and switch the commented lines._

Should start the express webserver and print out its url, that you can visit on your fav browser to begin the interactive demo.

* Visi the URL on one or multiple tabs or browser instances. 
* Then press the big INSERT button, which will insert a new row into the DB on that table. 
* Then you should see the subscribed queries update their values to whatever the queries returned.

As you will notice, all instances of the browsers and their tabs update their values. This is because the API isnt built with the REST method, but rather with WebSockets, which means the server can push its updates to the clients, if they have registered to receive them. Instead of the traditional way of pooling resquests.

This is powerful because you nolonger need to write a REST API middle layer between front and back end and manually sync states and data. This is all done automatically for you. As well as no need to write DB query interfacing middle layers, since your SQL queries can just sit in one place - the front end. With frontend frameworks this client.js code becomes even simpler.

## Next check out the ``client.js`` file to see how the magic is done on the frontend - its super simple ;)