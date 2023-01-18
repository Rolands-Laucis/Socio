//You can always count on Americans to do the right thing - after they've tried everything else. /Winston Churchill/

import { LogHandler } from "./logging.js";

type RateLimitTimeUnit = { ms?: number, seconds?: number, minutes?: number }
export type RateLimit = { n: number } & RateLimitTimeUnit; //in ms, bcs js (new Date()).getTime() returns ms, and converting every time would be a performance hit

//the idea is to get 2 "pins" on a timeline - 1. some clock start ms since epoch, 2. now ms since epoch
//and test how many checks happened between the two - no background clocks or processes, only stores 2 integers + original ratelimit settings
//the start clock is reset to now, when a new check is performed and now - start > limit time range
export class RateLimiter extends LogHandler {
    rl:RateLimit;
    count:number = 0;
    last_time_ms:number = 0;

    constructor(rl:RateLimit){
        super({ verbose:false, prefix: 'RateLimiter' });
        
        if(!rl) throw 'No RateLimit object provided';

        //convert formats to ms, since that will be way more performance efficient for functions
        if(rl?.seconds)
            rl.ms = rl.seconds * 1000;
        if (rl?.minutes)
            rl.ms = rl.minutes * 60 * 1000;
        if (!rl?.ms) throw 'No RateLimit ms provided';
        
        //remove, since they are just convenience formats
        delete rl?.seconds;
        delete rl?.minutes;

        this.rl = rl;
        this.StartNewTimer();
    }

    //returns true when over limit
    CheckLimit():boolean{
        const now = (new Date()).getTime(); //in ms

        //@ts-ignore
        if (now - this.last_time_ms > this.rl.ms){
            this.StartNewTimer();
            return false;
        }
        else if(this.count >= this.rl.n)
            return true;

        this.count++;
        return false
    }

    StartNewTimer(){
        this.last_time_ms = (new Date()).getTime();
        this.count = 0;
    }
}