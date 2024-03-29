import { SocioClient } from './socio/core-client.js';

//instantiate the Socio Client from lib on the expected websocket port and wait for it to connect
//NB! use wss secure socket protocol and use the ./core/Secure class to encrypt these queries in PROD!
const sc = new SocioClient(`ws://localhost:3000`, { verbose: true }); //each instance is going to be its own "session" on the server, but you can spawn and destroy these where ever in your code
await sc.ready();
//and setup done :)

document.getElementById('ready').innerHTML = `Ready. <h3>client ID: ${sc.client_id}</h3>`
document.getElementById('ready').className += ' ready'

// -------QUERY EXAMPLES-------

//some initial queries to be run once, that will not be reactive
document.getElementById('1').innerText = (await sc.Query("SELECT 42+69 AS RESULT;"))[0].RESULT
document.getElementById('2').innerText = (await sc.Query("SELECT COUNT(*) FROM users;"))[0]['COUNT(*)']

//set up a button to send an insert sql query on click
document.getElementById('insert').addEventListener('click', async (e) => {
    await sc.Query("INSERT INTO users VALUES('Bob', 420);")
})


//queries with dynamic data - via params (optional):
//subscribe to the changes of this query - whenever the table is altered on the backend. And run the callback with the new received data
//this will also run the sql query to get the initial value, then indefinitely receive updates and rerun this callback.
sc.Subscribe({ sql: "SELECT COUNT(*) AS RESULT FROM users WHERE name = :name;", params: { name: 'Bob' } }, (res) => {
    document.getElementById('3').innerText = res[0].RESULT //res is whatever object your particular DB interface lib returns from a raw query
})