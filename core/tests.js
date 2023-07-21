import { socio_string_regex, socio_string_markers_regex, SocioStringParse, ParseQueryTables, ParseQueryVerb, QueryIsSelect } from './dist/utils.js';
import { log, done, soft_error } from './dist/logging.js';

const test_cases = ['socio_regex']
const all = true

/**
 * Testing function for single values
 * @param {string} name
 * @param generated
 * @param expected
 */
function test(name, generated, expected) {
    if (generated === expected)
        done(`✔️\t${name}`)
    else
        soft_error(`${name}\tGOT:\n`, generated, '\nBUT EXPECTED\n', expected)
}

function test_obj(name, generated, expected) {
    if (JSON.stringify(generated) === JSON.stringify(expected))
        done(`✔️\t${name}`)
    else
        soft_error(`${name}\tGOT:\n`, generated, '\nBUT EXPECTED\n', expected)
}

if (test_cases.includes('socio_regex') || all){
    log('📝', 'Testing socio security socio string regex finder...')

    let str = 'SELECT * FROM Users;--socio'
    test('socio marker', `socio\`${str}\``.match(socio_string_regex)?.groups?.sql, str);

    str = 'SELECT * FROM Users;'
    test('without socio marker', `socio\`${str}\``.match(socio_string_regex)?.groups?.sql, str);

    str = 'SELECT * FROM Users'
    test('without end ;', `socio\`${str}\``.match(socio_string_regex)?.groups?.sql, str);

    str = 'SELECT * FROM Users;'
    test('wrong string literal quote \'', `socio\'${str}\'`.match(socio_string_regex)?.groups?.sql, undefined);

    str = 'SELECT * FROM Users;'
    test('wrong string literal quote \"', `socio\"${str}\"`.match(socio_string_regex)?.groups?.sql, undefined);

    str = `SELECT * FROM Users;
            SELECT * FROM Users;`
    test('multiline sql', `socio\`${str}\``.match(socio_string_regex)?.groups?.sql, str);

    str = `SELECT * FROM Users;
            SELECT * FROM Users;`
    test('multiline sql with surrounding garbo', `hasgdajhs asgdjhas socio\`${str}\` ajshdkaj asjdaj`.match(socio_string_regex)?.groups?.sql, str);
}

if (test_cases.includes('marker_parsing') || all) {
    log('📝', 'Testing socio security socio string marker parsing...')

    let str = 'SELECT * FROM Users;--socio;'
    test_obj('socio marker', SocioStringParse(str).markers, ['socio']);

    str = 'SELECT * FROM Users;--socio-auth;'
    test_obj('socio auth marker', SocioStringParse(str).markers, ['socio', 'auth']);

    str = 'SELECT * FROM Users;--socio-perm;'
    test_obj('socio perm marker', SocioStringParse(str).markers, ['socio', 'perm']);

    str = 'SELECT * FROM Users;--socio-auth-perm;'
    test_obj('socio auth and perm marker', SocioStringParse(str).markers, ['socio', 'auth', 'perm']);

    str = 'SELECT * FROM Users --socio-auth-perm;'
    test_obj('socio auth and perm marker without ; at the end of the query', SocioStringParse(str).markers, ['socio', 'auth', 'perm']);
}

if (test_cases.includes('table_parsing') || all) {
    log('📝', 'Testing socio security socio string table parsing...')

    let str = 'SELECT * FROM Users;--socio;'
    test_obj('single table', ParseQueryTables(str), ['Users']);

    str = 'SELECT * FROM Users WHERE something;'
    test_obj('single table with where', ParseQueryTables(str), ['Users']);

    str = 'SELECT * FROM Users'
    test_obj('single table without ending ;', ParseQueryTables(str), ['Users']);

    str = 'SELECT name, num FROM Users;';
    test_obj('multiple column names', ParseQueryTables(str), ['Users']);

    str = 'SELECT name, num FROM Users, Numbers;';
    test_obj('with column names and multiple tables', ParseQueryTables(str), ['Users', 'Numbers']);

    str = 'SELECT u.name FROM Users as u;';
    test_obj('tables with alias', ParseQueryTables(str), ['Users']);

    str = 'SELECT u.name, n.num FROM Users as u, Numbers as n;';
    test_obj('with column names and multiple tables with aliases', ParseQueryTables(str), ['Users', 'Numbers']);
}

if (test_cases.includes('verb_parsing') || all) {
    log('📝', 'Testing socio security socio string verb parsing...')

    let str = 'SELECT * FROM Users;--socio;'
    test('SELECT', ParseQueryVerb(str), 'SELECT');

    str = 'select * FROM Users;--socio;'
    test('SELECT lowercase', ParseQueryVerb(str), 'SELECT');

    str = `
    SELECT
     * 
    FROM Users;
    `
    test('SELECT multiline', ParseQueryVerb(str), 'SELECT');

    str = 'INSERT * FROM Users;--socio;'
    test('insert', ParseQueryVerb(str), 'INSERT');

    str = 'UPDATE * FROM Users;--socio;'
    test('UPDATE', ParseQueryVerb(str), 'UPDATE');

    str = 'DROP * FROM Users;--socio;'
    test('DROP', ParseQueryVerb(str), 'DROP');

    str = 'CREATE * FROM Users;--socio;'
    test('CREATE', ParseQueryVerb(str), 'CREATE');
}

if (test_cases.includes('select_query_parsing') || all) {
    log('📝', 'Testing socio security socio string is se;ect parsing...')

    let str = 'SELECT * FROM Users;--socio;'
    test('SELECT', QueryIsSelect(str), true);

    str = 'select * FROM Users;--socio;'
    test('SELECT lowercase', QueryIsSelect(str), true);

    str = `
    SELECT
     * 
    FROM Users;
    `
    test('SELECT multiline', QueryIsSelect(str), true);

    str = 'INSERT * FROM Users;--socio;'
    test('insert', QueryIsSelect(str), false);
}