import { string_regex, socio_string_regex, SocioStringParse, ParseQueryTables, ParseQueryVerb, QueryIsSelect } from './dist/utils.js'
import { log, done, soft_error } from './dist/logging.js'

const test_cases = ['select_query_parsing']
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

//test socio security regexes
if (test_cases.includes('string_regex') || all) {
    log('📝', 'Testing socio security string extraction regex...')

    let str = '\'SELECT * FROM Users;\'';
    test('simplest', str.match(string_regex)[0], '\'SELECT * FROM Users;\'');

    str = '"SELECT * FROM Users;"';
    test('simplest with "', str.match(string_regex)[0], '"SELECT * FROM Users;"');

    str = '`SELECT * FROM Users;`';
    test('simplest with `', str.match(string_regex)[0], '`SELECT * FROM Users;`');

    str = 'with clutter "dfgdf" `SELECT * FROM Users;`with clutter \'dfgdf\' ';
    test('simplest with clutter ', str.match(string_regex)[1], '`SELECT * FROM Users;`');

    str = `
    with clutter "dfgdf" 
    "SELECT * FROM Users;"
    with clutter \'dfgdf\' 
    `;
    test('simplest with clutter and new lines', str.match(string_regex)[1], '"SELECT * FROM Users;"');

    str = `
    with clutter "dfgdf" 
    \`
        SELECT * 
        FROM Users;
    \`
    with clutter \'dfgdf\' 
    `;
    test('simplest with clutter and new lines and tabs inside string', str.match(string_regex)[1], `\`
        SELECT * 
        FROM Users;
    \``);
}

if (test_cases.includes('socio_regex') || all){
    log('📝', 'Testing socio security socio string marker extraction regex...')

    let str = 'SELECT * FROM Users;--socio;'
    test('socio marker', str.match(socio_string_regex)?.groups?.marker, '--socio');

    str = 'SELECT * FROM Users--socio;'
    test('socio marker without ending semicolon', str.match(socio_string_regex)?.groups?.marker, '--socio');

    str = 'SELECT * FROM Users;--socio-auth;'
    test('socio auth marker', str.match(socio_string_regex)?.groups?.marker, '--socio-auth');

    str = 'SELECT * FROM Users;--socio-perm;'
    test('socio perm marker', str.match(socio_string_regex)?.groups?.marker, '--socio-perm');

    str = 'SELECT * FROM Users;--socio-auth-perm;'
    test('socio auth and perm marker', str.match(socio_string_regex)?.groups?.marker, '--socio-auth-perm');

    str = `
    SELECT * 
    FROM Users;--socio-auth-perm;
    `
    test_obj('multiline 1', str.match(socio_string_regex)?.groups, {
        str: `
    SELECT * 
    FROM Users;`, marker: '--socio-auth-perm' });

    str = `
    SELECT * 
    FROM Users
    --socio-auth-perm;
    `
    test_obj('multiline 2', str.match(socio_string_regex)?.groups, {
        str: `
    SELECT * 
    FROM Users
    `, marker: '--socio-auth-perm'
    });

    str = `
    SELECT * 
    FROM Users
        --socio-auth-perm
    ;
    `
    test_obj('multiline 3', str.match(socio_string_regex)?.groups, {
        str: `
    SELECT * 
    FROM Users
        `, marker: '--socio-auth-perm'
    });

    str = `
    SELECT * 
    FROM Users;--socio-auth-perm;
    `
    test_obj('multiline 4', str.match(socio_string_regex)?.groups, {
        str: `
    SELECT * 
    FROM Users;`, marker: '--socio-auth-perm'
    });
}

if (test_cases.includes('marker_parsing') || all) {
    log('📝', 'Testing socio security socio string marker parsing...')

    let str = 'SELECT * FROM Users;--socio;'
    test_obj('socio marker', SocioStringParse(str), { str: 'SELECT * FROM Users;', markers: ['socio'] });

    str = 'SELECT * FROM Users;--socio-auth;'
    test_obj('socio auth marker', SocioStringParse(str), { str: 'SELECT * FROM Users;', markers: ['socio', 'auth'] });

    str = 'SELECT * FROM Users;--socio-perm;'
    test_obj('socio perm marker', SocioStringParse(str), { str: 'SELECT * FROM Users;', markers: ['socio', 'perm'] });

    str = 'SELECT * FROM Users;--socio-auth-perm;'
    test_obj('socio auth and perm marker', SocioStringParse(str), { str: 'SELECT * FROM Users;', markers: ['socio', 'auth', 'perm'] });
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