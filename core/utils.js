export function QueryIsSelect(sql = '') {
    return /^SELECT/im.test(sql)
}

export function ParseSQLForTables(sql = '') {
    return sql
        .match(/(?:FROM|INTO)[\s\n\t](?<tables>[\w,\s\n\t]+?)[\s\n\t]?(?:WHERE|VALUES|;|LIMIT|GROUP|ORDER)/mi)
        ?.groups?.tables
        .split(/,[\s\n\t\r]*/mig)
        .map((t) => t.split(/[\s\n\t\r]/mi)[0].trim()) || []
}