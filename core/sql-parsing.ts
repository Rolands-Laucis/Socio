// To err is human; to persist in it - diabolial.  /Lucius Annaeus Seneca/
import { soft_error } from './logging.js';

export type SocioStringObj = { str: string, markers: string[] };
//socio template literal tag. Dummy function, that doesnt ever get used. See Socio <= 1.3.4 on github for a working implementation of this function.
export function socio(strings: TemplateStringsArray, ...vars) { return ''; }


//regex
export const socio_string_regex = /socio`(?<sql>.*?)`/igs;
// precompiled regex:
const table_extract_regex = '(?<tables>[\\w\\s\\.,_]+?)'
const Verb2TableRegex = {
    SELECT: RegExp('FROM' + table_extract_regex + '(?:WHERE|ON|USING|;|$)', 'mi'),
    INSERT: RegExp('INTO' + table_extract_regex + '(?:\\(|VALUES|DEFAULT)', 'i'),
    UPDATE: RegExp('UPDATE\\s+(?:OR\\s+(?:ABORT|FAIL|IGNORE|REPLACE|ROLLBACK))?' + table_extract_regex + 'SET', 'i')
}

//query helper functions
export function QueryIsSelect(sql: string): boolean {
    return /^(\s+)?SELECT/im.test(sql);
}

export function ParseQueryTables(q: string): string[] {
    const verb = ParseQueryVerb(q);
    if (!verb){
        soft_error(`Couldnt parse SQL verb.`, {sql_string:q, parsed_verb:verb});
        return [];
    }; //the verb must exist and be in Verb2TableRegex
    if(!Object.keys(Verb2TableRegex).includes(verb)){
        soft_error(`Parsed SQL verb not supported for table extraction!`, { sql_string: q, parsed_verb: verb, supported: Object.keys(Verb2TableRegex) });
        return [];
    }

    // use verb specific regex to extract the tables string
    let tables_str = q.match(Verb2TableRegex[verb])?.groups?.tables;
    // console.log(q, q.match(Verb2TableRegex[verb])); //debug
    if (!tables_str){
        soft_error(`SQL table extraction regex didnt match anything!`, { sql_string: q, parsed_verb: verb });
        return [];
    }

    // remove joins, but keep their referenced tables
    if(verb === 'SELECT')
        tables_str = tables_str.replaceAll(/(\s+)?(NATURAL|LEFT|RIGHT|FULL|INNER|CROSS|OUTER|JOIN)(\s+)?/gi, ',').replaceAll(/,+/g, ' , ').replaceAll(/\s+/g, ' ');
    
    // remove aliases
    tables_str = tables_str.replaceAll(/AS\s+\w+/g, '').trim();

    // if there are multiple tables, split them
    if(tables_str.includes(','))
        return tables_str
            .split(/,[\s]*/mig)
            .map((t) => t.split(/\s/mi)[0].trim()) || []
    else return [tables_str];
}

//always returns uppercase verb if found
export function ParseQueryVerb(q: string): string | null {
    return q.match(/^(\s+)?(?<verb>SELECT|INSERT|DROP|UPDATE|CREATE)/mi)?.groups?.verb?.toUpperCase() || null;
}