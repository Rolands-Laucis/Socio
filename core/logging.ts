// The greatest compliment that was ever paid me was when one asked me what I thought, and attended to my answer.  /Henry David Thoreau/

//https://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
/**
 * some default colors to pick from so to not memorize the format
 */
export const colors = {
    Reset: "\x1b[0m",
    Bright: "\x1b[1m",
    Dim: "\x1b[2m",
    Underscore: "\x1b[4m",
    Blink: "\x1b[5m",
    Reverse: "\x1b[7m",
    Hidden: "\x1b[8m",

    FgBlack: "\x1b[30m",
    FgRed: "\x1b[31m",
    FgGreen: "\x1b[32m",
    FgYellow: "\x1b[33m",
    FgBlue: "\x1b[34m",
    FgMagenta: "\x1b[35m",
    FgCyan: "\x1b[36m",
    FgWhite: "\x1b[37m",

    BgBlack: "\x1b[40m",
    BgRed: "\x1b[41m",
    BgGreen: "\x1b[42m",
    BgYellow: "\x1b[43m",
    BgBlue: "\x1b[44m",
    BgMagenta: "\x1b[45m",
    BgCyan: "\x1b[46m",
    BgWhite: "\x1b[47m"
}

//types
export type err = E | string | any;
export type LogHandlerOptions = { info_handler?: Function, error_handler?: Function | null, verbose?: boolean, hard_crash?: boolean, prefix?:string, use_color?: boolean};

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
    hard_crash:boolean;
    verbose: boolean;
    use_prefix:string;
    static use_color:boolean = true;

    constructor({ verbose = false, hard_crash = false, prefix = '', use_color = undefined, info_handler = null, error_handler = null } = {}){
        this.log_handlers.info = info_handler;
        this.log_handlers.error = error_handler;
        this.verbose = verbose;
        this.hard_crash = hard_crash;
        this.use_prefix = prefix;
        if(use_color !== undefined) LogHandler.use_color = use_color;
    }

    HandleError(e: E | Error | undefined | string) { //e is of type class E ^
        if (this.hard_crash) throw e;
        if (this.log_handlers?.error) this.log_handlers.error(e);
        if (this.verbose) {
            if(typeof e == 'string') this.soft_error(e);
            else if (typeof e == 'object')
                this.soft_error(e, ...("logs" in e ? e.logs : []));
        }
    }
    HandleInfo(...args: any[]) {
        if (this.log_handlers.info) this.log_handlers.info(...args);
        //@ts-expect-error
        if (this.verbose) this.info(...args);
    }

    static prefix(p:string, color:string) {return p ? `${LogHandler.use_color ? color : ''}[${p}]${LogHandler.use_color ? colors.Reset : ''}` : ''}
    static log(...args: any[]) { console.log(...args) }

    info(msg:any, ...args:any[]) {
        console.log(`${LogHandler.prefix(this.use_prefix, colors.BgYellow)} ${msg}`, ...args);
    }
    static info(msg: any, ...args: any[]) {
        console.log(`${LogHandler.prefix('Socio', colors.BgYellow)} ${msg}`, ...args);
    }
    
    done(msg: string, ...args: any[]) {
        console.log(`${LogHandler.prefix(this.use_prefix, colors.BgGreen)} ${msg}`, ...args);
    }
    static done(msg: string, ...args: any[]) {
        console.log(`${LogHandler.prefix('Socio', colors.BgGreen)} ${msg}`, ...args);
    }

    error(msg: any, ...args: any[]) {
        console.log(`${LogHandler.prefix(`${this.use_prefix} ERROR`, colors.BgRed + colors.FgWhite)} ${msg}`);
        if (args)
            console.log(...args, '\n');

        throw new Error(msg);
    }
    soft_error(msg: any, ...args: any[]) {
        console.log(`${LogHandler.prefix(`${this.use_prefix} ERROR`, colors.BgRed + colors.FgWhite)} ${msg}`);
        if (args)
            console.log(...args, '\n');
    }
    static soft_error(msg: any, ...args: any[]) {
        console.log(`${LogHandler.prefix(`Socio ERROR`, colors.BgRed + colors.FgWhite)} ${msg}`);
        if (args)
            console.log(...args, '\n');
    }
}

//static f wrappers for quick log writing
export function log(...args){LogHandler.log(...args)}
export function info(msg:string, ...args) { LogHandler.info(msg,...args) }
export function done(msg: string, ...args) { LogHandler.done(msg, ...args) }
export function soft_error(msg: string, ...args) { LogHandler.soft_error(msg, ...args) }