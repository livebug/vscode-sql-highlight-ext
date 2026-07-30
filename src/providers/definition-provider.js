/**
 * definition-provider.js — 定义跳转提供器（别名 + CREATE TABLE）
 */
'use strict';

const vscode = require('vscode');
const logger = require('../logger');
const { parseAliasDefinitions, parseCreateTableDefs } = require('../core/alias-parser');

/**
 * Definition: F12 / Ctrl+Click 跳转到别名定义处
 */
function provideAliasDefinition(document, position) {
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*/);
    if (!wordRange) return null;

    const word = document.getText(wordRange);
    const aliasMap = parseAliasDefinitions(document);

    const def = aliasMap.get(word.toLowerCase());
    if (!def) return null;

    // 如果已经在定义上，跳转到表名
    if (def.aliasRange.contains(position)) {
        logger.info(`[定义跳转] 别名 '${word}' → 原表 '${def.tableName}'`);
        return new vscode.Location(document.uri, def.tableRange);
    }

    // 否则跳转到别名定义（实际跳转到表名位置，显示完整上下文）
    logger.info(`[定义跳转] '${word}' → 别名定义处`);
    return new vscode.Location(document.uri, def.aliasRange);
}

/**
 * Definition: F12 / Ctrl+Click 跳转到 CREATE TABLE 定义
 */
function provideTableDefinition(document, position) {
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