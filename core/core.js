//Nullum magnum ingenium sine mixture dementia fuit. - There has been no great wisdom without an element of madness.

import { log, error, soft_error, info, setPrefix, setShowTime} from '@rolands/log'
import { UUID } from './secure.js';
import { WebSocketServer } from 'ws'; //https://github.com/websockets/ws https://github.com/websockets/ws/blob/master/doc/ws.md
//https://stackoverflow.com/questions/16280747/sending-message-to-a-specific-connected-users-using-websocket

export class SessionManager{
    // private:
    #wss=null
    #sessions = {}//client_id:websocket
    #secure=null
    #lifecycleHooks = { con: null, discon: null, msg: null, upd: null }

    constructor(opts = {}, DB_query_function = null, { secure =null, verbose = false } = {}){
        setPrefix('Socio'); setShowTime(false); //for my logger

        this.#wss = new WebSocketServer(opts); //take a look at the WebSocketServer docs - the opts can have a server param, that can be your http server
        this.Query = DB_query_function
        this.verbose = verbose
        this.#secure = secure

        this.#wss.on('connection', this.#Connect.bind(this)); //https://thenewstack.io/mastering-javascript-callbacks-bind-apply-call/ have to bind 'this' to the function, otherwise it will use the .on()'s 'this', so that this.[prop] are not undefined
        this.#wss.on('close', (...stuff) => { info('WebSocketServer close event', ...stuff) });
        this.#wss.on('error', (...stuff) => { error('WebSocketServer error event', ...stuff)});
    }

    #Connect(conn, req){
        //construct the new session with a unique ID
        const client_id = UUID()
        this.#sessions[client_id] = new Session(client_id, conn, this.verbose)

        //pass the object to the connection hook, if it exists
        if (this.#lifecycleHooks.con)
            this.#lifecycleHooks.con(this.#sessions[client_id])

        //notify the client of their ID
        conn.send(JSON.stringify(['CON', client_id]));
        if (this.verbose) info('CON', client_id)

        //set this client websockets event handlers
        conn.on('message', this.#Message.bind(this));
        conn.on('close', () => {
            //trigger hook
            if (this.#lifecycleHooks.discon)
                this.#lifecycleHooks.discon(this.#sessions[client_id])

            //delete the connection object
            delete this.#sessions[client_id]
            if (this.verbose) info('DISCON', client_id)
        });
    }

    async #Message(req, head){
        const [client_id, kind, data] = JSON.parse(req.toString())
        if (this.#secure && data?.sql) data.sql = this.#secure.DecryptString(data.sql) //if this is supposed to be secure and sql was received, then decrypt it before continuing
        if (this.verbose) info(`received [${kind}] from [${client_id}]`, data);

        switch (kind) {
            case 'REG':
                if(client_id in this.#sessions)
                    this.#sessions[client_id].Send(['UPD', { id:data.id, result: await this.Query(data.sql, data.params) }])

                //set up hook
                if (QueryUtils.QueryIsSelect(data.sql))
                    QueryUtils.ParseSQLForTables(data.sql).forEach(t => this.#sessions[client_id].RegisterHook(t, data.id, data.sql, data.params));

                break;
            case 'SQL':
                const is_select = QueryUtils.QueryIsSelect(data.sql)
                if (client_id in this.#sessions){
                    const res = this.Query(data.sql, data.params)
                    if (is_select) //wait for result
                        this.#sessions[client_id].Send(['SQL', { id: data.id, result: await res }])
                }
                    
                //if the sql wasnt a SELECT, but altered some resource, then need to propogate that to other connection hooks
                if (!is_select)
                    this.Update(QueryUtils.ParseSQLForTables(data.sql))
                    
                break;
            case 'PING': this.#sessions[client_id].Send(['PONG', { id: data?.id}]); break;
            // case '': break;
            default: if (this.verbose) error(`Unrecognized message kind! [${kind}] with data:`, data);
        }
    }

    //OPTIMIZATION dont await the query, but queue up all of them on another thread then await and send there
    async Update(tables=[]){
        // if (this.#lifecycleHooks.update) this.#lifecycleHooks.update.forEach(f => f(tables)) //call all the lifecycle hooks
        Object.values(this.#sessions).forEach(async (s) => {
            tables.forEach(async (t) => {
                if (s.hook_tables.includes(t)){
                    for await (const hook of s.GetHookObjs(t)) {
                        s.Send(['UPD', { id: hook.id, result: (await this.Query(hook.sql, hook.params)) }])
                    }
                }
            })
        })
    }

    //when the server wants to send some data to a specific session client - can be any raw data
    SendTo(client_id='', data={}){
        if (client_id in this.#sessions)
            this.#sessions[client_id].Send(['PUSH', data])
        else soft_error(`The provided session ID [${client_id}] was not found in the tracked web socket connections!`)
    }

    Emit(data=[]){
        this.#wss.emit(JSON.stringify(['EMIT', ...data]));
    }

    RegisterLifecycleHookHandler(name='', handler=null){
        if(name in this.#lifecycleHooks)
            this.#lifecycleHooks[name] = handler
        else
            error(`Lifecycle hook [${name}] does not exist!`)
    }

    UnRegisterLifecycleHookHandler(name = '') {
        if (name in this.#lifecycleHooks)
            delete this.#lifecycleHooks[name]
        else
            error(`Lifecycle hook [${name}] does not exist!`)
    }

    get LifecycleHookNames(){
        return Object.keys(this.#lifecycleHooks)
    }

    GetClientSession(client_id=''){
        return this.#sessions[client_id]
    }

    ClientIDsOfSession(ses_id = ''){
        return this.#sessions.filter(s => s.ses_id === ses_id).map(s => s.id)
    }
}


//Homo vitae commodatus non donatus est. - Man's life is lent, not given. /Syrus/
class Session{
    #ws=null
    #hooks=[]

    constructor(client_id='', browser_ws_conn=null, verbose=false){
        this.id = client_id
        this.ses_id = null
        this.#ws = browser_ws_conn
        this.#hooks = {} //table_name:[sql]
        this.verbose = verbose
    }

    RegisterHook(table='', id='', sql='', params=null){ //TODO this is actually very bad
        if (table in this.#hooks && !this.#hooks[table].find((t) => t.sql == sql && t.params == params))
            this.#hooks[table].push({ id: id, sql: sql, params: params })
        else
            this.#hooks[table] = [{ id: id, sql:sql, params:params}]
        log('reg hook', table, this.#hooks[table])
    }

    Send(data=[]){
        this.#ws.send(JSON.stringify(data))
        if (this.verbose) info('sent:', ...data)
    }

    get hook_tables(){return Object.keys(this.#hooks)}

    GetHookObjs(table = '') { return this.#hooks[table]}
}


class QueryUtils{
    static QueryIsSelect(sql = '') {
        return /^SELECT/im.test(sql)
    }

    static ParseSQLForTables(sql = '') {
        return sql
            .match(/(?:FROM|INTO)[\s\n\t](?<tables>[\w,\s\n\t]+?)[\s\n\t]?(?:WHERE|VALUES|;|LIMIT|GROUP|ORDER)/mi)
            ?.groups?.tables
            .split(/,[\s\n\t\r]*/mig)
            .map((t) => t.split(/[\s\n\t\r]/mi)[0].trim()) || []
    }
}