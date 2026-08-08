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
 * 解析文档中所有表别名定义（按 uri+version 缓存）
 * 返回 Map: 别名(小写) → { tableName, tableRange, aliasRange, hasAS }
 * 支持: FROM table_name alias, JOIN table_name AS alias
 *
 * @param {vscode.TextDocument} document
 * @returns {Map<string, Object>}
 */
function parseAliasDefinitions(document) {
    return getCached(document, computeAliasDefinitions);
}

function computeAliasDefinitions(document) {
    const text = document.getText();
    const aliasMap = new Map();
    const clean = cleanText(text);

    // 匹配 FROM/JOIN table_name [[AS] alias] 和逗号分隔 table_name alias 模式
    const tableAliasRe = /(?:FROM|JOIN|,)\s+([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_.\u4e00-\u9fa5]*)\s+(?:(AS)\s+)?([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)(?=\s*(?:,|JOIN|ON|WHERE|GROUP|HAVING|ORDER|LIMIT|LEFT|RIGHT|INNER|CROSS|FULL|NATURAL|$))/gi;
    let m;
    while ((m = tableAliasRe.exec(clean)) !== null) {
        const tableName = m[1];
        const alias = m[3];
        const hasAS = !!m[2];
        // 跳过关键字别名
        if (KEYWORDS.has(alias.toUpperCase())) continue;

        const aliasLower = alias.toLowerCase();
        // 如果多个表有相同别名，只保留第一个
        if (!aliasMap.has(aliasLower)) {
            const tableStart = m.index + m[0].indexOf(tableName);
            const tableRange = new vscode.Range(
                document.positionAt(tableStart),
                document.positionAt(tableStart + tableName.length)
            );

            // 定位别名在原始字符串中的位置
            const aliasIdx = m.index + m[0].lastIndexOf(alias);
            const aliasRange = new vscode.Range(
                document.positionAt(aliasIdx),
                document.positionAt(aliasIdx + alias.length)
            );

            aliasMap.set(aliasLower, { tableName, tableRange, aliasRange, hasAS });
        }
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
    return getCached(document, computeCreateTableDefs);
}

function computeCreateTableDefs(document) {
    const text = document.getText();
    const defs = new Map();
    const clean = cleanText(text);

    const re = /\bCREATE\s+(?:TEMPORARY|TEMP|LOCAL\s+TEMPORARY|GLOBAL\s+TEMPORARY)?\s*TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_.\u4e00-\u9fa5]*)(?=[\s\(\);,\|]|$)/gi;
    let m;
    while ((m = re.exec(clean)) !== null) {
        const tableName = m[1];
        const key = tableName.toLowerCase();
        const tableNameStart = m.index + m[0].indexOf(tableName);

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

        defs.set(key, { tableName, fullCreateRange, tableNameRange, createText });
    }
    return defs;
}

module.exports = { parseAliasDefinitions, parseCreateTableDefs, KEYWORDS };