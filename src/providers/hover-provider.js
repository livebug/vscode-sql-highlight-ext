/**
 * hover-provider.js — 悬浮提示提供器（别名 + 表定义）
 */
'use strict';

const vscode = require('vscode');
const logger = require('../logger');
const { parseAliasDefinitions, parseCreateTableDefs, isPositionInCommentOrString } = require('../core/alias-parser');

/**
 * Hover: 悬浮在表别名上 → 显示原表名
 */
function provideAliasHover(document, position) {
    // 注释/字符串内不触发悬浮
    if (isPositionInCommentOrString(document, position)) return null;

    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*/);
    if (!wordRange) return null;

    const word = document.getText(wordRange);
    const aliasMap = parseAliasDefinitions(document);
    logger.debug(`[Hover] parseAliasDefinitions 找到 ${aliasMap.size} 个别名定义`);

    const aliasLower = word.toLowerCase();
    const def = aliasMap.get(aliasLower);
    if (!def) return null;

    const isOnDefinition = def.aliasRange.contains(position);

    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    if (isOnDefinition) {
        markdown.appendMarkdown(`**表别名:** \`${word}\` → 表 \`${def.tableName}\`\n\n*Ctrl+Click / F12 跳转到表名定义*`);
        return new vscode.Hover(markdown, def.aliasRange);
    } else {
        markdown.appendMarkdown(`**别名:** \`${word}\` → 原表 \`${def.tableName}\`\n\n*点击跳转或按 F12 查看别名定义*`);
        return new vscode.Hover(markdown);
    }
}

/**
 * Hover: 悬浮在表名上 → 如果是 CREATE TABLE 定义的，显示定义摘要
 */
function provideTableHover(document, position) {
    // 注释/字符串内不触发悬浮
    if (isPositionInCommentOrString(document, position)) return null;

    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_.\u4e00-\u9fa5]*/);
    if (!wordRange) return null;
    const word = document.getText(wordRange);

    const createDefs = parseCreateTableDefs(document);
    logger.debug(`[Hover] parseCreateTableDefs 找到 ${createDefs.size} 个 CREATE TABLE 定义`);
    const def = createDefs.get(word.toLowerCase());
    if (!def) return null;

    const isOnCreateDef = def.tableNameRange.contains(position);
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    if (isOnCreateDef) {
        markdown.appendMarkdown(`**表定义:** \`${def.tableName}\`\n\n\`\`\`sql\n${def.createText}\n\`\`\``);
        return new vscode.Hover(markdown, def.tableNameRange);
    }
    markdown.appendMarkdown(`**表:** \`${def.tableName}\` → *已在本文档定义*\n\n\`\`\`sql\n${def.createText}\n\`\`\`\n\n*Ctrl+Click / F12 跳转到 CREATE 语句*`);
    return new vscode.Hover(markdown);
}

module.exports = { provideAliasHover, provideTableHover };