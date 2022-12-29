export type err = E | string | any;

//for my own error throwing, bcs i want to throw a msg + some objects maybe to log the current state of the program
export class E extends Error {
    logs: any[];

    constructor(msg = '', ...logs) {
        super(msg)
        this.logs = logs
    }
}

//for extending my classes with standardized logging methods
export class LogHandler {
    //public:
    log_handlers: { [key: string]: Function | null; } = { error: null, info: null } //register your logger functions here. By default like this it will log to console, if verbose. It is recommended to turn off verbose in prod.
    info:Function;
    error:Function;
    hard_crash:boolean;
    verbose: boolean;

    constructor(info_handler: Function = console.log, error_handler: Function = console.error, { verbose = false, hard_crash = false} = {}){
        this.info = info_handler;
        this.error = error_handler;
        this.verbose = verbose;
        this.hard_crash = hard_crash;
    }

    HandleError(e: E | Error | undefined | string) { //e is of type class E ^
        if (this.hard_crash) throw e

        if (this.log_handlers.error) this.log_handlers.error(e)
        else if (this.verbose) {
            if(typeof e == 'string')
                this.error(e)
            else if (typeof e == 'object')
                this.error(e, ...("logs" in e ? e.logs : []))
        }
    }
    HandleInfo(...args) {
        if (this.log_handlers.info) this.log_handlers.info(...args)
        else if (this.verbose) this.info(...args)
    }
}