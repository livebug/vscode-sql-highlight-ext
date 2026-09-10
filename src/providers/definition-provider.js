/**
 * definition-provider.js — 定义跳转提供器（别名 + CREATE TABLE）
 */
'use strict';

const vscode = require('vscode');
const logger = require('../logger');
const { parseAliasDefsList, parseSubqueryAliasDefs, parseCteDefinitions, parseCreateTableDefs, isPositionInCommentOrString } = require('../core/alias-parser');

/**
 * Definition: F12 / Ctrl+Click 跳转到别名/CTE 定义处
 *
 * 关键：按【语句作用域】匹配（同一文件多条 SQL 语句时，同名别名不会串到其他语句）。
 */
function provideAliasDefinition(document, position) {
    // 注释/字符串内不触发跳转（注释里同名单词不应跳转）
    if (isPositionInCommentOrString(document, position)) return null;

    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*/);
    if (!wordRange) return null;

    const word = document.getText(wordRange);
    const lower = word.toLowerCase();
    const offset = document.offsetAt(position);

    const offOf = (range) => document.offsetAt(range.start);
    const inScopeOf = (def) => offset >= def.scopeStart && offset <= def.scopeEnd;

    // 候选选择：优先【同语句作用域】，其次【就近】（光标之前最近的优先，再取之后最近的）
    // 说明：SQL 文件常常没有分号（多条语句靠换行分隔），此时作用域会退化成整篇，
    // 就近原则能保证"点第二句的 t1 跳到第二句的定义"，而不是永远跳第一句。
    function pickNearest(cands) {
        let before = null, after = null;
        for (const c of cands) {
            const cOff = offOf(c.range);
            if (cOff <= offset) {
                if (!before) before = c;
                else if (c.inScope && !before.inScope) before = c;
                else if (c.inScope === before.inScope && cOff > offOf(before.range)) before = c;
            } else {
                if (!after) after = c;
                else if (c.inScope && !after.inScope) after = c;
                else if (c.inScope === after.inScope && cOff < offOf(after.range)) after = c;
            }
        }
        return before || after;
    }

    // 1. CTE（WITH 临时结果集）：点击 CTE 名或其在 FROM 中的引用 → 跳 WITH 定义
    const cteCands = parseCteDefinitions(document)
        .filter(c => c.name.toLowerCase() === lower)
        .map(c => ({ range: c.nameRange, inScope: inScopeOf(c), r: c.nameRange }));
    const cteHit = pickNearest(cteCands);
    if (cteHit) {
        logger.info(`[定义跳转] CTE '${word}' → WITH 定义`);
        return new vscode.Location(document.uri, cteHit.range);
    }

    // 2. 表别名：点击别名定义 → 跳原表；点击别名引用 → 跳就近的别名定义
    // 表别名 + 子查询别名（FROM ( ... ) DD）统一按就近原则选择
    const aliasDefs = parseAliasDefsList(document)
        .concat(parseSubqueryAliasDefs(document))
        .filter(d => d.alias === lower);
    for (const def of aliasDefs) {
        if (def.aliasRange.contains(position)) {
            logger.info(`[定义跳转] 别名 '${word}' → 原表 '${def.tableName}'`);
            return new vscode.Location(document.uri, def.tableRange);
        }
    }
    const aliasHit = pickNearest(aliasDefs.map(d => ({ range: d.aliasRange, inScope: inScopeOf(d) })));
    if (aliasHit) {
        logger.info(`[定义跳转] '${word}' → 别名定义处${aliasHit.inScope ? '（同语句）' : '（就近）'}`);
        return new vscode.Location(document.uri, aliasHit.range);
    }

    return null;
}

/**
 * Definition: F12 / Ctrl+Click 跳转到 CREATE TABLE 定义
 */
function provideTableDefinition(document, position) {
    // 注释/字符串内不触发跳转
    if (isPositionInCommentOrString(document, position)) return null;

    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_.\u4e00-\u9fa5]*/);
    if (!wordRange) return null;
    const word = document.getText(wordRange);

    const createDefs = parseCreateTableDefs(document);
    const def = createDefs.get(word.toLowerCase());
    if (!def) return null;

    logger.info(`[定义跳转] 表名 '${word}' → CREATE TABLE 定义`);
    return new vscode.Location(document.uri, def.tableNameRange);
}

module.exports = { provideAliasDefinition, provideTableDefinition };