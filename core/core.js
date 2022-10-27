//Nullum magnum ingenium sine mixture dementia fuit. - There has been no great wisdom without an element of madness.

import { log, error, info, setPrefix} from '@rolands/log'
import { randomUUID } from 'crypto'
import { WebSocketServer } from 'ws'; //https://github.com/websockets/ws https://github.com/websockets/ws/blob/master/doc/ws.md
//https://stackoverflow.com/questions/16280747/sending-message-to-a-specific-connected-users-using-websocket

export class SessionManager{
    constructor(opts = {}, DB_query_callback = null, { verbose = false } = {}){
        setPrefix('Totum') //for my logger

        const wss = new WebSocketServer(opts); //take a look at the WebSocketServer docs - the opts can have a server param, that can be your http server
        this.sessions = {} //ses_id:websocket
        this.Query = DB_query_callback
        this.verbose = verbose

        wss.on('connection', this.Connect.bind(this)); //https://thenewstack.io/mastering-javascript-callbacks-bind-apply-call/ have to bind 'this' to the function, otherwise it will use the .on()'s 'this', so that this.[prop] are not undefined
        wss.on('close', (...stuff) => { info('WebSocketServer close event', ...stuff) });
        wss.on('error', (...stuff) => { error('WebSocketServer error event', ...stuff)});
    }

    async Connect(conn, req){
        const ses_id = randomUUID()
        this.sessions[ses_id] = new Session(ses_id, conn)
        conn.send(JSON.stringify(['CON', ses_id]));
        log('CON', ses_id)

        conn.on('message', this.Message.bind(this));
        conn.on('close', () => {
            log('DISCON', ses_id)
            delete this.sessions[ses_id]
        });
    }

    async Message(req, head){
        const [ses_id, kind, data] = JSON.parse(req.toString())
        if (this.verbose) log(`received [${kind}] from [${ses_id}]: `, data);

        switch (kind) {
            case 'REG':
                if(ses_id in this.sessions)
                    this.sessions[ses_id].Send(['UPD', { sql: data.sql, result: await this.Query(data.sql, data.params) }])

                //set up hook
                if (QueryUtils.QueryIsSelect(data.sql))
                    QueryUtils.ParseSQLForTables(data.sql).forEach(t => this.sessions[ses_id].RegisterHook(t, data.sql, data.params));

                break;
            case 'SQL':
                const is_select = QueryUtils.QueryIsSelect(data.sql)
                if (ses_id in this.sessions){
                    const res = this.Query(data.sql, data.params)
                    if (is_select) //wait for result
                        this.sessions[ses_id].Send(['SQL', { sql: data.sql, result: await res }])
                }
                    
                //if the sql wasnt a SELECT, but altered some resource, then need to propogate that to other connection hooks
                if (!is_select)
                    this.Update(QueryUtils.ParseSQLForTables(data.sql))
                    
                break;
            // case '': break;
            default: log(`Unrecognized message kind! [${kind}] with data:`, data);
        }
    }

    //OPTIMIZATION dont await the query, but queue up all of them on another thread then await and send there
    async Update(tables=[]){
        Object.values(this.sessions).forEach(async (s) => {
            tables.forEach(async (t) => {
                if(t in s.hooks)
                    for await (const data of s.hooks[t]){
                        s.Send(['UPD', { sql: data.sql, result: (await this.Query(data.sql, data.params)) }])
                    }
            })
        })
    }
}


//Homo vitae commodatus non donatus est. - Man's life is lent, not given. /Syrus/
class Session{
    constructor(session_id='', browser_ws_conn){
        this.id = session_id
        this.ws = browser_ws_conn
        this.hooks = {} //table_name:[sql]
    }

    RegisterHook(table='', sql='', params=null){ //TODO this is actually very bad
        if (table in this.hooks && !this.hooks[table].find((t) => t.sql == sql && t.params == params))
            this.hooks[table].push({ sql: sql, params: params })
        else
            this.hooks[table] = [{ sql:sql, params:params}]
        log('reg hook', table, this.hooks[table])
    }

    Send(data){
        this.ws.send(JSON.stringify(data))
    }
}


class QueryUtils{
    static QueryIsSelect(sql = '') {
        return /^SELECT/im.test(sql)
    }

    static ParseSQLForTables(sql = '') {
        return sql
            .match(/(?:FROM|INTO)[\s\n\t](?<tables>[\w,\s\n\t]+)[\s\n\t]?(?:WHERE|VALUES|;|LIMIT|GROUP|ORDER)/mi)
            ?.groups?.tables
            .split(/,[\s\n\t\r]*/mig)
            .map((t) => t.split(/[\s\n\t\r]/mi)[0].trim()) || []
    }
}