/**
 * format-provider.js — SQL 格式化提供器
 */
'use strict';

const vscode = require('vscode');
const { formatSQL } = require('../core/formatter');
const logger = require('../logger');

/**
 * 检测多行文本的基础缩进（最小公共前导空格数，忽略空行）
 */
function detectBaseIndent(lines) {
    let min = Infinity;
    for (const line of lines) {
        if (line.trim().length === 0) continue;
        const leading = line.match(/^ */)[0].length;
        if (leading < min) min = leading;
    }
    return min === Infinity ? 0 : min;
}

/**
 * 创建格式化提供器
 */
function createFormatProvider(lang) {
    return {
        provideDocumentFormattingEdits(document) {
            logger.info('[格式化] 全文格式化开始', { lang, file: document.fileName });
            const text = document.getText();
            const config = vscode.workspace.getConfiguration('sqlDialectHighlight.format');
            try {
                const formatted = formatSQL(text, {
                    indentSize: config.get('indentSize', 4),
                    maxWidth: config.get('maxWidth', 200),
                    commaFirst: config.get('commaFirst', true),
                    andAlign: config.get('andAlign', true),
                    keywordCase: config.get('keywordCase', 'upper'),
                });
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(text.length)
                );
                logger.info('[格式化] 全文格式化成功', { lang, origLen: text.length, formattedLen: formatted.length });
                return [vscode.TextEdit.replace(fullRange, formatted)];
            } catch (e) {
                logger.error(`[格式化] 全文格式化失败: ${e.message}`, { lang, stack: e.stack });
                vscode.window.showErrorMessage('SQL 格式化失败: ' + e.message);
                return [];
            }
        },
        provideDocumentRangeFormattingEdits(document, range) {
            logger.info('[格式化] 选区格式化开始', { lang, file: document.fileName, sLine: range.start.line, eLine: range.end.line });
            const config = vscode.workspace.getConfiguration('sqlDialectHighlight.format');
            try {
                // 获取选区文本及所在行的缩进
                const startLine = range.start.line;
                const endLine = range.end.line;
                const fullLines = [];
                for (let i = startLine; i <= endLine; i++) {
                    fullLines.push(document.lineAt(i).text);
                }
                const selectedText = fullLines.join('\n');

                // 检测选区最小缩进（用于去除公共缩进后格式化）
                const baseIndent = detectBaseIndent(fullLines);

                // 去除基础缩进 → 格式化 → 补回缩进
                let textToFormat = selectedText;
                if (baseIndent > 0) {
                    textToFormat = fullLines
                        .map(l => l.startsWith(' '.repeat(baseIndent)) ? l.slice(baseIndent) : l.trimStart())
                        .join('\n');
                }

                const formatted = formatSQL(textToFormat, {
                    indentSize: config.get('indentSize', 4),
                    maxWidth: config.get('maxWidth', 200),
                    commaFirst: config.get('commaFirst', true),
                    andAlign: config.get('andAlign', true),
                    keywordCase: config.get('keywordCase', 'upper'),
                });

                // 补回缩进
                let result = formatted;
                if (baseIndent > 0) {
                    const prefix = ' '.repeat(baseIndent);
                    result = formatted
                        .split('\n')
                        .map(l => l ? prefix + l : l)
                        .join('\n');
                }

                // 构造覆盖整行的 range（避免残留）
                const fullRange = new vscode.Range(
                    startLine, 0,
                    endLine, document.lineAt(endLine).text.length
                );
                logger.info('[格式化] 选区格式化成功', { lang, baseIndent, lineCount: endLine - startLine + 1 });
                return [vscode.TextEdit.replace(fullRange, result)];
            } catch (e) {
                logger.error(`[格式化] 选区格式化失败: ${e.message}`, { lang, stack: e.stack });
                vscode.window.showErrorMessage('选区格式化失败: ' + e.message);
                return [];
            }
        }
    };
}

module.exports = { createFormatProvider };