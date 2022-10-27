//"Because he not only wants to perform well, he wants to be well received — and the latter lies outside his control." /Epictetus/

export class WSClient {
    constructor(url, {verbose=false} = {}) {
        this.ws = new WebSocket(url)
        if(window || undefined && url.startsWith('ws://'))
            console.log('UNSECURE WEBSOCKET URL CONNECTION! Please use wss:// protocol to protect against man-in-the-middle attacks.')
        // this.ws.addEventListener("close", () => {this.ws = new WebSocket(url)}); // <- rise from your grave!

        this.queries = {} //sql:[callback]
        this.is_ready = false
        this.verbose = verbose

        this.ws.addEventListener('message', this.message.bind(this));
        // this.ws.addEventListener('pong', () => { console.log('pong')});
    }

    message(e) {
        const [kind, data] = JSON.parse(e.data)
        if (this.verbose) console.log(kind, data)

        switch(kind){
            case 'CON': this.ses_id = data; this.is_ready = true; break;
            case 'UPD':
                if (data.sql in this.queries)
                    this.queries[data.sql].forEach(f => f(data.result));
                else console.log(`UPD message for unregistered SQL query! [${data.sql}] with data:`, data)
                break;
            case 'SQL':
                if (data.sql in this.queries)
                    this.queries[data.sql](data.result);
                break;
            // case '': break;
            default: console.log(`Unrecognized message kind! [${kind}] with data:`, data);
        }
    }

    ready(){
        return new Promise((res) => {
            const timer = setInterval(() => {
                if(this.is_ready){
                    clearInterval(timer)
                    res()
                }
             }, 50)
        })
    }

    subscribe({ sql = '', params = null } = {}, callback = null, t=null){
        if (sql in this.queries)
            this.queries[sql].push(t ? callback.bind(t) : callback)
        else{
            this.queries[sql] = [t ? callback.bind(t) : callback]
            this.ws.send(JSON.stringify([this.ses_id, 'REG', { sql: sql, params: params }]))
        }
        // console.log('Registered', sql)
    }

    async query(sql='', params=null){
        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const prom = new Promise((res) => { 
            this.queries[sql] = res
        })
        //send off the request, which will be resolved in the message handler
        this.ws.send(JSON.stringify([this.ses_id, 'SQL', { sql: sql, params:params }]))
        return await prom
    }
}