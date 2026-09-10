/**
 * alias-parser.js — 别名解析 & CREATE TABLE 定义解析
 *
 * 从 extension.js 拆分而来，提供通用的文档解析功能。
 */
'use strict';

const vscode = require('vscode');
const { getCached } = require('./doc-cache');

// ---- 关键字集合（用于过滤） ----
const KEYWORDS = require('./keywords');

/**
 * 保护注释、字符串、变量，防止误匹配
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
 * 判断位置是否位于注释、字符串或 ${变量} 内部
 *
 * 用途：hover / 定义跳转 不应在注释/字符串内触发（例如注释里恰好出现与
 * 别名同名的单词，如 `--800_B_CDINFO_D` 里的 B，不应跳转到别名定义）。
 *
 * 用轻量状态机从文档头扫到光标偏移（O(n) 线性扫描，无正则回溯）。
 *
 * @param {vscode.TextDocument} document
 * @param {vscode.Position} position
 * @returns {boolean}
 */
function isPositionInCommentOrString(document, position) {
    const text = document.getText();
    const offset = document.offsetAt(position);
    // 0 普通 / 1 行注释 / 2 块注释 / 3 字符串 / 4 ${变量}
    let state = 0, i = 0;
    while (i < offset) {
        const ch = text[i];
        const next = text[i + 1];
        if (state === 0) {
            if (ch === '-' && next === '-') { state = 1; i += 2; }
            else if (ch === '/' && next === '*') { state = 2; i += 2; }
            else if (ch === "'") { state = 3; i++; }
            else if (ch === '$' && next === '{') { state = 4; i += 2; }
            else i++;
        } else if (state === 1) {
            if (ch === '\n') state = 0;
            i++;
        } else if (state === 2) {
            if (ch === '*' && next === '/') { state = 0; i += 2; }
            else i++;
        } else if (state === 3) {
            if (ch === "'") {
                if (next === "'") { i += 2; }          // '' 转义
                else { state = 0; i++; }
            } else if (ch === '\n') { state = 0; i++; } // 字符串不跨行
            else i++;
        } else if (state === 4) {
            if (ch === '}') { state = 0; i++; }
            else i++;
        }
    }
    return state !== 0;
}

/**
 * 解析文档中所有表别名定义（按 uri+version 缓存）
 * 返回 Map: 别名(小写) → { tableName, tableRange, aliasRange, hasAS }
 * 支持: FROM table_name alias, JOIN table_name AS alias
 *
 * @param {vscode.TextDocument} document
 * @returns {Map<string, Object>}
 */
function parseAliasDefinitions(document) {
    return getCached(document, computeAliasDefinitions, 'aliasDefinitions');
}

/**
 * 找到 offset 所在语句的范围 [start, end)
 * 以 clean 文本的分号为界（注释/字符串内的分号已被 cleanText 屏蔽）
 */
function statementRangeAt(clean, offset) {
    let start = 0;
    for (let i = 0; i < clean.length && i < offset; i++) {
        if (clean[i] === ';') start = i + 1;
    }
    let end = clean.indexOf(';', offset);
    if (end === -1) end = clean.length;
    return { start, end };
}

/**
 * 解析文档中所有别名定义【列表】（带语句作用域，按 uri+version 缓存）
 *
 * 与 parseAliasDefinitions 的区别：返回数组且每条带 scopeStart/scopeEnd，
 * 允许不同语句使用相同别名（跳转时按光标所在语句匹配，避免串到其他语句）。
 *
 * @returns {Array<{tableName,tableRange,aliasRange,hasAS,alias,scopeStart,scopeEnd}>}
 */
function parseAliasDefsList(document) {
    return getCached(document, computeAliasDefsList, 'aliasDefsList');
}

function computeAliasDefsList(document) {
    const text = document.getText();
    const clean = cleanText(text);
    const defs = [];

    const tableAliasRe = /(?:FROM|JOIN|,)\s+([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_.\u4e00-\u9fa5]*)\s+(?:(AS)\s+)?([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)(?=\s*(?:;|,|\)|JOIN|ON|WHERE|GROUP|HAVING|ORDER|LIMIT|LEFT|RIGHT|INNER|CROSS|FULL|NATURAL|UNION|SELECT|INSERT|UPDATE|DELETE|CREATE|WITH|DROP|TRUNCATE|MERGE|ALTER|SET|$))/gi;
    let m;
    while ((m = tableAliasRe.exec(clean)) !== null) {
        const tableName = m[1];
        const alias = m[3];
        const hasAS = !!m[2];
        if (KEYWORDS.has(alias.toUpperCase())) continue;

        const aliasLower = alias.toLowerCase();
        const scope = statementRangeAt(clean, m.index);

        const tableStart = m.index + m[0].indexOf(tableName);
        const tableRange = new vscode.Range(
            document.positionAt(tableStart),
            document.positionAt(tableStart + tableName.length)
        );
        const aliasIdx = m.index + m[0].lastIndexOf(alias);
        const aliasRange = new vscode.Range(
            document.positionAt(aliasIdx),
            document.positionAt(aliasIdx + alias.length)
        );
        defs.push({ tableName, tableRange, aliasRange, hasAS, alias: aliasLower, scopeStart: scope.start, scopeEnd: scope.end });
    }
    return defs;
}

/**
 * 解析 WITH 子句的 CTE（临时结果集）定义（按 uri+version 缓存）
 * 支持：WITH t1 AS (...), t2 AS (...)
 *
 * @returns {Array<{name,nameRange,scopeStart,scopeEnd}>}
 */
function parseCteDefinitions(document) {
    return getCached(document, computeCteDefinitions, 'cteDefinitions');
}

function computeCteDefinitions(document) {
    const text = document.getText();
    const clean = cleanText(text);
    const defs = [];
    const withRe = /\bWITH\b/gi;
    const headRe = /^\s*(?:,\s*)?([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s+AS\s*\(/i;
    let wm;
    while ((wm = withRe.exec(clean)) !== null) {
        const scope = statementRangeAt(clean, wm.index);
        let pos = wm.index + wm[0].length;
        let guard = 0;
        // 逐个解析 CTE：name AS ( ... )，跳过括号体后继续找 , name AS (
        while (guard++ < 100) {
            const rest = clean.slice(pos);
            const hm = headRe.exec(rest);
            if (!hm) break;
            const name = hm[1];
            const nameStart = pos + hm[0].indexOf(name);
            defs.push({
                name,
                nameRange: new vscode.Range(
                    document.positionAt(nameStart),
                    document.positionAt(nameStart + name.length)
                ),
                scopeStart: scope.start,
                scopeEnd: scope.end
            });
            // 扫描并跳过 AS (...) 括号块（支持嵌套括号）
            let i = pos + hm[0].length;
            let depth = 1;
            while (i < clean.length && depth > 0) {
                const ch = clean[i];
                if (ch === '(') depth++;
                else if (ch === ')') {
                    depth--;
                    if (depth === 0) { i++; break; }
                }
                i++;
            }
            pos = i;
        }
    }
    return defs;
}

/**
 * 解析子查询别名定义（FROM ( ... ) DD / JOIN ( ... ) AS x）
 * 支持括号配对（含嵌套），别名指向子查询起始位置。
 *
 * @returns {Array<{alias,tableName,aliasRange,tableRange,scopeStart,scopeEnd}>}
 */
function parseSubqueryAliasDefs(document) {
    return getCached(document, computeSubqueryAliasDefs, 'subqueryAliasDefs');
}

function computeSubqueryAliasDefs(document) {
    const text = document.getText();
    const clean = cleanText(text);
    const defs = [];
    const re = /(?:FROM|JOIN|,)\s*\(/gi;
    let m;
    while ((m = re.exec(clean)) !== null) {
        const openIdx = m.index + m[0].length - 1; // '(' 位置
        let depth = 1, i = openIdx + 1;
        while (i < clean.length && depth > 0) {
            const ch = clean[i];
            if (ch === '(') depth++;
            else if (ch === ')') { depth--; if (depth === 0) break; }
            i++;
        }
        if (depth !== 0) continue; // 括号不配对，跳过
        const closeIdx = i;
        const after = clean.slice(closeIdx + 1);
        const am = /^\s*(?:AS\s+)?([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)/i.exec(after);
        if (!am) continue;
        const alias = am[1];
        if (KEYWORDS.has(alias.toUpperCase())) continue;
        const aliasStart = closeIdx + 1 + am[0].indexOf(alias);
        const scope = statementRangeAt(clean, openIdx);
        defs.push({
            alias: alias.toLowerCase(),
            tableName: '(子查询)',
            aliasRange: new vscode.Range(
                document.positionAt(aliasStart),
                document.positionAt(aliasStart + alias.length)
            ),
            tableRange: new vscode.Range(
                document.positionAt(openIdx),
                document.positionAt(openIdx + 1)
            ),
            subquery: true,
            scopeStart: scope.start,
            scopeEnd: scope.end,
        });
    }
    return defs;
}

function computeAliasDefinitions(document) {
    // 兼容旧行为：Map<别名小写, def>，同名保留首个
    const aliasMap = new Map();
    for (const def of computeAliasDefsList(document)) {
        if (!aliasMap.has(def.alias)) aliasMap.set(def.alias, def);
    }
    return aliasMap;
}

/**
 * 解析文档中所有 CREATE TABLE / CREATE TEMP TABLE / CREATE TEMPORARY TABLE 定义（按 uri+version 缓存）
 * 返回 Map: 表名(小写) → { tableName, fullCreateRange, tableNameRange, createText }
 *
 * @param {vscode.TextDocument} document
 * @returns {Map<string, Object>}
 */
function parseCreateTableDefs(document) {
    return getCached(document, computeCreateTableDefs, 'createTableDefs');
}

function computeCreateTableDefs(document) {
    const text = document.getText();
    const defs = new Map();
    const clean = cleanText(text);

    const re = /\bCREATE\s+(?:(?:VOLATILE|GLOBAL|LOCAL|TEMPORARY|TEMP|UNLOGGED)\s+)*TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`\"']?)([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_.\u4e00-\u9fa5]*)\1(?=[\s\(\),;\|]|$)/gi;
    let m;
    while ((m = re.exec(clean)) !== null) {
        const quoteChar = m[1] || '';
        const tableName = m[2];
        const key = tableName.toLowerCase();
        const tableNameStart = m.index + m[0].indexOf(quoteChar + tableName);

        // 找到 CREATE 语句的结束位置（匹配到 ; 或文档结尾）
        let endPos = text.length;
        const semiIdx = text.indexOf(';', m.index);
        if (semiIdx !== -1) endPos = semiIdx + 1;

        // 如果找到更早的 CREATE 或 DROP 则提前结束
        const nextCreate = text.slice(m.index + 1).search(/\bCREATE\s/i);
        const nextDrop = text.slice(m.index + 1).search(/\bDROP\s/i);
        let nextBoundary = Infinity;
        if (nextCreate !== -1) nextBoundary = Math.min(nextBoundary, m.index + 1 + nextCreate);
        if (nextDrop !== -1) nextBoundary = Math.min(nextBoundary, m.index + 1 + nextDrop);
        if (nextBoundary < endPos) endPos = nextBoundary;

        const fullCreateRange = new vscode.Range(
            document.positionAt(m.index),
            document.positionAt(endPos)
        );
        const tableNameRange = new vscode.Range(
            document.positionAt(tableNameStart),
            document.positionAt(tableNameStart + tableName.length)
        );
        const createText = text.slice(m.index, Math.min(endPos, m.index + 200)).trim()
            + (endPos > m.index + 200 ? '...' : '');

        const entry = { tableName, fullCreateRange, tableNameRange, createText };
        defs.set(key, entry);
        // 兼容：CREATE 带 schema（ods.tmp_x）而引用只用短名（tmp_x）
        const shortName = key.includes('.') ? key.split('.').pop() : null;
        if (shortName && !defs.has(shortName)) defs.set(shortName, entry);
    }
    return defs;
}

module.exports = { parseAliasDefinitions, parseAliasDefsList, parseSubqueryAliasDefs, parseCteDefinitions, parseCreateTableDefs, isPositionInCommentOrString, KEYWORDS };