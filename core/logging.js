//for my own error throwing, bcs i want to throw a msg + some objects maybe to log the current state of the program
export class E extends Error {
    constructor(msg = '', ...logs) {
        super(msg)
        this.logs = logs
    }
}

//for extending my classes with standardized logging methods
export class LogHandler {
    //public:
    log_handlers = { error: null, info: null } //register your logger functions here. By default like this it will log to console, if verbose. It is recommended to turn off verbose in prod.
    
    constructor(info_handler, error_handler){
        this.info = info_handler
        this.error = error_handler
    }

    HandleError(e) { //e is of type class E ^
        if (this.hard_crash) throw e

        if (this.log_handlers.error) this.log_handlers.error(e)
        else if (this.verbose) this.error(e)
    }
    HandleInfo(...args) {
        if (this.log_handlers.info) this.log_handlers.info(...args)
        else if (this.verbose) this.info(...args)
    }
}