//If God did not exist, it would be necessary to invent Him. /Voltaire/

//an example script of creating an Admin connection the the backend SocioServer
//with which to call any public function on the class instance with any args.
//currently this is all turned off, dont worry. Im just testing around.

import { WebSocket } from "ws";
import {log} from './dist/logging.js'

const w = new WebSocket("ws://localhost:3000");
w.on('error', console.error)
w.on('open', () => {
    //set an Admin command to execute SocioServer.GetPropVal('color'), but on the exact class instance this has connected to. 
    //It will send a response of whatever the function call returns.
    w.send(JSON.stringify({ kind: 'ADMIN', data: { function: 'GetPropVal', args:['color'] } }))
})

w.on('message', (d, isBinary) => {
    log(JSON.parse(d));
})