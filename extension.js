const vscode = require('vscode');
const { formatSQL } = require('./formatter');
const { loadMetadata, loadTableIndex, loadTableColumns } = require('./metadata-loader');
const logger = require('./logger');
const { scanTables } = require('./table-scanner');
const { DepsTreeProvider } = require('./deps-view-provider');
const completionData = require('./completion-data');

/**
 * 激活扩展：注册 SQL 格式化器 + 语义高亮（表名/字段名）
 */
function activate(context) {
    logger.init(context);
    logger.info('SQL Dialect Highlight 扩展开始激活...');
    const languages = ['sql-tdh', 'sql-gaussdb'];

    // ========== 1. SQL 格式化 (全文 + 选区) ==========
    languages.forEach(lang => {
        const formatProvider = {
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

    logger.info('SQL Dialect Highlight 已激活 (TDH & GaussDB)');
    vscode.window.showInformationMessage('SQL Dialect Highlight 已激活 (TDH & GaussDB)');

    // ========== 2.5 文档大纲 (Document Symbol) ==========
    logger.info('[大纲] 注册文档符号提供器...');
    languages.forEach(lang => {
        context.subscriptions.push(
            vscode.languages.registerDocumentSymbolProvider(lang, {
                provideDocumentSymbols(document) {
                    return provideSQLDocumentSymbols(document);
                }
            })
        );
    });

    // ========== 3. CASE/BEGIN ↔ END 与 WHEN ↔ THEN 括号配对高亮 ==========
    logger.info('[括号配对] 注册 CASE↔END, BEGIN↔END, WHEN↔THEN 配对高亮...');
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

    // ========== 3.5 侧面板表依赖视图 ==========
    logger.info('[依赖视图] 注册侧面板树视图...');
    const depsProvider = new DepsTreeProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('sqlTableDeps', depsProvider)
    );

    // 编辑器变化时自动刷新依赖视图
    function refreshDepsView() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { depsProvider.clear(); return; }
        const langId = editor.document.languageId;
        if (langId !== 'sql-tdh' && langId !== 'sql-gaussdb') { depsProvider.clear(); return; }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!workspaceFolder) { depsProvider.clear(); return; }

        const text = editor.document.getText();
        const scanResult = scanTables(text);
        depsProvider.refresh(scanResult, workspaceFolder.uri.fsPath, function(tableKey) {
            // 优先查临时表
            if (scanResult.temp.has(tableKey)) {
                const def = scanResult.temp.get(tableKey);
                return def.columns && def.columns.length > 0 ? def.columns : null;
            }
            // 再查物理表元数据
            const cols = loadTableColumns(workspaceFolder.uri.fsPath, tableKey);
            return cols || null;
        });
    }

    // 文档变化时刷新
    const changeTimeout = { id: null };
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            if (changeTimeout.id) clearTimeout(changeTimeout.id);
            changeTimeout.id = setTimeout(refreshDepsView, 500);
        })
    );
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(refreshDepsView)
    );
    // 初次激活时刷新
    setTimeout(refreshDepsView, 1000);

    // ========== 4. Hover + Definition: 表别名 & 临时表跳转 ==========
    languages.forEach(lang => {
        // 统一的 Hover: 别名提示原表，表名提示 CREATE 定义
        context.subscriptions.push(
            vscode.languages.registerHoverProvider(lang, {
                provideHover(document, position) {
                    const aliasHover = provideAliasHover(document, position);
                    if (aliasHover) {
                        logger.debug('[Hover] 别名悬浮提示', { lang, line: position.line });
                        return aliasHover;
                    }
                    const tableHover = provideTableHover(document, position);
                    if (tableHover) {
                        logger.debug('[Hover] 表定义悬浮提示', { lang, line: position.line });
                    }
                    return tableHover;
                }
            })
        );
        // 统一的 Definition: 别名跳转、临时表跳转到 CREATE
        context.subscriptions.push(
            vscode.languages.registerDefinitionProvider(lang, {
                provideDefinition(document, position) {
                    const aliasDef = provideAliasDefinition(document, position);
                    if (aliasDef) {
                        logger.info('[定义跳转] 别名跳转', { lang, line: position.line });
                        return aliasDef;
                    }
                    const tableDef = provideTableDefinition(document, position);
                    if (tableDef) {
                        logger.info('[定义跳转] 表定义跳转', { lang, line: position.line });
                    }
                    return tableDef;
                }
            })
        );
        // Completion: 基于 .metadata CSV 的表名/字段名补全
        context.subscriptions.push(
            vscode.languages.registerCompletionItemProvider(lang, {
                provideCompletionItems(document, position) {
                    const items = doProvideCompletionItems(document, position);
                    if (items && items.length > 0) {
                        logger.debug(`[补全] 提供 ${items.length} 个候选项`, { lang, line: position.line, char: position.character });
                    }
                    return items;
                }
            }, '.', ' ', '\n', '\t', ',', '(')
        );
    });
}

/**
 * 解析文档中所有表别名定义
 * 返回 Map: 别名(小写) → { tableName, tableRange, aliasRange }
 * 支持: FROM table_name alias, JOIN table_name AS alias
 */
function parseAliasDefinitions(document) {
    const text = document.getText();
    const aliasMap = new Map();
    const keywords = new Set([
        'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
        'BETWEEN', 'LIKE', 'RLIKE', 'REGEXP', 'AS', 'ON', 'JOIN',
        'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'OUTER',
        'SEMI', 'ANTI', 'UNION', 'ALL', 'INTERSECT', 'EXCEPT', 'MINUS',
        'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
        'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'REPLACE', 'MERGE',
        'GRANT', 'REVOKE', 'ORDER', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
        'FETCH', 'FOR', 'ASC', 'DESC', 'CASE', 'WHEN', 'THEN', 'ELSE',
        'END', 'NULL', 'TRUE', 'FALSE', 'DISTINCT', 'ANY', 'SOME',
        'WITH', 'RECURSIVE', 'WINDOW', 'OVER', 'PARTITION', 'ROWS', 'RANGE',
        'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW', 'LATERAL',
        'TABLE', 'VIEW', 'SCHEMA', 'DATABASE', 'TEMP', 'TEMPORARY',
        'BEGIN', 'CALL', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
        'DEFAULT', 'CASCADE', 'RESTRICT', 'PURGE', 'IF', 'COMMENT',
        'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'INDEX', 'CONSTRAINT',
        'CHECK', 'UNIQUE', 'ADD', 'COLUMN', 'RENAME', 'TO',
        'IS', 'NOT', 'NULLS', 'FIRST', 'LAST', 'HAVING',
        'ON', 'USING', 'NATURAL', 'INNER', 'CROSS', 'OUTER',
    ]);

    // 保护注释、字符串、变量，防止误匹配
    let clean = text;
    clean = clean.replace(/\$\{[^}]*\}(?:\.)?/g, m => ' '.repeat(m.length));
    clean = clean.replace(/'([^'\n]|'')*'/g, m => ' '.repeat(m.length));
    clean = clean.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
    clean = clean.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));

    // 匹配 FROM/JOIN table_name [[AS] alias] 和逗号分隔 table_name alias 模式
    // 模式1: FROM|JOIN table_name alias / FROM|JOIN table_name AS alias
    // 模式2: , table_name alias (逗号分隔的多表)
    const tableAliasRe = /(?:FROM|JOIN|,)\s+([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_.\u4e00-\u9fa5]*)\s+(?:(AS)\s+)?([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)(?=\s*(?:,|JOIN|ON|WHERE|GROUP|HAVING|ORDER|LIMIT|LEFT|RIGHT|INNER|CROSS|FULL|NATURAL|$))/gi;
    let m;
    while ((m = tableAliasRe.exec(clean)) !== null) {
        const tableName = m[1];
        const alias = m[3];
        const hasAS = !!m[2];
        // 跳过关键字别名
        if (keywords.has(alias.toUpperCase())) continue;

        const aliasLower = alias.toLowerCase();
        // 如果多个表有相同别名，只保留第一个（或合并）
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
 * Hover: 悬浮在表别名上 → 显示原表名
 */
function provideAliasHover(document, position) {
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*/);
    if (!wordRange) return null;

    const word = document.getText(wordRange);
    const aliasMap = parseAliasDefinitions(document);
    logger.debug(`[Hover] parseAliasDefinitions 找到 ${aliasMap.size} 个别名定义`);

    // 检查悬浮的词是否是别名定义位置
    const aliasLower = word.toLowerCase();
    const def = aliasMap.get(aliasLower);
    if (!def) return null;

    // 检查光标是否确实在别名定义或使用位置
    // 如果是别名定义本身，显示"别名定义"；如果是使用位置则显示"跳转到"
    const isOnDefinition = def.aliasRange.contains(position);

    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    if (isOnDefinition) {
        markdown.appendMarkdown(`**表别名:** \`${word}\` → 表 \`${def.tableName}\`\n\n*Ctrl+Click / F12 跳转到表名定义*`);
        return new vscode.Hover(markdown, def.aliasRange);
    } else {
        // 使用位置：显示原表并提供跳转
        markdown.appendMarkdown(`**别名:** \`${word}\` → 原表 \`${def.tableName}\`\n\n*点击跳转或按 F12 查看别名定义*`);
        return new vscode.Hover(markdown);
    }
}

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

// ========== 临时表 / CREATE TABLE 定义跳转 ==========

/**
 * 解析文档中所有 CREATE TABLE / CREATE TEMP TABLE / CREATE TEMPORARY TABLE 定义
 * 返回 Map: 表名(小写) → { tableName, fullCreateRange, tableNameRange, createText }
 */
function parseCreateTableDefs(document) {
    const text = document.getText();
    const defs = new Map();

    // 保护注释、字符串、变量，防止误匹配
    let clean = text;
    clean = clean.replace(/\$\{[^}]*\}(?:\.)?/g, m => ' '.repeat(m.length));
    clean = clean.replace(/'([^'\n]|'')*'/g, m => ' '.repeat(m.length));
    clean = clean.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
    clean = clean.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));

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
        // 取一个合理的显示摘要（截断 CREATE 语句前200字符）
        const createText = text.slice(m.index, Math.min(endPos, m.index + 200)).trim()
            + (endPos > m.index + 200 ? '...' : '');

        defs.set(key, { tableName, fullCreateRange, tableNameRange, createText });
    }
    return defs;
}

/**
 * Hover: 悬浮在表名上 → 如果是 CREATE TABLE 定义的，显示定义摘要
 */
function provideTableHover(document, position) {
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_.\u4e00-\u9fa5]*/);
    if (!wordRange) return null;
    const word = document.getText(wordRange);

    const createDefs = parseCreateTableDefs(document);
    logger.debug(`[Hover] parseCreateTableDefs 找到 ${createDefs.size} 个 CREATE TABLE 定义`);
    const def = createDefs.get(word.toLowerCase());
    if (!def) return null;

    // 如果在 CREATE 语句定义处，显示"定义"
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

// ========== 代码补全（关键字 + Snippet + 函数 + 类型 + CTE + 临时表字段 + .metadata） ==========

/**
 * 向后扫描 SQL 文本，检测当前光标所在的补全上下文
 *
 * 返回: {
 *   isStatementStart,   // 语句起始（文档开头或分号后）
 *   isExpressionContext, // 表达式上下文（SELECT/WHERE/HAVING/AND/OR/ON/CASE/WHEN/SET 之后）
 *   isTableContext,      // 表上下文（FROM/JOIN/INSERT INTO/UPDATE 之后）
 *   isColumnDefContext,  // 列定义上下文（CREATE TABLE (...) 内）
 *   isAfterDot,          // 表别名. 之后
 *   dotPrefix,           // 点号前的表名/别名
 *   lastKeyword,         // 最近的子句关键字
 *   inSelectList,        // 是否在 SELECT 列表中（逗号触发）
 *   inGroupByList,       // 是否在 GROUP BY / ORDER BY 列表中
 * }
 */
function detectSQLContext(document, position, textBeforeCursor) {
    // 取光标前全部文本
    const fullTextBefore = document.getText(
        new vscode.Range(new vscode.Position(0, 0), position)
    );

    // 保护字符串、注释、变量
    let clean = fullTextBefore;
    clean = clean.replace(/'([^'\n]|'')*'/g, m => ' '.repeat(m.length));
    clean = clean.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
    clean = clean.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));
    clean = clean.replace(/\$\{[^}]*\}/g, m => ' '.repeat(m.length));

    const ctx = {
        isStatementStart: false,
        isExpressionContext: false,
        isTableContext: false,
        isColumnDefContext: false,
        isAfterDot: false,
        dotPrefix: '',
        lastKeyword: '',
        inSelectList: false,
        inGroupByList: false,
    };

    // 检查是否在语句起始位置
    const trimmed = clean.trimEnd();
    if (trimmed.length === 0 || /;\s*$/.test(trimmed)) {
        ctx.isStatementStart = true;
        return ctx;
    }

    // 点号补全检测
    const dotMatch = textBeforeCursor.match(/([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\.\s*$/);
    if (dotMatch) {
        ctx.isAfterDot = true;
        ctx.dotPrefix = dotMatch[1];
        ctx.isExpressionContext = true;
        return ctx;  // 点号后只补字段，快速返回
    }

    // 扫描所有子句关键字，找到光标前最后一个
    const clauseRe = /\b(SELECT|FROM|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|SET|VALUES|ON|INNER\s+JOIN|LEFT\s+(?:SEMI\s+|ANTI\s+)?JOIN|RIGHT\s+JOIN|FULL\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN|NATURAL\s+JOIN|JOIN|AND|OR|CREATE\s+(?:TEMPORARY|TEMP|LOCAL\s+TEMPORARY|GLOBAL\s+TEMPORARY)?\s*TABLE|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH|CASE|WHEN|THEN|ELSE|END|UNION|INTERSECT|EXCEPT|MINUS|MERGE)\b/gi;

    const matches = [];
    let m;
    while ((m = clauseRe.exec(clean)) !== null) {
        const kw = m[1].toUpperCase().replace(/\s+/g, ' ');
        matches.push({ keyword: kw, index: m.index, endIndex: m.index + m[0].length });
    }

    if (matches.length === 0) {
        ctx.isStatementStart = true;
        return ctx;
    }

    const last = matches[matches.length - 1];
    ctx.lastKeyword = last.keyword;

    // 表达式上下文：字段/函数/运算符可能出现的位置
    const exprKeywords = new Set([
        'SELECT', 'WHERE', 'HAVING', 'AND', 'OR', 'WHEN', 'THEN', 'SET', 'ON',
        'CASE', 'ELSE', 'END', 'THEN',
    ]);

    // 表上下文：表名可能出现的位置
    const tableKeywords = new Set([
        'FROM', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'LEFT SEMI JOIN', 'LEFT ANTI JOIN',
        'RIGHT JOIN', 'FULL JOIN', 'FULL OUTER JOIN', 'CROSS JOIN', 'NATURAL JOIN',
        'INSERT INTO', 'UPDATE', 'DELETE FROM',
    ]);

    // 分组/排序列表上下文
    const listKeywords = new Set(['GROUP BY', 'ORDER BY']);

    // CREATE TABLE 列定义上下文
    const createTableKeywords = ['CREATE TABLE', 'CREATE TEMPORARY TABLE', 'CREATE TEMP TABLE',
        'CREATE LOCAL TEMPORARY TABLE', 'CREATE GLOBAL TEMPORARY TABLE'];

    if (exprKeywords.has(last.keyword)) {
        ctx.isExpressionContext = true;
    }

    if (tableKeywords.has(last.keyword)) {
        ctx.isTableContext = true;
    }

    if (listKeywords.has(last.keyword)) {
        ctx.inGroupByList = true;
        ctx.isExpressionContext = true;
    }

    // 检测 CREATE TABLE 列定义上下文: 在 ( 和 ) 之间
    if (createTableKeywords.some(k => last.keyword === k)) {
        const afterKW = clean.slice(last.endIndex);
        const openParen = afterKW.indexOf('(');
        const closeParen = afterKW.indexOf(')');
        if (openParen !== -1) {
            const afterOpen = afterKW.slice(openParen + 1);
            // 光标在 openParen 之后且 closeParen 之前（或没有 closeParen）
            if (closeParen === -1 || afterOpen.length > afterKW.length - openParen - 1 - closeParen) {
                ctx.isColumnDefContext = true;
            }
        }
    }

    // SELECT 列表中逗号触发: 前一个是 SELECT 且光标前有逗号
    if (last.keyword === 'SELECT' && /,\s*$/.test(textBeforeCursor)) {
        ctx.inSelectList = true;
        ctx.isExpressionContext = true;
    }

    // GROUP BY / ORDER BY 列表中逗号触发
    if (listKeywords.has(last.keyword) && /,\s*$/.test(textBeforeCursor)) {
        ctx.inGroupByList = true;
        ctx.isExpressionContext = true;
    }

    return ctx;
}

/**
 * 从文档中提取所有 CTE 名称（WITH name AS (）
 */
function getCTENames(document) {
    const text = document.getText();
    // 保护注释和字符串
    let clean = text;
    clean = clean.replace(/'([^'\n]|'')*'/g, m => ' '.repeat(m.length));
    clean = clean.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
    clean = clean.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));

    const names = new Map();
    // 匹配: WITH cte_name AS ( 或 , cte_name AS (
    const cteRe = /(?:^|\bWITH\b|,)\s*([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s+AS\s*\(/gi;
    let m;
    while ((m = cteRe.exec(clean)) !== null) {
        const name = m[1];
        if (!names.has(name.toLowerCase())) {
            names.set(name.toLowerCase(), { name, index: m.index });
        }
    }
    return names;
}

/**
 * 从文档的 CREATE TABLE 语句中提取临时表及其字段
 * 复用 table-scanner 的 scanTables
 */
function getTempTableColumns(document) {
    const text = document.getText();
    const result = scanTables(text);
    return result.temp;  // Map<lowercaseName, { name, columns, ... }>
}

/**
 * 代码补全主函数
 *
 * 按优先级提供:
 *   1. Snippet 模板（语句起始位置）
 *   2. SQL 关键字（按上下文排序）
 *   3. 函数名（表达式上下文）
 *   4. 数据类型（列定义上下文）
 *   5. CTE 名称（从文档提取）
 *   6. 临时表字段（从文档 CREATE TABLE 提取）
 *   7. .metadata CSV 表名/字段名
 */
function doProvideCompletionItems(document, position) {
    const items = [];

    // ---- 获取光标前文本 -------
    const rangeUntilCursor = new vscode.Range(
        new vscode.Position(position.line, 0),
        position
    );
    const textBeforeCursor = document.getText(rangeUntilCursor);
    const upperBefore = textBeforeCursor.toUpperCase();
    const currentWord = completionData.getCurrentWord(textBeforeCursor);

    // ---- 上下文检测 ----
    const ctx = detectSQLContext(document, position, textBeforeCursor);
    logger.debug(`[补全] 上下文: stmt=${ctx.isStatementStart} expr=${ctx.isExpressionContext} tbl=${ctx.isTableContext} colDef=${ctx.isColumnDefContext} dot=${ctx.isAfterDot} lastKW="${ctx.lastKeyword}"`);

    // ========== 1. Snippet 模板（语句起始 + 不在点号后） ==========
    if (ctx.isStatementStart && !ctx.isAfterDot) {
        const snippetItems = completionData.createSnippetItems();
        logger.debug(`[补全] Snippet: ${snippetItems.length} 个`);
        items.push(...snippetItems);
    }

    // ========== 2. SQL 关键字（按上下文智能排序） ==========
    if (!ctx.isAfterDot) {
        const kwItems = completionData.createKeywordItems(ctx, currentWord);
        if (kwItems.length > 0) {
            logger.debug(`[补全] 关键字: ${kwItems.length} 个 (context: stmt=${ctx.isStatementStart} expr=${ctx.isExpressionContext} tbl=${ctx.isTableContext} colDef=${ctx.isColumnDefContext})`);
            items.push(...kwItems);
        }
    }

    // ========== 3. 函数名（表达式上下文） ==========
    if (ctx.isExpressionContext && !ctx.isAfterDot) {
        const fnItems = completionData.createFunctionItems(currentWord);
        if (fnItems.length > 0) {
            logger.debug(`[补全] 函数: ${fnItems.length} 个`);
            items.push(...fnItems);
        }
    }

    // ========== 4. 数据类型（列定义上下文） ==========
    if (ctx.isColumnDefContext) {
        const typeItems = completionData.createTypeItems(currentWord);
        if (typeItems.length > 0) {
            logger.debug(`[补全] 数据类型: ${typeItems.length} 个`);
            items.push(...typeItems);
        }
    }

    // ========== 5. CTE 名称补全 ==========
    if (!ctx.isAfterDot && !ctx.isColumnDefContext) {
        const cteNames = getCTENames(document);
        for (const [key, cte] of cteNames) {
            if (!completionData.matchPrefix(currentWord, cte.name)) continue;
            const item = new vscode.CompletionItem(cte.name, vscode.CompletionItemKind.Variable);
            item.detail = 'CTE · WITH ... AS';
            item.documentation = new vscode.MarkdownString(
                `**CTE: ${cte.name}**  \n*WITH 子句中定义的公共表表达式*`
            );
            item.sortText = '2' + cte.name;
            items.push(item);
        }
        if (cteNames.size > 0) {
            logger.debug(`[补全] CTE: ${cteNames.size} 个名称`);
        }
    }

    // ========== 6. 临时表字段补全 ==========
    const tempTables = getTempTableColumns(document);
    if (ctx.isAfterDot && ctx.dotPrefix) {
        // 点号后：补全该表别名对应的临时表字段
        const aliasMap = parseAliasDefinitions(document);
        let resolvedName = ctx.dotPrefix.toLowerCase();
        if (aliasMap.has(resolvedName)) {
            resolvedName = aliasMap.get(resolvedName).tableName.toLowerCase();
        }
        const tempDef = tempTables.get(resolvedName);
        if (tempDef && tempDef.columns && tempDef.columns.length > 0) {
            for (const col of tempDef.columns) {
                const colName = col.column_name || col.name || (Array.isArray(col) ? col[0] : '');
                const colType = col.data_type || (Array.isArray(col) ? col[1] : '');
                if (!colName) continue;
                if (currentWord && !colName.toLowerCase().startsWith(currentWord.toLowerCase())) continue;
                const item = new vscode.CompletionItem(colName, vscode.CompletionItemKind.Field);
                item.detail = `${colType} · ${tempDef.name} (临时表)`;
                item.documentation = new vscode.MarkdownString(
                    `**${tempDef.name}.${colName}**  \n类型: \`${colType}\`  \n*临时表字段*`
                );
                item.sortText = '1' + colName;
                items.push(item);
            }
            logger.debug(`[补全] 临时表字段 (dot): ${tempDef.name} → ${tempDef.columns.length} 个字段`);
        }
    } else if (ctx.isExpressionContext) {
        // SELECT/WHERE 等表达式中：补全所有临时表的所有字段
        for (const [tblKey, def] of tempTables) {
            if (!def.columns || def.columns.length === 0) continue;
            for (const col of def.columns) {
                const colName = col.column_name || col.name || (Array.isArray(col) ? col[0] : '');
                const colType = col.data_type || (Array.isArray(col) ? col[1] : '');
                if (!colName) continue;
                if (currentWord && !colName.toLowerCase().startsWith(currentWord.toLowerCase())) continue;
                const item = new vscode.CompletionItem(colName, vscode.CompletionItemKind.Field);
                item.detail = `${colType} · ${def.name}`;
                item.documentation = new vscode.MarkdownString(
                    `**${def.name}.${colName}**  \n类型: \`${colType}\`  \n*临时表字段*`
                );
                item.sortText = '3' + colName;
                items.push(item);
            }
        }
    }
    // 临时表名补全（表上下文）
    if (ctx.isTableContext) {
        for (const [tblKey, def] of tempTables) {
            if (!completionData.matchPrefix(currentWord, def.name)) continue;
            const item = new vscode.CompletionItem(def.name, vscode.CompletionItemKind.Class);
            item.detail = (def.isTemp ? '临时表' : '表') + ` · ${def.columns ? def.columns.length + ' 列' : ''}`;
            item.documentation = new vscode.MarkdownString(
                `**${def.name}**  \n${def.isTemp ? 'CREATE TEMP TABLE 定义' : 'CREATE TABLE 定义'}  \n${def.columns ? def.columns.length + ' 个字段' : ''}`
            );
            item.sortText = '1' + def.name;
            items.push(item);
        }
    }

    // ========== 7. .metadata CSV 表名/字段名补全 ==========
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (workspaceFolder) {
        const metadata = loadMetadata(workspaceFolder.uri.fsPath);
        if (metadata && metadata.tables && metadata.tables.size > 0) {
            logger.debug(`[补全] 元数据: ${metadata.tables.size} 张表, ${metadata.columns.size} 个有字段定义的表`);

            if (ctx.isAfterDot && ctx.dotPrefix) {
                // 表别名. 之后 → 补全该表的字段
                const aliasMap = parseAliasDefinitions(document);
                let resolvedName = ctx.dotPrefix.toLowerCase();
                if (aliasMap.has(resolvedName)) {
                    resolvedName = aliasMap.get(resolvedName).tableName.toLowerCase();
                }
                const columns = metadata.columns.get(resolvedName);
                if (columns && columns.length > 0) {
                    for (const col of columns) {
                        if (currentWord && !col.column_name.toLowerCase().startsWith(currentWord.toLowerCase())) continue;
                        const item = new vscode.CompletionItem(col.column_name, vscode.CompletionItemKind.Field);
                        item.detail = `${col.data_type}${col.nullable ? '' : ' NOT NULL'}${col.default_value ? ' DEFAULT ' + col.default_value : ''}`;
                        item.documentation = new vscode.MarkdownString(
                            `**${col.table_name}.${col.column_name}**  \n` +
                            `类型: \`${col.data_type}\`${col.nullable ? ' 可空' : ' 不可空'}  \n` +
                            `${col.default_value ? '默认值: \`' + col.default_value + '\`  \n' : ''}` +
                            `${col.description || ''}`
                        );
                        item.sortText = '0' + col.column_name;
                        items.push(item);
                    }
                }
            } else if (ctx.isTableContext) {
                // FROM/JOIN 之后 → 补全表名
                for (const [key, t] of metadata.tables) {
                    if (!completionData.matchPrefix(currentWord, t.table_name)) continue;
                    const item = new vscode.CompletionItem(t.table_name, vscode.CompletionItemKind.Class);
                    item.detail = `${t.type}${t.schema ? ' · ' + t.schema : ''}${t.database ? '@' + t.database : ''}`;
                    item.documentation = new vscode.MarkdownString(
                        `**${t.table_name}**  \n` +
                        `类型: ${t.type}  \n` +
                        `${t.schema ? 'Schema: \`' + t.schema + '\`  \n' : ''}` +
                        `${t.database ? 'Database: \`' + t.database + '\`  \n' : ''}` +
                        `${t.description || ''}`
                    );
                    item.sortText = '0' + t.table_name;
                    items.push(item);
                }
            } else if (ctx.isExpressionContext) {
                // SELECT/WHERE 等表达式中 → 列出所有表的所有字段（全局字段补全）
                const seen = new Set();
                for (const [tableKey, cols] of metadata.columns) {
                    if (!cols || cols.length === 0) continue;
                    for (const col of cols) {
                        if (seen.has(col.column_name)) continue;
                        if (currentWord && !col.column_name.toLowerCase().startsWith(currentWord.toLowerCase())) continue;
                        seen.add(col.column_name);
                        const item = new vscode.CompletionItem(col.column_name, vscode.CompletionItemKind.Field);
                        item.detail = `${col.data_type} · ${col.table_name}`;
                        item.documentation = new vscode.MarkdownString(
                            `**${col.table_name}.${col.column_name}**  \n` +
                            `类型: \`${col.data_type}\`${col.nullable ? ' 可空' : ' 不可空'}  \n` +
                            `${col.description || ''}`
                        );
                        item.sortText = '2' + col.column_name;
                        items.push(item);
                    }
                }
            }
        }
    }

    logger.info(`[补全] 总计 ${items.length} 个候选项 (context: ${ctx.isStatementStart ? 'stmt' : ''}${ctx.isExpressionContext ? ' expr' : ''}${ctx.isTableContext ? ' tbl' : ''}${ctx.isColumnDefContext ? ' colDef' : ''}${ctx.isAfterDot ? ' dot' : ''})`);
    return items;
}

// ---- 语义 Token 提供 ----
function provideSemanticTokens(document, legend) {
    logger.debug('[语义高亮] 开始分析', { lang: document.languageId, file: document.fileName });
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
        // 保护变量，防止 ${VAR} 干扰标识符匹配
        const cleanUpper = upper.replace(/\$\{[^}]*\}(?:\.)?/g, m => ' '.repeat(m.length));

        // (A) FROM / JOIN / INTO / UPDATE / TABLE / TRUNCATE / DESCRIBE 后的标识符 → 表名 (class)
        const tableContextRegex = /(?:FROM|JOIN|INTO|UPDATE|TABLE|TRUNCATE|DESCRIBE|DESC)\s+([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_.\u4e00-\u9fa5]*)/gi;
        let m;
        while ((m = tableContextRegex.exec(cleanUpper)) !== null) {
            const word = m[1];
            if (keywords.has(word.toUpperCase())) continue;
            // 在原始 upper 中定位（变量被替换为空格后位置偏移，但标识符部分位置不变）
            const start = upper.indexOf(word, m.index - 5); // 从附近开始搜索
            if (start !== -1) {
                builder.push(i, indentLen + start, word.length, 0, 0);
            }
        }

        // (B) 表别名声明（表名后有空格+短标识符，非关键字）→ variable.declaration
        const aliasDeclRegex = /\b([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_.\u4e00-\u9fa5]*)\s+([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)(?=[\s\(\);,\|]|$)/g;
        while ((m = aliasDeclRegex.exec(cleanUpper)) !== null) {
            const alias = m[2];
            if (keywords.has(alias.toUpperCase())) continue;
            const before = cleanUpper.substring(0, m.index).trimEnd();
            if (before.endsWith(' AS') || before.endsWith(' as')) continue;
            const start = upper.indexOf(alias, m.index + m[1].length - 5);
            if (start !== -1 && alias.length <= 20) {
                builder.push(i, indentLen + start, alias.length, 2, 0);
            }
        }

        // (C) AS 别名 → variable.declaration
        const asAliasRegex = /\bAS\s+([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)(?=[\s\(\);,\|]|$)/gi;
        while ((m = asAliasRegex.exec(upper)) !== null) {
            const alias = m[1];
            if (keywords.has(alias.toUpperCase())) continue;
            const start = trimmed.indexOf(alias, m.index + 3);
            if (start !== -1) {
                builder.push(i, indentLen + start, alias.length, 2, 0);
            }
        }

        // (D) 表名.字段名 → property (字段部分高亮)
        const dotFieldRegex = /\.([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)/g;
        while ((m = dotFieldRegex.exec(trimmed)) !== null) {
            const field = m[1];
            if (keywords.has(field.toUpperCase())) continue;
            builder.push(i, indentLen + m.index + 1, field.length, 1, 0);
        }
    }

    const tokens = builder.build();
    logger.debug(`[语义高亮] 完成, 共 ${tokens.length} 个 token`, { lang: document.languageId });
    return tokens;
}

// ========== 文档大纲 (Document Symbol) ==========

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
        // 找到 CREATE 语句结束位置（分号或下一个 CREATE/DROP 或文档尾）
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
    // 匹配: WITH cte_name AS ( 或 , cte_name AS (
    const cteRe = /(?:^|\bWITH\b|,)\s*([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s+AS\s*\(/gi;
    while ((m = cteRe.exec(clean)) !== null) {
        const cteName = m[1];
        const startPos = document.positionAt(m.index);
        // 找到匹配的 )
        let depth = 0, endIdx = m.index + m[0].length - 1; // 从 ( 开始
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

function deactivate() {
    logger.info('SQL Dialect Highlight 扩展停用');
    require('./metadata-loader').clearCache();
}

module.exports = { activate, deactivate };
