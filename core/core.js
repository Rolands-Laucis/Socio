//Nullum magnum ingenium sine mixture dementia fuit. - There has been no great wisdom without an element of madness.

import { log, soft_error, info, setPrefix, setShowTime } from '@rolands/log'; setPrefix('Socio'); setShowTime(false); //for my logger
import { UUID } from './secure.js';
import { WebSocketServer } from 'ws'; //https://github.com/websockets/ws https://github.com/websockets/ws/blob/master/doc/ws.md
//https://stackoverflow.com/questions/16280747/sending-message-to-a-specific-connected-users-using-websocket

//NB! some fields in these variables are private for safety reasons, but also bcs u shouldnt be altering them, only if through my defined ways. They are mostly expected to be constants.
//whereas public variables are free for you to alter freely at any time during runtime.

export class SessionManager{
    // private:
    #wss=null
    #sessions = {}//client_id:Session
    #secure=null //if constructor is given a SocioSecure object, then that will be used to decrypt all incomming messages
    #lifecycle_hooks = { con: null, discon: null, msg: null, upd: null, auth: null, gen_client_id:null } //call the register function to hook on these. They will be called if they exist
    
    //public:
    log_handlers = { error: null, info:null} //register your logger functions here. By default like this it will log to console, if verbose.

    constructor(opts = {}, DB_query_function = null, { secure =null, verbose = false, hard_crash=false } = {}){
        //private:
        this.#wss = new WebSocketServer(opts); //take a look at the WebSocketServer docs - the opts can have a server param, that can be your http server
        this.#secure = secure

        //public:
        this.Query = DB_query_function
        this.verbose = verbose
        this.hard_crash = hard_crash

        this.#wss.on('connection', this.#Connect.bind(this)); //https://thenewstack.io/mastering-javascript-callbacks-bind-apply-call/ have to bind 'this' to the function, otherwise it will use the .on()'s 'this', so that this.[prop] are not undefined
        this.#wss.on('close', (...stuff) => { info('WebSocketServer close event', ...stuff) });
        this.#wss.on('error', (...stuff) => { this.#HandleError('WebSocketServer error event', ...stuff)});
    }

    #HandleError(e){
        if (this.hard_crash) throw e
        if (this.#log_handlers.error) this.#log_handlers.error(e)
        else if (this.verbose) soft_error(e)
    }

    #HandleInfo(...args){
        if (this.#log_handlers.info) this.#log_handlers.info(...args)
        else if (this.verbose) info(...args)
    }

    #Connect(conn, req){
        try{
            //construct the new session with a unique client ID
            const client_id = this.#lifecycle_hooks.gen_client_id ? this.#lifecycle_hooks.gen_client_id() : UUID()
            this.#sessions[client_id] = new Session(client_id, conn, this.verbose)

            //pass the object to the connection hook, if it exists
            if (this.#lifecycle_hooks.con) //here you are free to set a session ID as Session.ses_id. Like whatever your web server generates. Then use the ClientIDsOfSession(ses_id) to get the web socket clients using that backend web server session
                this.#lifecycle_hooks.con(this.#sessions[client_id], req)

            //notify the client of their ID
            conn.send(JSON.stringify(['CON', client_id]));
            this.#HandleInfo('CON', client_id)

            //set this client websockets event handlers
            conn.on('message', this.#Message.bind(this));
            conn.on('close', () => {
                //trigger hook
                if (this.#lifecycle_hooks.discon)
                    this.#lifecycle_hooks.discon(this.#sessions[client_id])

                //delete the connection object
                delete this.#sessions[client_id]
                this.#HandleInfo('DISCON', client_id)
            });
        }catch(e){this.#HandleError(e)}
    }

    async #Message(req, head){
        try{
            const { client_id, kind, data } = JSON.parse(req.toString())
            if (this.#secure && data?.sql) {//if this is supposed to be secure and sql was received, then decrypt it before continuing
                data.sql = this.#secure.DecryptString(data.sql)
                if (!/--socio;?$/mi.test(data.sql)){ //secured sql queries must end with the marker, to validate that they havent been tampered with and are not giberish.
                    this.#HandleError('Decrypted sql string does not end with the --socio marker, therefor is invalid.', client_id, kind, data)
                    return
                }
            }
            this.#HandleInfo(`received [${kind}] from [${client_id}]`, data);

            if (this.#lifecycle_hooks.msg) {
                this.#lifecycle_hooks.msg(client_id, kind, data)
                return
            }

            switch (kind) {
                case 'REG':
                    if (client_id in this.#sessions)
                        this.#sessions[client_id].Send({ 
                                kind:'UPD', 
                                data:{ 
                                    id: data.id, 
                                    result: await this.Query({ 
                                        ...data, 
                                        ses_id: this.#sessions[client_id].ses_id
                                    }) 
                                } 
                            })

                    //set up hook
                    if (QueryUtils.QueryIsSelect(data.sql))
                        QueryUtils.ParseSQLForTables(data.sql).forEach(t => this.#sessions[client_id].RegisterHook(t, data.id, data.sql, data.params));

                    break;
                case 'SQL':
                    const is_select = QueryUtils.QueryIsSelect(data.sql)
                    if (client_id in this.#sessions) {
                        //have to do the query in every case
                        const res = this.Query({ ...data, ses_id: this.#sessions[client_id].ses_id })
                        if (is_select) //wait for result, if a result is expected, and send it back
                            this.#sessions[client_id].Send({ kind:'SQL', data:{ id: data.id, result: await res } })
                    }

                    //if the sql wasnt a SELECT, but altered some resource, then need to propogate that to other connection hooks
                    if (!is_select)
                        this.Update(QueryUtils.ParseSQLForTables(data.sql))

                    break;
                case 'PING': this.#sessions[client_id].Send({kind:'PONG', data:{ id: data?.id }}); break;
                case 'AUTH':
                    if (this.#lifecycle_hooks.auth)
                        this.#sessions[client_id].Send({ kind:'AUTH', data:{ id: data.id, result: await this.#lifecycle_hooks.auth(client_id, data.params) } })
                    else
                        this.#sessions[client_id].Send({ kind:'AUTH', data:{ id: data.id, result: false } })
                    break;
                // case '': break;
                default: throw (`Unrecognized message kind! [${kind}] with data:`, data);
            }
        } catch (e) { this.#HandleError(e) }
    }

    //OPTIMIZATION dont await the query, but queue up all of them on another thread then await and send there
    async Update(tables=[]){
        if (this.#lifecycle_hooks.upd) {
            this.#lifecycle_hooks.upd(tables)
            return
        }

        try{
            Object.values(this.#sessions).forEach(async (s) => {
                tables.forEach(async (t) => {
                    if (s.hook_tables.includes(t)) {
                        for await (const hook of s.GetHookObjs(t)) {
                            s.Send(['UPD', { id: hook.id, result: (await this.Query({ id: hook.id, ses_id: s.ses_id, query: hook.sql, params: hook.params })) }])
                        }
                    }
                })
            })
        } catch (e) { this.#HandleError(e) }
    }

    //when the server wants to send some data to a specific session client - can be any raw data
    SendTo(client_id='', data={}){
        try{
            if (client_id in this.#sessions)
                this.#sessions[client_id].Send({ kind:'PUSH', data:data })
            else throw `The provided session ID [${client_id}] was not found in the tracked web socket connections!`
        } catch (e) { this.#HandleError(e) }
    }

    Emit(data={}){
        this.#wss.emit(JSON.stringify({ kind:'EMIT', data:data }));
    }

    RegisterLifecycleHookHandler(name='', handler=null){
        try{
            if (name in this.#lifecycle_hooks)
                this.#lifecycle_hooks[name] = handler
            else throw `Lifecycle hook [${name}] does not exist!`
        } catch (e) { this.#HandleError(e) }
    }

    UnRegisterLifecycleHookHandler(name = '') {
        try{
            if (name in this.#lifecycle_hooks)
                delete this.#lifecycle_hooks[name]
            else throw `Lifecycle hook [${name}] does not exist!`
        } catch (e) { this.#HandleError(e) }
    }

    get LifecycleHookNames(){
        return Object.keys(this.#lifecycle_hooks)
    }

    GetClientSession(client_id=''){
        return this.#sessions[client_id] || null
    }

    ClientIDsOfSession(ses_id = ''){
        return this.#sessions?.filter(s => s.ses_id === ses_id)?.map(s => s.id) || []
    }
}


//Homo vitae commodatus non donatus est. - Man's life is lent, not given. /Syrus/
class Session{
    //private:
    #id = null //unique ID for this session for my own purposes
    #ws=null
    #hooks=[]

    constructor(client_id = '', browser_ws_conn = null, verbose = false){
        //private:
        this.#id = client_id
        this.#ws = browser_ws_conn
        this.#hooks = {} //table_name:[sql]

        //public:
        this.ses_id = null //you are free to set this to whatever, so that you can later identify it by any means. Usually set it to whatever your session cookie is for this client on your web server
        this.verbose = verbose
    }

    RegisterHook(table='', id='', sql='', params=null){ //TODO this is actually very bad
        if (table in this.#hooks && !this.#hooks[table].find((t) => t.sql == sql && t.params == params))
            this.#hooks[table].push({ id: id, sql: sql, params: params })
        else
            this.#hooks[table] = [{ id: id, sql:sql, params:params}]
        // log('reg hook', table, this.#hooks[table])
    }

    Send(data={}){
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