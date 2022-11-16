//https://stackoverflow.com/questions/38946112/es6-import-error-handling
try { //for my logger
    var { info, log, error, done, soft_error, setPrefix, setShowTime } = await import('@rolands/log')
    setPrefix('Socio Client')
    setShowTime(false)
} catch (e) {
    console.log('[Socio Client ERROR]', e)
    var info = (...objs) => console.log('[Socio Client]', ...objs)
    var done = (...objs) => console.log('[Socio Client]', ...objs)
    var log = (...objs) => console.log('[Socio Client]', ...objs)
    var soft_error = (...objs) => console.log('[Socio Client]', ...objs)
}

//"Because he not only wants to perform well, he wants to be well received — and the latter lies outside his control." /Epictetus/
export class WSClient {
    // private:
    #queries = {} //id:[callback]
    #is_ready = false
    #ws=null
    #ses_id = null
    static #key = 0 //all instances will share this number, such that they are always kept unique. Tho each of these clients would make a different session on the backend, but still

    constructor(url, {name = '', verbose=false, keep_alive=true, reconnect_tries=1, push_callback=null} = {}) {
        if (window || undefined && url.startsWith('ws://'))
            info('UNSECURE WEBSOCKET URL CONNECTION! Please use wss:// and https:// protocols in production to protect against man-in-the-middle attacks.')

        //public:
        this.name = name
        // this.push = push_callback
        this.verbose = verbose
        
        this.#connect(url, keep_alive, verbose, reconnect_tries)
        this.#ws.addEventListener('message', this.#message.bind(this));
    }

    #connect(url, keep_alive, verbose, reconnect_tries){
        this.#ws = new WebSocket(url)
        if (keep_alive && reconnect_tries)
            this.#ws.addEventListener("close", () => { 
                if (this.verbose) soft_error(`WebSocket closed. Retrying...`, this.name); 
                this.#connect(url, keep_alive, verbose, reconnect_tries - 1)
            }); // <- rise from your grave!
    }

    #message(e) {
        const { kind, data } = JSON.parse(e.data)
        if (this.verbose) info('recv:',kind, data)

        switch(kind){
            case 'CON': 
                this.#ses_id = data; 
                this.#is_ready(); 
                if (this.verbose) done(`WebSocket connected.`, this.name); 
                delete this.#is_ready; //clear memory
                break;
            case 'UPD':
                if (this.#FindID(kind, data?.id))
                    this.#queries[data.id].f.forEach(f => f(data.result));
                break;
            case 'SQL':
                if (this.#FindID(kind, data?.id)){
                    this.#queries[data.id](data.result);
                    delete this.#queries[data.id] //clear memory
                }
                break;
            case 'PONG': if (this.verbose) info('pong', data?.id); break;
            case 'AUTH':
                if (this.#FindID(kind, data?.id)) {
                    if (data?.result === false) { if (this.verbose) soft_error(`AUTH returned FALSE, which means websocket has not authenticated.`); }
                    else this.socio_auth_token = data.result
                    this.#queries[data.id](data?.result);
                    delete this.#queries[data.id] //clear memory
                }
                break;
            // case 'PUSH': this.push(data); break;
            // case '': break;
            default: info(`Unrecognized message kind! [${kind}] with data:`, data);
        }
    }

    #FindID(kind, id){
        if (id in this.#queries) return true
        else if (this.verbose) soft_error(`${kind} message for unregistered SQL query! [${id}] with data:`, data)
        return false
    }

    ready(){return new Promise(res => this.#is_ready = res)}

    //private method
    #send(data={}){
        this.#ws.send(JSON.stringify({ client_id: this.#ses_id, ...data }))
        if (this.verbose) info('sent:', ...data)
    }

    //subscribe to an sql query. Can add multiple callbacks where ever in your code, if their sql queries are identical
    subscribe({ sql = '', params = null } = {}, callback = null, t=null){
        const found = Object.entries(this.#queries).find(q => q[1].sql === sql)

        if (found)
            this.#queries[found[0]].f.push(t ? callback.bind(t) : callback)
        else{
            const id = this.#gen_key
            this.#queries[id] = { sql: sql, f: [t ? callback.bind(t) : callback] }
            this.#send({ kind: 'REG', data:{ id: id, sql: sql, params: params }})
        }
    }

    async query(sql='', params=null){
        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const id = this.#gen_key;
        const prom = new Promise((res) => { 
            this.#queries[id] = res
        })
        //send off the request, which will be resolved in the message handler
        this.#send({kind:'SQL', data:{ id:id, sql: sql, params: params }})
        return await prom
    }

    //sends a ping with either the user provided number or an auto generated number, for keeping track of packets and debugging
    ping(num=0){
        this.#send({kind:'PING', data:{ id: num || this.#gen_key }})
    }

    async authenticate(params={}){ //params here can be anything, like username and password stuff etc. The backend server auth function callback will receive this entire object
        //set up a promise which resolve function is in the queries data structure, such that in the message handler it can be called, therefor the promise resolved, therefor awaited and return from this function
        const id = this.#gen_key;
        const prom = new Promise((res) => {
            this.#queries[id] = res
        })
        this.#send({kind:'AUTH', data:{ id:id, params: params}})
        return await prom
    }

    //generates a unique key either via static counter or user provided key gen func
    get #gen_key() {
        if (this?.key_generator)
            return this.key_generator()
        else{
            WSClient.#key += 1
            return WSClient.#key
        }
    }
}