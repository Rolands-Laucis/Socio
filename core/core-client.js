//https://stackoverflow.com/questions/38946112/es6-import-error-handling
let info = null
try { //for my logger
    await import('@rolands/log')
    setPrefix('Socio Client')
    setShowTime(false)
} catch (e) {
    info = (...objs) => console.log('[Socio Client]', ...objs)
}

//"Because he not only wants to perform well, he wants to be well received — and the latter lies outside his control." /Epictetus/
export class WSClient {
    // private:
    #queries = {} //sql:[callback]
    #is_ready = false
    #verbose = false
    #ws=null

    constructor(url, {name = '', verbose=false, keep_alive=true, reconnect_tries=3, push_callback=null} = {}) {
        if (window || undefined && url.startsWith('ws://'))
            info('UNSECURE WEBSOCKET URL CONNECTION! Please use wss:// and https:// protocols in production to protect against man-in-the-middle attacks.')

        this.name = name
        this.#verbose = verbose
        this.push = push_callback
        this.#connect(url, keep_alive, verbose, reconnect_tries)

        this.#ws.addEventListener('message', this.message.bind(this));
    }

    #connect(url, keep_alive, verbose, reconnect_tries){
        this.#ws = new WebSocket(url)
        if (keep_alive && reconnect_tries)
            this.#ws.addEventListener("close", () => { 
                if (this.#verbose) info(this.name, `WebSocket closed. Retrying...`); 
                this.#connect(url, keep_alive, verbose, reconnect_tries - 1)
            }); // <- rise from your grave!
    }

    message(e) {
        const [kind, data] = JSON.parse(e.data)
        if (this.#verbose) info(kind, data)

        switch(kind){
            case 'CON': this.ses_id = data; this.#is_ready = true; if (this.#verbose) info(this.name, `WebSocket connected.`); break;
            case 'UPD':
                if (data.sql in this.#queries)
                    this.#queries[data.sql].forEach(f => f(data.result));
                else if (this.#verbose) info(`UPD message for unregistered SQL query! [${data.sql}] with data:`, data)
                break;
            case 'SQL':
                if (data.sql in this.#queries)
                    this.#queries[data.sql](data.result);
                break;
            case 'PONG': if (this.#verbose) info('pong', data?.num); break;
            case 'PUSH': this.push(data); break;
            // case '': break;
            default: info(`Unrecognized message kind! [${kind}] with data:`, data);
        }
    }

    ready(){
        //idk a better solution. Checks every n ms if the ready flag is set
        return new Promise((res) => {
            const timer = setInterval(() => {
                if(this.#is_ready){
                    clearInterval(timer)
                    res()
                }
             }, 50)
        })
    }

    //private method
    #send(data=[]){
        this.#ws.send(JSON.stringify([this.ses_id, ...data]))
    }

    subscribe({ sql = '', params = null } = {}, callback = null, t=null){
        if (sql in this.#queries)
            this.#queries[sql].push(t ? callback.bind(t) : callback)
        else{
            this.#queries[sql] = [t ? callback.bind(t) : callback]
            this.#send(['REG', { sql: sql, params: params }])
        }
        // info('Registered', sql)
    }

    async query(sql='', params=null){
        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const prom = new Promise((res) => { 
            this.#queries[sql] = res
        })
        //send off the request, which will be resolved in the message handler
        this.#send(['SQL', { sql: sql, params: params }])
        return await prom
    }

    ping(num=0){
        this.#send(['PING', { num: num }])
    }
}