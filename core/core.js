//Nullum magnum ingenium sine mixture dementia fuit. - There has been no great wisdom without an element of madness.

"use strict";

//libs
import { WebSocketServer } from 'ws'; //https://github.com/websockets/ws https://github.com/websockets/ws/blob/master/doc/ws.md

//mine
import { log, soft_error, error, info, setPrefix, setShowTime } from '@rolands/log'; setPrefix('Socio'); setShowTime(false); //for my logger
import { QueryIsSelect, ParseQueryTables, SocioArgsParse, SocioArgHas, ParseQueryVerb } from './utils.js'
import { E, LogHandler } from './logging.js'
import { UUID } from './secure.js'
import {SocioSession} from './core-session.js'

//NB! some fields in these variables are private for safety reasons, but also bcs u shouldnt be altering them, only if through my defined ways. They are mostly expected to be constants.
//whereas public variables are free for you to alter freely at any time during runtime.

export class SocioServer extends LogHandler {
    // private:
    #wss=null
    #sessions = {}//client_id:SocioSession
    #secure=null //if constructor is given a SocioSecure object, then that will be used to decrypt all incomming messages
    #lifecycle_hooks = { con: null, discon: null, msg: null, upd: null, auth: null, gen_client_id:null, grant_perm:null } //call the register function to hook on these. They will be called if they exist
    //msg hook receives all incomming msgs to the server. If the hook returns a truthy value, then it is assumed, that the hook handled the msg and the lib will not. Otherwise, by default, the lib handles the msg.
    //upd works the same as msg, but for everytime updates need to be propogated to all the sockets.
    //auth func can return any truthy or falsy value, the client will only receive a boolean, so its safe to set it to some credential or id or smth, as this would be accessible and useful to you when checking the session access to tables.
    //the grant_perm funtion is for validating that the user has access to whatever tables or resources the sql is working with. A client will ask for permission to a verb (SELECT, INSERT...) and table(s). If you grant access, then the server will persist it for the entire connection.

    //public:

    //public:
    hard_crash = false //will just crash the class instance and propogate (throw) the error encountered without logging it anywhere - up to you to handle.
    verbose = true

    constructor(opts = {}, DB_query_function = null, { secure =null, verbose = true, hard_crash=false } = {}){
        super(info, error);

        //private:
        this.#wss = new WebSocketServer(opts); //take a look at the WebSocketServer docs - the opts can have a server param, that can be your http server
        this.#secure = secure

        //public:
        this.Query = DB_query_function
        this.verbose = verbose
        this.hard_crash = hard_crash

        this.#wss.on('connection', this.#Connect.bind(this)); //https://thenewstack.io/mastering-javascript-callbacks-bind-apply-call/ have to bind 'this' to the function, otherwise it will use the .on()'s 'this', so that this.[prop] are not undefined
        this.#wss.on('close', (...stuff) => { this.HandleInfo('WebSocketServer close event', ...stuff) });
        this.#wss.on('error', (...stuff) => { this.HandleError('WebSocketServer error event', ...stuff)});
    }

    #Connect(conn, req){
        try{
            //construct the new session with a unique client ID
            const client_id = this.#lifecycle_hooks.gen_client_id ? this.#lifecycle_hooks.gen_client_id() : UUID()
            this.#sessions[client_id] = new SocioSession(client_id, conn, { verbose: this.verbose })

            //pass the object to the connection hook, if it exists
            if (this.#lifecycle_hooks.con)
                this.#lifecycle_hooks.con(this.#sessions[client_id], req)

            //notify the client of their ID
            this.#sessions[client_id].Send('CON', client_id);
            this.HandleInfo('CON', client_id)

            //set this client websockets event handlers
            conn.on('message', this.#Message.bind(this));
            conn.on('close', () => {
                //trigger hook
                if (this.#lifecycle_hooks.discon)
                    this.#lifecycle_hooks.discon(this.#sessions[client_id])

                //delete the connection object
                // this.#sessions[client_id] = null
                delete this.#sessions[client_id] //cant delete private properties, even if this is a key in an obj. IDK js, wtf... Could assign to new dup object without this key, but ehhh
                
                this.HandleInfo('DISCON', client_id)
            });
        }catch(e){this.HandleError(e)}
    }

    async #Message(req, head){
        try{
            const { client_id, kind, data } = JSON.parse(req.toString())
            if (this.#secure && data?.sql) {//if this is supposed to be secure and sql was received, then decrypt it before continuing
                data.sql = this.#secure.DecryptString(data.sql)
                const socio_args = SocioArgsParse(data.sql) //speed optimization

                if (!SocioArgHas('socio', { parsed: socio_args })) //secured sql queries must end with the marker, to validate that they havent been tampered with and are not giberish.
                    throw new E('Decrypted sql string does not end with the --socio marker, therefor is invalid. [#marker-issue]', client_id, kind, data, socio_args);

                if (SocioArgHas('auth', { parsed: socio_args }))//query requiers auth to execute
                    if(!this.#sessions[client_id].authenticated)
                        throw new E (`Client ${client_id} tried to execute an auth query without being authenticated. [#auth-issue]`);
                
                if (SocioArgHas('perm', { parsed: socio_args })) {//query requiers perm to execute
                    const verb = ParseQueryVerb(data.sql);
                    if(!verb)
                        throw new E (`Client ${client_id} sent an unrecognized SQL query first clause. [#verb-issue]`, data.sql);
                    
                    const tables = ParseQueryTables(data.sql);
                    if (!tables)
                        throw new E (`Client ${client_id} sent an SQL query without table names. [#table-name-issue]`, data.sql);
                    
                    if (!tables.every((t) => this.#sessions[client_id].HasPermFor(verb, t)))
                        throw new E (`Client ${client_id} tried to execute a perms query without having the required permissions. [#perm-issue]`, verb, tables);
                }
            }
            this.HandleInfo(`received [${kind}] from [${client_id}]`, data);

            //let the developer handle the msg
            if (this.#lifecycle_hooks.msg)
                if(this.#lifecycle_hooks.msg(client_id, kind, data))
                    return;

            switch (kind) {
                case 'REG':
                    this.#CheckClientID(client_id, kind)
                    this.#sessions[client_id].Send('UPD', {
                        id: data.id,
                        result: await this.Query(data)
                    })

                    //set up hook
                    if (QueryIsSelect(data.sql))
                        ParseQueryTables(data.sql).forEach(t => this.#sessions[client_id].RegisterHook(t, data.id, data.sql, data.params));

                    break;
                case 'SQL':
                    this.#CheckClientID(client_id, kind)
                    const is_select = QueryIsSelect(data.sql)

                    //have to do the query in every case
                    const res = this.Query(data)
                    if (is_select) //wait for result, if a result is expected, and send it back
                        this.#sessions[client_id].Send('SQL', { id: data.id, result: await res })

                    //if the sql wasnt a SELECT, but altered some resource, then need to propogate that to other connection hooks
                    if (!is_select)
                        this.Update(ParseQueryTables(data.sql))
                    
                    break;
                case 'PING': 
                    this.#CheckClientID(client_id, kind); 
                    this.#sessions[client_id].Send('PONG', { id: data?.id }); 
                    break;
                case 'AUTH'://client requests to authenticate itself with the server
                    this.#CheckClientID(client_id, kind)
                    if (this.#lifecycle_hooks.auth){
                        await this.#sessions[client_id].Authenticate(this.#lifecycle_hooks.auth, this.#sessions[client_id], data.params) //bcs its a private class field, give this function the hook to call and params to it. It will set its field and we can just read that off and send it back as the result
                        this.#sessions[client_id].Send('AUTH', { id: data.id, result: this.#sessions[client_id].authenticated == true }) //authenticated can be any truthy or falsy value, but the client will only receive a boolean, so its safe to set this to like an ID or token or smth for your own use
                    }else{
                        this.HandleError('Auth function hook not registered, so client not authenticated. [#no-auth-func]')
                        this.#sessions[client_id].Send('AUTH', { id: data.id, result: false })
                    }
                    break;
                case 'PERM':
                    this.#CheckClientID(client_id, kind)
                    if(this.#lifecycle_hooks?.grant_perm){
                        const granted = await this.#lifecycle_hooks?.grant_perm(client_id, data)
                        this.#sessions[client_id].Send('PERM', { id: data.id, result: { granted: granted === true, verb:data.verb, table:data.table} }) //the client will only receive a boolean, but still make sure to only return bools as well
                    }
                    else {
                        this.HandleError('grant_perm function hook not registered, so client not granted perm. [#no-grant_perm-func]')
                        this.#sessions[client_id].Send('PERM', { id: data.id, result: false })
                    }
                    break;
                case 'UNREG':
                    this.#CheckClientID(client_id, kind);
                    const res_1 = this.#sessions[client_id].UnRegisterHook(data.unreg_id);
                    this.#sessions[client_id].Send('UNREG', { id: data.id, result: res_1 === true }) 

                    break;
                // case '': break;
                default: throw new E(`Unrecognized message kind! [#msg-kind-issue]`, kind, data);
            }
        } catch (e) { this.HandleError(e); this.#sessions[client_id].Send('ERR', { id: data.id }) } //, cause: e.message
    }

    Update(tables=[]){
        if (this.#lifecycle_hooks.upd)
            if (this.#lifecycle_hooks.upd(this.#sessions, tables))
                return;

        try{
            //gather all sessions hooks sql queries that involve the altered tables
            const queries = {}
            Object.values(this.#sessions).forEach(s => {
                s.GetHooksForTables(tables).forEach(h => { //GetHooksQueriesForTables always returns array. If empty, then the foreach wont run, so each sql guaranteed to have hooks array
                    const obj = { id: h.id, params: h.params, session: s }
                    if(h.sql in queries)
                        queries[h.sql].push(obj)
                    else
                        queries[h.sql] = [obj]
                })
            })

            //asyncronously bombard the DB with queries. When they resolve, send the client the result.
            for (const [sql, hooks] of Object.entries(queries)){
                try{
                    //group the hooks based on SQL + PARAMS (to optimize DB mashing), since those queries would be identical, but the recipients most likely arent, so cant just dedup the array.
                    for (const group_hooks of GroupHooks(sql, hooks)){
                        this.Query({ sql: sql, params: group_hooks[0].params }) //grab the first ones params, since all params of hooks of a group should be the same. Seeing as this query is done on behalf of a bunch of sessions, then the other args cannot be provided.
                        .then(res => { //once the query completes, send out this result to all sessions that are subed to it
                            group_hooks.forEach(h => {
                                h.session.Send('UPD', {
                                    id: h.id,
                                    result: res
                                })
                            })
                        })
                    }
                } catch (e) { this.HandleError(e) }
            }
        } catch (e) { this.HandleError(e) }
    }

    #CheckClientID(client_id, kind){
        if (!(client_id in this.#sessions)) 
            throw new E('Message arrived, but client_id not in sessions. [#client_id-issue]', client_id, kind)
        this.#sessions[client_id].last_seen_now()
    }

    //when the server wants to send some data to a specific session client - can be any raw data
    SendTo(client_id='', data={}){
        try{
            if (client_id in this.#sessions)
                this.#sessions[client_id].Send('PUSH', data)
            else throw new E(`The provided session ID [${client_id}] was not found in the tracked web socket connections!`)
        } catch (e) { this.HandleError(e) }
    }
    Emit(data={}){
        switch(true){
            case data instanceof Blob: this.#wss.emit(data); break;
            // case data instanceof Object || data instanceof Array: this.#wss.emit(JSON.stringify({ kind: 'EMIT', data: data })); break;
            // case data instanceof Blob: this.#wss.emit(data); break;
            default: this.#wss.emit(JSON.stringify({ kind: 'EMIT', data: data })); break;
        }
    }

    RegisterLifecycleHookHandler(name='', handler=null){
        try{
            if (name in this.#lifecycle_hooks)
                this.#lifecycle_hooks[name] = handler
            else throw new E(`Lifecycle hook [${name}] does not exist!`)
        } catch (e) { this.HandleError(e) }
    }
    UnRegisterLifecycleHookHandler(name = '') {
        try{
            if (name in this.#lifecycle_hooks)
                delete this.#lifecycle_hooks[name]
            else throw new E(`Lifecycle hook [${name}] does not exist!`)
        } catch (e) { this.HandleError(e) }
    }
    get LifecycleHookNames(){
        return Object.keys(this.#lifecycle_hooks)
    }

    GetClientSession(client_id=''){
        return this.#sessions[client_id] || null
    }
}

//group the hooks based on SQL + PARAMS (to optimize DB mashing), since those queries would be identical, but the recipients most likely arent, so cant just dedup the array.
//the key is only needed for grouping into arrays. So returns just the values of the final object. Array of arrays (hooks).
function GroupHooks(sql='', hooks=[]){
    const grouped = {}
    for(const h of hooks){
        const key = sql + JSON.stringify(h.params)
        if(key in grouped)
            grouped[key].push(h)
        else
            grouped[key] = [h]
    }
    return Object.values(grouped)
}