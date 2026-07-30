/**
 * bracket-highlight.js — CASE↔END, BEGIN↔END, WHEN↔THEN 括号配对高亮
 */
'use strict';

const vscode = require('vscode');
const logger = require('../logger');

/**
 * 找到匹配的括号对（CASE↔END, BEGIN↔END, WHEN↔THEN）
 */
function findMatchingBracket(doc, range, word) {
    const text = doc.getText();
    const isOpen = (word === 'CASE' || word === 'BEGIN' || word === 'WHEN');
    const isClose = (word === 'END' || word === 'THEN');

    // ---- WHEN ↔ THEN 配对 ----
    if (word === 'WHEN' || word === 'THEN') {
        return findWhenThenMatch(doc, range, word, text);
    }

    // ---- CASE/BEGIN ↔ END 配对 ----
    if (isOpen) {
        let depth = 1;
        let pos = doc.offsetAt(range.end);
        const re = /\b(CASE|BEGIN|END)\b/gi;
        let m;
        while ((m = re.exec(text)) !== null) {
            if (m.index < pos) continue;
            const w = m[0].toUpperCase();
            if (w === 'CASE' || w === 'BEGIN') depth++;
            else if (w === 'END') {
                depth--;
                if (depth === 0) {
                    return new vscode.Range(
                        doc.positionAt(m.index),
                        doc.positionAt(m.index + 3)
                    );
                }
            }
        }
    } else if (isClose) {
        // END → 向前找匹配的 CASE 或 BEGIN
        let depth = 1;
        let pos = doc.offsetAt(range.start);
        const re = /\b(CASE|BEGIN|END)\b/gi;
        const matches = [];
        let m;
        while ((m = re.exec(text)) !== null) {
            matches.push({ word: m[0].toUpperCase(), index: m.index });
        }
        for (let i = matches.length - 1; i >= 0; i--) {
            if (matches[i].index >= pos) continue;
            const w = matches[i].word;
            if (w === 'END') depth++;
            else if (w === 'CASE' || w === 'BEGIN') {
                depth--;
                if (depth === 0) {
                    const idx = matches[i].index;
                    return new vscode.Range(
                        doc.positionAt(idx),
                        doc.positionAt(idx + w.length)
                    );
                }
            }
        }
    }
    return null;
}

/**
 * WHEN ↔ THEN 配对查找
 */
function findWhenThenMatch(doc, range, word, text) {
    if (word === 'WHEN') {
        // 向后扫描找 THEN，跳过嵌套的 CASE...END 块
        let caseDepth = 0;
        let pos = doc.offsetAt(range.end);
        const re = /\b(CASE|WHEN|THEN|ELSE|END)\b/gi;
        let m;
        while ((m = re.exec(text)) !== null) {
            if (m.index < pos) continue;
            const w = m[0].toUpperCase();
            if (w === 'CASE') { caseDepth++; }
            else if (w === 'END') { caseDepth--; }
            else if (w === 'THEN' && caseDepth === 0) {
                return new vscode.Range(
                    doc.positionAt(m.index),
                    doc.positionAt(m.index + 4)
                );
            }
        }
    } else if (word === 'THEN') {
        // 向前扫描找 WHEN
        let caseDepth = 0;
        let pos = doc.offsetAt(range.start);
        const re = /\b(CASE|WHEN|THEN|ELSE|END)\b/gi;
        const matches = [];
        let m;
        while ((m = re.exec(text)) !== null) {
            matches.push({ word: m[0].toUpperCase(), index: m.index });
        }
        for (let i = matches.length - 1; i >= 0; i--) {
            if (matches[i].index >= pos) continue;
            const w = matches[i].word;
            if (w === 'END') { caseDepth++; }
            else if (w === 'CASE') { caseDepth--; }
            else if (w === 'WHEN' && caseDepth === 0) {
                const idx = matches[i].index;
                return new vscode.Range(
                    doc.positionAt(idx),
                    doc.positionAt(idx + 4)
                );
            }
        }
    }
    return null;
}

/**
 * 注册括号配对高亮（返回 disposable 数组）
 */
function registerBracketHighlight(context) {
    const bracketHighlight = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(100, 180, 255, 0.15)',
        border: '1px solid rgba(100, 180, 255, 0.6)',
        borderRadius: '2px',
        fontWeight: 'bold',
        textDecoration: 'underline',
    });

    function updateBracketHighlight(editor) {
        if (!editor) return;
        const langId = editor.document.languageId;
        if (langId !== 'sql-tdh' && langId !== 'sql-gaussdb') return;

        const pos = editor.selection.active;
        const wordRange = editor.document.getWordRangeAtPosition(
            pos,
            /\b(CASE|BEGIN|END|WHEN|THEN)\b/i
        );
        if (!wordRange) {
            editor.setDecorations(bracketHighlight, []);
            return;
        }

        const word = editor.document.getText(wordRange).toUpperCase();
        if (word !== 'CASE' && word !== 'BEGIN' && word !== 'END'
            && word !== 'WHEN' && word !== 'THEN') {
            editor.setDecorations(bracketHighlight, []);
            return;
        }

        const matchRange = findMatchingBracket(editor.document, wordRange, word);
        if (matchRange) {
            logger.debug(`[括号配对] 匹配: ${word} ↔ ${editor.document.getText(matchRange)}`, { pos: { line: pos.line, char: pos.character } });
        }
        editor.setDecorations(bracketHighlight, matchRange ? [wordRange, matchRange] : []);
    }

    // 光标移动时更新
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(e => {
            updateBracketHighlight(e.textEditor);
        })
    );

    // 初次激活时更新当前编辑器
    if (vscode.window.activeTextEditor) {
        updateBracketHighlight(vscode.window.activeTextEditor);
    }
}

module.exports = { registerBracketHighlight, findMatchingBracket, findWhenThenMatch };