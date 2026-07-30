/**
 * document-symbols.js — 文档大纲提供器（面包屑导航 & 大纲视图）
 */
'use strict';

const vscode = require('vscode');
const logger = require('../logger');

/**
 * 提供文档大纲（面包屑导航 & 大纲视图）
 * 识别: CREATE TABLE/VIEW, WITH CTE, 分隔注释
 */
function provideSQLDocumentSymbols(document) {
    const symbols = [];
    const text = document.getText();

    // 保护字符串和注释，防止误匹配
    let clean = text;
    clean = clean.replace(/\$\{[^}]*\}(?:\.)?/g, m => ' '.repeat(m.length));
    clean = clean.replace(/'([^'\n]|'')*'/g, m => ' '.repeat(m.length));
    clean = clean.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
    clean = clean.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));

    // ------ 1. CREATE TABLE / VIEW / TEMP TABLE ------
    const createRe = /\bCREATE\s+(?:(?:LOCAL\s+|GLOBAL\s+)?(?:TEMPORARY|TEMP)\s+)?(TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_.\u4e00-\u9fa5]*)(?=[\s\(\);,\|]|$)/gi;
    let m;
    while ((m = createRe.exec(clean)) !== null) {
        const objType = m[1].toUpperCase();
        const name = m[2];
        const startPos = document.positionAt(m.index);
        // 找到 CREATE 语句结束位置
        let endIdx = text.length;
        const semiIdx = text.indexOf(';', m.index);
        if (semiIdx !== -1) endIdx = semiIdx + 1;
        const endPos = document.positionAt(Math.min(endIdx, text.length));

        const range = new vscode.Range(startPos, endPos);
        const selectionRange = new vscode.Range(
            document.positionAt(m.index + m[0].indexOf(name)),
            document.positionAt(m.index + m[0].indexOf(name) + name.length)
        );

        const kind = objType === 'VIEW' ? vscode.SymbolKind.Interface : vscode.SymbolKind.Struct;
        const label = objType === 'VIEW' ? `📋 ${name}` : `📦 ${name}`;
        symbols.push(new vscode.DocumentSymbol(
            label, objType === 'VIEW' ? 'VIEW' : 'TABLE', kind, range, selectionRange
        ));
    }

    // ------ 2. WITH CTE 子句 ------
    const cteRe = /(?:^|\bWITH\b|,)\s*([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s+AS\s*\(/gi;
    while ((m = cteRe.exec(clean)) !== null) {
        const cteName = m[1];
        const startPos = document.positionAt(m.index);
        // 找到匹配的 )
        let depth = 0, endIdx = m.index + m[0].length - 1;
        let found = false;
        for (let i = endIdx; i < text.length; i++) {
            if (text[i] === '(') depth++;
            else if (text[i] === ')') { depth--; if (depth === 0) { endIdx = i + 1; found = true; break; } }
        }
        if (!found) endIdx = text.length;
        const endPos = document.positionAt(Math.min(endIdx, text.length));

        const range = new vscode.Range(startPos, endPos);
        const selectionRange = new vscode.Range(
            document.positionAt(m.index + m[0].indexOf(cteName)),
            document.positionAt(m.index + m[0].indexOf(cteName) + cteName.length)
        );
        symbols.push(new vscode.DocumentSymbol(
            `🔷 ${cteName}`, 'CTE', vscode.SymbolKind.Module, range, selectionRange
        ));
    }

    logger.debug(`[大纲] 生成 ${symbols.length} 个符号`, { lang: document.languageId });
    return symbols;
}

module.exports = { provideSQLDocumentSymbols };