/**
 * table-scanner.js — SQL 脚本表引用扫描器
 *
 * 功能:
 *   1. 扫描当前文档，识别所有引用的物理表和临时表
 *   2. 区分物理表（FROM/JOIN 引用）和临时表（CREATE TABLE 定义）
 *   3. 从 CREATE TABLE (col1 INT, col2 VARCHAR) 提取字段结构
 *   4. 从 CREATE TABLE AS SELECT 推断字段结构
 *   5. 分析表间依赖关系
 */
'use strict';

const logger = require('./logger');

// ---- 关键字集合（用于过滤别名） ----
const KEYWORDS = new Set([
    'SELECT','FROM','WHERE','AND','OR','NOT','IN','EXISTS',
    'BETWEEN','LIKE','RLIKE','REGEXP','AS','ON','JOIN',
    'INNER','LEFT','RIGHT','FULL','CROSS','NATURAL','OUTER',
    'SEMI','ANTI','UNION','ALL','INTERSECT','EXCEPT','MINUS',
    'INSERT','INTO','VALUES','UPDATE','SET','DELETE',
    'CREATE','ALTER','DROP','TRUNCATE','REPLACE','MERGE',
    'GRANT','REVOKE','ORDER','GROUP','HAVING','LIMIT','OFFSET',
    'FETCH','FOR','ASC','DESC','CASE','WHEN','THEN','ELSE',
    'END','NULL','TRUE','FALSE','DISTINCT','ANY','SOME',
    'WITH','RECURSIVE','WINDOW','OVER','PARTITION','ROWS','RANGE',
    'UNBOUNDED','PRECEDING','FOLLOWING','CURRENT','ROW','LATERAL',
    'TABLE','VIEW','SCHEMA','DATABASE','TEMP','TEMPORARY',
    'BEGIN','CALL','COMMIT','ROLLBACK','SAVEPOINT',
    'DEFAULT','CASCADE','RESTRICT','PURGE','IF','COMMENT',
    'PRIMARY','KEY','FOREIGN','REFERENCES','INDEX','CONSTRAINT',
    'CHECK','UNIQUE','ADD','COLUMN','RENAME','TO',
    'IS','NOT','NULLS','FIRST','LAST',
    'ON', 'USING', 'NATURAL', 'INNER', 'CROSS', 'OUTER',
]);

/**
 * 清理文本：保护变量、字符串和注释
 */
function cleanText(text) {
    let clean = text;
    clean = clean.replace(/\$\{[^}]*\}(?:\.)?/g, m => ' '.repeat(m.length));
    clean = clean.replace(/'([^'\n]|'')*'/g, m => ' '.repeat(m.length));
    clean = clean.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
    clean = clean.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));
    return clean;
}

/**
 * 扫描 SQL 文本，提取所有引用的表
 *
 * @param {string} text - SQL 文档全文
 * @returns {{ physical: Map<string, TableRef>, temp: Map<string, TempTableDef>, deps: Dependency[] }}
 */
function scanTables(text) {
    const clean = cleanText(text);
    const physical = new Map();   // 物理表: name → { name, alias, range, source }
    const temp = new Map();       // 临时表: name → TempTableDef
    const deps = [];              // 依赖关系

    // ------ 1. 找 CREATE TABLE / CREATE TEMP TABLE ------
    const createRe = /\bCREATE\s+(?:TEMPORARY|TEMP|LOCAL\s+TEMPORARY|GLOBAL\s+TEMPORARY)?\s*TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_.]*)\b/gi;
    let m;
    while ((m = createRe.exec(clean)) !== null) {
        const tableName = m[1];
        const key = tableName.toLowerCase();
        const startIdx = m.index;

        // 找到 CREATE 结尾
        let endIdx = text.length;
        const semiIdx = text.indexOf(';', m.index);
        if (semiIdx !== -1) endIdx = semiIdx + 1;

        // 检查有没有下一个 CREATE/DROP 在前面
        const nextCreate = text.slice(m.index + 1).search(/\bCREATE\s/i);
        const nextDrop = text.slice(m.index + 1).search(/\bDROP\s/i);
        if (nextCreate !== -1) endIdx = Math.min(endIdx, m.index + 1 + nextCreate);
        if (nextDrop !== -1) endIdx = Math.min(endIdx, m.index + 1 + nextDrop);

        const createBlock = text.slice(startIdx, endIdx);

        // 解析字段
        let columns = [];
        // 模式A: CREATE TABLE (...) — 显式列定义
        const colDefMatch = createBlock.match(/\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z][a-zA-Z0-9_() ,]*?)(?:\s+(?:NOT\s+)?NULL|DEFAULT|PRIMARY|REFERENCES|,|\))/i);
        // 模式B: CREATE TABLE AS SELECT — 从 SELECT 推断
        const asSelectMatch = createBlock.match(/\bAS\s+(SELECT|WITH)\b/i);
        if (asSelectMatch) {
            // 从 SELECT 子句提取字段名
            columns = inferColumnsFromSelect(createBlock);
        } else {
            // 从括号内提取列定义
            columns = extractColumnsFromDef(createBlock);
        }

        // 检查 CREATE 内引用了哪些物理表（AS SELECT 中的源表）
        const referenced = [];
        if (asSelectMatch) {
            const srcTables = extractFromTables(createBlock);
            for (const st of srcTables) {
                referenced.push(st);
                deps.push({ from: tableName, to: st, type: 'SELECT' });
            }
        }

        temp.set(key, {
            name: tableName,
            isTemp: !!(m[0].match(/TEMP|TEMPORARY/i)),
            columns: columns,
            referencedTables: referenced,
            createBlock: createBlock,
        });
    }

    // ------ 2. 提取 FROM/JOIN/INTO 中的表 ------
    const fromTables = extractFromTables(clean);
    for (const t of fromTables) {
        const key = t.toLowerCase();
        // 跳过已定义的临时表
        if (temp.has(key)) continue;
        // 跳过别名（如果在同一行中有别名定义，但 handle 在别处）
        if (!physical.has(key)) {
            physical.set(key, { name: t, isTemp: false });
        }
    }

    // ------ 3. 解析别名引用依赖 ------
    // 检查别名的使用并关联依赖
    const aliasMap = parseAliasDefinitions(text);
    for (const [alias, def] of aliasMap) {
        const tblKey = def.tableName.toLowerCase();
        // 确保物理表存在
        if (!physical.has(tblKey) && !temp.has(tblKey)) {
            physical.set(tblKey, { name: def.tableName, isTemp: false });
        }
    }

    logger.debug(`[表扫描] 扫描完成: ${physical.size} 张物理表, ${temp.size} 张临时表`);

    return {
        physical: physical,
        temp: temp,
        deps: deps,
        getAllTableNames: function() {
            const names = new Set();
            for (const k of physical.keys()) names.add(k);
            for (const k of temp.keys()) names.add(k);
            return names;
        }
    };
}

/**
 * 提取 FROM/JOIN/INTO/UPDATE/TABLE 后的表名（无别名）
 */
function extractFromTables(text) {
    const clean = cleanText(text);
    const tables = [];
    const seen = new Set();
    const re = /(?:FROM|JOIN|INTO|UPDATE|TABLE|TRUNCATE|DESCRIBE|DESC)\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gi;
    let m;
    while ((m = re.exec(clean)) !== null) {
        const name = m[1];
        const key = name.toLowerCase();
        if (KEYWORDS.has(name.toUpperCase())) continue;
        if (!seen.has(key)) {
            seen.add(key);
            tables.push(name);
        }
    }
    // 也支持 FROM/JOIN 后面的子查询之后的别名
    const aliasRe = /(?:FROM|JOIN|,)\s+(?:\([^)]*\)\s+)?([a-zA-Z_][a-zA-Z0-9_.]*)\s+(?:(?:AS)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    while ((m = aliasRe.exec(clean)) !== null) {
        const name = m[1];
        const alias = m[2];
        const key = name.toLowerCase();
        if (KEYWORDS.has(name.toUpperCase())) continue;
        if (KEYWORDS.has(alias.toUpperCase())) continue;
        if (!seen.has(key)) {
            seen.add(key);
            tables.push(name);
        }
    }
    // 逗号分隔的多表: FROM table_a a, table_b b  或  FROM a, b, c
    const commaRe = /,\s*([a-zA-Z_][a-zA-Z0-9_.]*)(?:\s+(?:[a-zA-Z_][a-zA-Z0-9_]*))?/gi;
    while ((m = commaRe.exec(clean)) !== null) {
        const name = m[1];
        const key = name.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            tables.push(name);
        }
    }
    // 提取子查询后的别名: FROM (...) alias
    const subAliasRe = /FROM\s*\([^)]*\)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    while ((m = subAliasRe.exec(clean)) !== null) {
        const alias = m[1];
        const key = alias.toLowerCase();
        if (!KEYWORDS.has(alias.toUpperCase()) && !seen.has(key)) {
            // 子查询别名没有物理表名，跳过
        }
    }
    return tables;
}

/**
 * 从 CREATE TABLE AS SELECT 中推断字段
 */
function inferColumnsFromSelect(createBlock) {
    const columns = [];
    // 找到 SELECT 部分
    const selectMatch = createBlock.match(/\bSELECT\s+([\s\S]*?)(?:\bFROM\b|$)/i);
    if (!selectMatch) return columns;

    const selectClause = selectMatch[1];
    // 按逗号分割（保护括号内的逗号）
    const parts = splitByCommaOutsideParens(selectClause);
    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        // 处理 "expr AS alias" 或 "expr alias" 或 "expr"
        const asMatch = trimmed.match(/(?:\bAS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
        if (asMatch) {
            const name = asMatch[1];
            if (!KEYWORDS.has(name.toUpperCase())) {
                columns.push({ column_name: name, data_type: 'VARCHAR', nullable: true, source: 'inferred' });
            }
        } else {
            // 无别名的表达式字段，不添加（无法推断）
        }
    }
    return columns;
}

/**
 * 从 CREATE TABLE (col1 TYPE, col2 TYPE) 提取列定义
 */
function extractColumnsFromDef(createBlock) {
    const columns = [];
    // 找到括号内的内容
    const parenMatch = createBlock.match(/\(([\s\S]*?)\)\s*(?:\bAS\b|;|$)/);
    if (!parenMatch) return columns;

    const defs = splitByCommaOutsideParens(parenMatch[1]);
    for (const def of defs) {
        const trimmed = def.trim();
        if (!trimmed) continue;
        // pattern: col_name data_type [constraints]
        const match = trimmed.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z][a-zA-Z0-9_() ,]*?)(?:\s+(?:NOT\s+)?NULL\b|DEFAULT\s+\S+|PRIMARY\s+KEY|REFERENCES|,|$)/i);
        if (match) {
            const name = match[1];
            let dataType = match[2].trim().replace(/\s+/g, ' ');
            // 裁剪多出来的部分
            const extraIdx = dataType.search(/\b(?:NOT\s+NULL|DEFAULT|PRIMARY|REFERENCES)\b/i);
            if (extraIdx !== -1) dataType = dataType.slice(0, extraIdx).trim();

            const nullable = !/\bNOT\s+NULL\b/i.test(trimmed);
            columns.push({
                column_name: name,
                data_type: dataType || 'VARCHAR',
                nullable: nullable,
                source: 'explicit'
            });
        }
        // 处理 CONSTRAINT ... CHECK 等跳过
    }
    return columns;
}

/**
 * 按逗号分割，但保护括号内的逗号
 */
function splitByCommaOutsideParens(text) {
    const parts = [];
    let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ',' && depth === 0) {
            parts.push(text.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(text.slice(start));
    return parts;
}

/**
 * 解析表别名（复用 extension.js 的逻辑，提取为独立函数）
 */
function parseAliasDefinitions(text) {
    const aliasMap = new Map();
    let clean = text;
    clean = clean.replace(/\$\{[^}]*\}(?:\.)?/g, m => ' '.repeat(m.length));
    clean = clean.replace(/'([^'\n]|'')*'/g, m => ' '.repeat(m.length));
    clean = clean.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
    clean = clean.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));

    const tableAliasRe = /(?:FROM|JOIN|,)\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+(?:(AS)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*(?:,|JOIN|ON|WHERE|GROUP|HAVING|ORDER|LIMIT|LEFT|RIGHT|INNER|CROSS|FULL|NATURAL|$))/gi;
    let m;
    while ((m = tableAliasRe.exec(clean)) !== null) {
        const tableName = m[1];
        const alias = m[3];
        if (KEYWORDS.has(alias.toUpperCase())) continue;
        aliasMap.set(alias.toLowerCase(), { tableName });
    }
    return aliasMap;
}

module.exports = { scanTables, extractFromTables, inferColumnsFromSelect, extractColumnsFromDef };
