import { socio_string_markers_regex, SocioStringParse } from './dist/utils.js';
import { socio_string_regex, ParseQueryTables, ParseQueryVerb, QueryIsSelect } from './dist/sql-parsing.js';
import { log, done, soft_error } from './dist/logging.js';

const test_cases = ['table_parsing']
const all = false;
const stats = {ran:0, success:0, fail:0}

/**
 * Testing function for single values
 * @param {string} name
 * @param generated
 * @param expected
 */
function test(name, generated, expected) {
    stats.ran += 1;
    if (generated === expected){
        done(`✔️\t${name}`)
        stats.success += 1;
    }
    else{
        soft_error(`${name}\tGOT:\n`, generated, '\nBUT EXPECTED\n', expected)
        stats.fail += 1;
    }
}

function test_obj(name, generated, expected) {
    stats.ran += 1;
    if (JSON.stringify(generated) === JSON.stringify(expected)){
        stats.success += 1;
        done(`✔️\t${name}`)
    }
    else{
        stats.fail += 1;
        soft_error(`${name}\tGOT:\n`, generated, '\nBUT EXPECTED\n', expected)
    }
}

if (test_cases.includes('socio_regex') || all){
    log('📝', 'Testing socio security socio string regex finder...')

    let str = 'SELECT * FROM Users;--socio';
    test('socio marker', [...`socio\`${str}\``.matchAll(socio_string_regex)][0]?.groups?.sql, str);

    str = 'SELECT * FROM Users;'
    test('without socio marker', [...`socio\`${str}\``.matchAll(socio_string_regex)][0]?.groups?.sql, str);

    str = 'SELECT * FROM Users'
    test('without end ;', [...`socio\`${str}\``.matchAll(socio_string_regex)][0]?.groups?.sql, str);

    str = 'SELECT * FROM Users;'
    test('wrong string literal quote \'', [...`socio\'${str}\'`.matchAll(socio_string_regex)][0]?.groups?.sql, undefined);

    str = 'SELECT * FROM Users;'
    test('wrong string literal quote \"', [...`socio\"${str}\"`.matchAll(socio_string_regex)][0]?.groups?.sql, undefined);

    str = `SELECT * FROM Users;
            SELECT * FROM Users;`
    test('multiline sql', [...`socio\`${str}\``.matchAll(socio_string_regex)][0]?.groups?.sql, str);

    str = `SELECT * FROM Users;
            SELECT * FROM Users;`;
    test('multiline sql with surrounding garbo', [...`hasgdajhs asgdjhas socio\`${str}\` ajshdkaj asjdaj`.matchAll(socio_string_regex)][0]?.groups?.sql, str);
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

    // https://www.sqlite.org/lang_select.html
    let str = 'SELECT * FROM Users;--socio;'
    test_obj('single table', ParseQueryTables(str), ['Users']);

    str = 'SELECT * FROM Users WHERE something;'
    test_obj('single table with where', ParseQueryTables(str), ['Users']);

    str = 'SELECT * FROM Users'
    test_obj('single table without ending ;', ParseQueryTables(str), ['Users']);

    str = 'SELECT name FROM Users;';
    test_obj('select with column name', ParseQueryTables(str), ['Users']);

    str = 'SELECT name, num FROM Users;';
    test_obj('select with multiple column names', ParseQueryTables(str), ['Users']);

    str = 'SELECT name, num FROM Users, Numbers;';
    test_obj('select with column names and multiple tables', ParseQueryTables(str), ['Users', 'Numbers']);

    str = 'SELECT u.name FROM Users AS u;';
    test_obj('select tables with alias', ParseQueryTables(str), ['Users']);

    str = 'SELECT u.name, n.num FROM Users AS u, Numbers AS n;';
    test_obj('select with column names and multiple tables with aliases', ParseQueryTables(str), ['Users', 'Numbers']);

    str = 'SELECT DISTINCT u.name FROM Users AS u, Numbers AS n;';
    test_obj('SELECT DISTINCT with column names and multiple tables with aliases', ParseQueryTables(str), ['Users', 'Numbers']);

    str = 'SELECT employee_id FROM table1 INNER JOIN table2 ON table1.position_id = table2.position_id;';
    test_obj('SELECT INNER JOIN', ParseQueryTables(str), ['table1', 'table2']);

    str = 'SELECT employee_id FROM table1 LEFT OUTER JOIN table2 ON table1.column = table2.column; ';
    test_obj('SELECT LEFT OUTER JOIN', ParseQueryTables(str), ['table1', 'table2']);

    str = 'SELECT employee_id FROM table1 NATURAL LEFT OUTER JOIN table2 ON table1.column = table2.column; ';
    test_obj('SELECT NATURAL LEFT OUTER JOIN', ParseQueryTables(str), ['table1', 'table2']);

    str = 'SELECT employee_id FROM table1 CROSS JOIN table2 ON table1.column = table2.column; ';
    test_obj('SELECT CROSS JOIN', ParseQueryTables(str), ['table1', 'table2']);

    // https://www.sqlite.org/lang_insert.html
    str = 'INSERT INTO Users VALUES("bob");';
    test_obj('INSERT', ParseQueryTables(str), ['Users']);

    str = 'INSERT INTO Users (name) VALUES("bob");';
    test_obj('INSERT with columns', ParseQueryTables(str), ['Users']);

    str = 'INSERT OR ABORT INTO Users AS u (name, num) VALUES("bob", 420);';
    test_obj('complex INSERT', ParseQueryTables(str), ['Users']);

    // https://www.sqlite.org/lang_update.html
    str = 'UPDATE Users SET name = "bob";';
    test_obj('UPDATE', ParseQueryTables(str), ['Users']);

    str = 'UPDATE OR ABORT Users SET name = "bob";';
    test_obj('complex UPDATE', ParseQueryTables(str), ['Users']);

    // https://www.sqlite.org/lang_altertable.html
    str = 'ALTER TABLE Users ADD n INT;';
    test_obj('ALTER', ParseQueryTables(str), ['Users']);

    // https://www.sqlite.org/lang_createtable.html
    str = 'CREATE TABLE Users;';
    test_obj('CREATE', ParseQueryTables(str), ['Users']);

    str = 'CREATE TEMP TABLE Users;';
    test_obj('CREATE temp', ParseQueryTables(str), ['Users']);

    str = 'CREATE TABLE IF NOT EXISTS Users;';
    test_obj('CREATE', ParseQueryTables(str), ['Users']);

    str = 'CREATE TABLE Users AS (...);';
    test_obj('CREATE as', ParseQueryTables(str), ['Users']);

    str = 'CREATE TABLE Users (name VARCHAR(50));';
    test_obj('CREATE with fields', ParseQueryTables(str), ['Users']);

    // https://www.sqlite.org/lang_droptable.html
    str = 'DROP TABLE Users;';
    test_obj('DROP', ParseQueryTables(str), ['Users']);

    str = 'DROP TABLE Users';
    test_obj('DROP no ending ;', ParseQueryTables(str), ['Users']);

    str = 'DROP TABLE IF EXISTS Users;';
    test_obj('DROP if exists', ParseQueryTables(str), ['Users']);
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

log(stats);