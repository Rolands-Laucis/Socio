// The greatest compliment that was ever paid me was when one asked me what I thought, and attended to my answer.  /Henry David Thoreau/

//https://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
/**
 * some default colors to pick from so to not memorize the format
 */
export const colors = {
    Reset: "\x1b[0m",
    // Bright: "\x1b[1m",
    // Dim: "\x1b[2m",
    // Underscore: "\x1b[4m",
    // Blink: "\x1b[5m",
    // Reverse: "\x1b[7m",
    // Hidden: "\x1b[8m",

    FgBlack: "\x1b[30m",
    // FgRed: "\x1b[31m",
    // FgGreen: "\x1b[32m",
    // FgYellow: "\x1b[33m",
    // FgBlue: "\x1b[34m",
    // FgMagenta: "\x1b[35m",
    // FgCyan: "\x1b[36m",
    FgWhite: "\x1b[37m",

    BgBlack: "\x1b[40m",
    BgRed: "\x1b[41m",
    BgGreen: "\x1b[42m",
    BgYellow: "\x1b[43m",
    // BgBlue: "\x1b[44m",
    // BgMagenta: "\x1b[45m",
    // BgCyan: "\x1b[46m",
    // BgWhite: "\x1b[47m"
}

//types
export type err = E | string | any;
export type LogHandlers = { [handler in "error" | "info" | "debug"]: Function | null; };
export type LoggerOptions = { log_handlers?: LogHandlers, verbose?: boolean, hard_crash?: boolean, prefix?: string, use_color?: boolean, log_level?:LogLevel};
export enum LogLevel{
    DEBUG, INFO, DONE, WARN, ERROR
};

//for my own error throwing, bcs i want to throw a msg + some objects maybe to log the current state of the program
export class E extends Error {
    logs: any[];

    constructor(msg = '', ...logs) {
        super(msg);
        this.logs = logs;
    }
}

//for extending my classes with standardized logging methods
export class LogHandler {
    //public:
    verbose: boolean;
    hard_crash: boolean;
    prefix: string;

    log_level: LogLevel = LogLevel.INFO;
    log_handlers: LogHandlers = { error: null, info: null, debug:null } //register your logger functions here. By default like this it will log to console, if verbose. It is recommended to turn off verbose in prod.    
    
    static use_color:boolean = true;

    constructor({ verbose = false, hard_crash = false, prefix = '', use_color = undefined, log_level = undefined, log_handlers = undefined }: LoggerOptions = {}){
        this.verbose = verbose;
        this.hard_crash = hard_crash;
        this.prefix = prefix;
        if (log_level !== undefined) this.log_level = log_level;
        if (log_handlers !== undefined) this.log_handlers = log_handlers;
        if(use_color !== undefined) LogHandler.use_color = use_color;
    }

    BaseLog(level:number, prefix: string, color: string, msg:string, ...args:any[]){
        if (level >= this.log_level)
            console.log(`${LogHandler.prefix(prefix, color)} ${msg}`, ...args);
    }

    HandleError(e: E | Error | undefined | string){ //e is of type class E ^
        if (this.hard_crash) throw e;
        if (this.log_handlers?.error && typeof this.log_handlers.error === 'function') this.log_handlers.error(e);
        if (this.verbose) {
            if(typeof e == 'string') this.soft_error(e);
            else if (typeof e == 'object')
                this.soft_error(e, ...("logs" in e ? e.logs : []));
        }
    }
    HandleInfo(...args: any[]){
        if (this.log_handlers?.info && typeof this.log_handlers.info === 'function') this.log_handlers.info(...args);
        //@ts-expect-error
        if (this.verbose) this.info(...args);
    }
    HandleDebug(...args: any[]){
        if (this.log_handlers?.debug && typeof this.log_handlers.debug === 'function') this.log_handlers.debug(...args);
        //@ts-expect-error
        if (this.verbose) this.info(...args);
    }

    static prefix(p:string, color:string) {return p ? `${LogHandler.use_color ? color : ''}[${p}]${LogHandler.use_color ? colors.Reset : ''}` : ''}
    static log(...args: any[]) { console.log(...args) }

    debug(msg: any, ...args: any[]) {
        this.BaseLog(LogLevel.DEBUG, this.prefix, '', msg, ...args);
    }
    static debug(msg: any, ...args: any[]) {
        console.debug(`[Socio DEBUG] ${msg}`, ...args);
    }

    info(msg:any, ...args:any[]) {
        this.BaseLog(LogLevel.INFO, this.prefix, colors.BgYellow + colors.FgBlack, msg, ...args);
    }
    static info(msg: any, ...args: any[]) {
        console.log(`${LogHandler.prefix('Socio', colors.BgYellow + colors.FgBlack)} ${msg}`, ...args);
    }
    
    done(msg: string, ...args: any[]) {
        this.BaseLog(LogLevel.DONE, this.prefix, colors.BgGreen + colors.FgBlack, msg, ...args);
    }
    static done(msg: string, ...args: any[]) {
        console.log(`${LogHandler.prefix('Socio', colors.BgGreen + colors.FgBlack)} ${msg}`, ...args);
    }

    soft_error(msg: any, ...args: any[]) {
        this.BaseLog(LogLevel.WARN, this.prefix + ' WARN', colors.BgRed + colors.FgBlack, msg);
        if (args)
            console.error(...args, '\n');
    }
    static soft_error(msg: any, ...args: any[]) {
        console.log(`${LogHandler.prefix(`Socio WARN`, colors.BgRed + colors.FgBlack)} ${msg}`);
        if (args)
            console.error(...args, '\n');
    }
    // error(msg: any, ...args: any[]) {
    //     this.BaseLog(LogLevel.ERROR, this.prefix + ' ERROR', colors.BgRed + colors.FgBlack, msg);
    //     if (args)
    //         console.log(...args, '\n');

    //     throw new Error(msg);
    // }
}

//static f wrappers for quick log writing
export function log(...args: any[]){LogHandler.log(...args)}
export function info(msg: string, ...args: any[]) { LogHandler.info(msg,...args) }
export function done(msg: string, ...args: any[]) { LogHandler.done(msg, ...args) }
export function soft_error(msg: string, ...args: any[]) { LogHandler.soft_error(msg, ...args) }