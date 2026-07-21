const vscode = require('vscode');
const { formatSQL } = require('./formatter');

/**
 * 激活扩展：注册 SQL 格式化器 + 语义高亮（表名/字段名）
 */
function activate(context) {
    const languages = ['sql-tdh', 'sql-gaussdb'];

    // ========== 1. SQL 格式化 (全文 + 选区) ==========
    languages.forEach(lang => {
        const formatProvider = {
            provideDocumentFormattingEdits(document) {
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
                    return [vscode.TextEdit.replace(fullRange, formatted)];
                } catch (e) {
                    vscode.window.showErrorMessage('SQL 格式化失败: ' + e.message);
                    return [];
                }
            },
            provideDocumentRangeFormattingEdits(document, range) {
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
                    return [vscode.TextEdit.replace(fullRange, result)];
                } catch (e) {
                    vscode.window.showErrorMessage('选区格式化失败: ' + e.message);
                    return [];
                }
            }
        };
        context.subscriptions.push(
            vscode.languages.registerDocumentFormattingEditProvider(lang, formatProvider),
            vscode.languages.registerDocumentRangeFormattingEditProvider(lang, formatProvider)
        );
    });

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

    // ========== 2. 语义高亮：表名 / 字段名 / 别名 ==========
    const tokenTypes = ['class', 'property', 'variable', 'function'];
    const tokenModifiers = ['declaration', 'readonly'];
    const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

    languages.forEach(lang => {
        context.subscriptions.push(
            vscode.languages.registerDocumentSemanticTokensProvider(lang, {
                provideDocumentSemanticTokens(document) {
                    return provideSemanticTokens(document, legend);
                }
            }, legend)
        );
    });

    vscode.window.showInformationMessage('SQL Dialect Highlight 已激活 (TDH & GaussDB)');

    // ========== 3. CASE/BEGIN ↔ END 与 WHEN ↔ THEN 括号配对高亮 ==========
    const bracketHighlight = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(100, 180, 255, 0.15)',
        border: '1px solid rgba(100, 180, 255, 0.6)',
        borderRadius: '2px',
        fontWeight: 'bold',
        textDecoration: 'underline',
    });

    /**
     * 找到匹配的括号对
     * 支持: CASE↔END, BEGIN↔END, WHEN↔THEN
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
     * WHEN (open) → 向后找最近的 THEN（忽略嵌套 CASE/END）
     * THEN (close) → 向前找最近的 WHEN
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

// ---- 语义 Token 提供 ----
function provideSemanticTokens(document, legend) {
    const builder = new vscode.SemanticTokensBuilder(legend);
    const text = document.getText();
    const lines = text.split('\n');

    // 关键字集合（用于跳过）
    const keywords = new Set([
        'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
        'BETWEEN', 'LIKE', 'RLIKE', 'REGEXP', 'AS', 'ON', 'JOIN',
        'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'OUTER',
        'SEMI', 'ANTI', 'UNION', 'INTERSECT', 'EXCEPT', 'MINUS',
        'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
        'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'REPLACE', 'MERGE',
        'GRANT', 'REVOKE', 'ORDER', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
        'FETCH', 'FOR', 'ASC', 'DESC', 'CASE', 'WHEN', 'THEN', 'ELSE',
        'END', 'NULL', 'TRUE', 'FALSE', 'DISTINCT', 'ALL', 'ANY', 'SOME',
        'WITH', 'RECURSIVE', 'WINDOW', 'OVER', 'PARTITION', 'ROWS', 'RANGE',
        'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW', 'LATERAL',
        'TABLE', 'VIEW', 'SCHEMA', 'DATABASE', 'TEMP', 'TEMPORARY',
        'BEGIN', 'CALL', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
        'DEFAULT', 'CASCADE', 'RESTRICT', 'PURGE', 'IF', 'COMMENT',
        'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'INDEX', 'CONSTRAINT',
        'CHECK', 'UNIQUE', 'ADD', 'COLUMN', 'RENAME', 'TO',
        'IS', 'NOT', 'NULLS', 'FIRST', 'LAST',
    ]);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();
        const indentLen = line.length - trimmed.length; // 缩进偏移量
        if (!trimmed || trimmed.startsWith('--')) continue;

        const upper = trimmed.toUpperCase();

        // (A) FROM / JOIN / INTO / UPDATE / TABLE / TRUNCATE / DESCRIBE 后的标识符 → 表名 (class)
        const tableContextRegex = /(?:FROM|JOIN|INTO|UPDATE|TABLE|TRUNCATE|DESCRIBE|DESC)\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gi;
        let m;
        while ((m = tableContextRegex.exec(upper)) !== null) {
            const word = m[1];
            if (keywords.has(word.toUpperCase())) continue;
            const start = trimmed.indexOf(word);
            if (start !== -1) {
                builder.push(i, indentLen + start, word.length, 0, 0);
            }
        }

        // (B) 表别名声明（表名后有空格+短标识符，非关键字）→ variable.declaration
        const aliasDeclRegex = /\b([a-zA-Z_][a-zA-Z0-9_.]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
        while ((m = aliasDeclRegex.exec(upper)) !== null) {
            const alias = m[2];
            if (keywords.has(alias.toUpperCase())) continue;
            const before = trimmed.substring(0, m.index).trimEnd();
            if (before.endsWith(' AS') || before.endsWith(' as')) continue;
            const start = trimmed.indexOf(alias, m.index + m[1].length);
            if (start !== -1 && alias.length <= 20) {
                builder.push(i, indentLen + start, alias.length, 2, 0);
            }
        }

        // (C) AS 别名 → variable.declaration
        const asAliasRegex = /\bAS\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi;
        while ((m = asAliasRegex.exec(upper)) !== null) {
            const alias = m[1];
            if (keywords.has(alias.toUpperCase())) continue;
            const start = trimmed.indexOf(alias, m.index + 3);
            if (start !== -1) {
                builder.push(i, indentLen + start, alias.length, 2, 0);
            }
        }

        // (D) 表名.字段名 → property (字段部分高亮)
        const dotFieldRegex = /\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
        while ((m = dotFieldRegex.exec(trimmed)) !== null) {
            const field = m[1];
            if (keywords.has(field.toUpperCase())) continue;
            builder.push(i, indentLen + m.index + 1, field.length, 1, 0);
        }
    }

    return builder.build();
}

function deactivate() {}

module.exports = { activate, deactivate };
