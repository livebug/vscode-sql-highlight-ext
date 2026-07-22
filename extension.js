const vscode = require('vscode');
const { formatSQL } = require('./formatter');
const { loadMetadata } = require('./metadata-loader');
const logger = require('./logger');

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

    // 保护注释和字符串，防止误匹配
    let clean = text;
    clean = clean.replace(/'([^'\n]|'')*'/g, m => ' '.repeat(m.length));
    clean = clean.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
    clean = clean.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));

    // 匹配 FROM/JOIN table_name [[AS] alias] 和逗号分隔 table_name alias 模式
    // 模式1: FROM|JOIN table_name alias / FROM|JOIN table_name AS alias
    // 模式2: , table_name alias (逗号分隔的多表)
    const tableAliasRe = /(?:FROM|JOIN|,)\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+(?:(AS)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*(?:,|JOIN|ON|WHERE|GROUP|HAVING|ORDER|LIMIT|LEFT|RIGHT|INNER|CROSS|FULL|NATURAL|$))/gi;
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
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
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
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
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

    // 保护注释和字符串
    let clean = text;
    clean = clean.replace(/'([^'\n]|'')*'/g, m => ' '.repeat(m.length));
    clean = clean.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
    clean = clean.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));

    const re = /\bCREATE\s+(?:TEMPORARY|TEMP|LOCAL\s+TEMPORARY|GLOBAL\s+TEMPORARY)?\s*TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_.]*)\b/gi;
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
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_.]*/);
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
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_.]*/);
    if (!wordRange) return null;
    const word = document.getText(wordRange);

    const createDefs = parseCreateTableDefs(document);
    const def = createDefs.get(word.toLowerCase());
    if (!def) return null;

    logger.info(`[定义跳转] 表名 '${word}' → CREATE TABLE 定义`);
    return new vscode.Location(document.uri, def.tableNameRange);
}

// ========== 基于 .metadata CSV 的代码补全 ==========

/**
 * 代码补全: 从 .metadata/*.csv 加载数据字典，提供表名 + 字段名补全
 */
function doProvideCompletionItems(document, position) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
        logger.debug('[补全] 未找到工作区，跳过');
        return [];
    }

    const metadata = loadMetadata(workspaceFolder.uri.fsPath);
    if (!metadata || !metadata.tables || metadata.tables.size === 0) {
        logger.debug('[补全] 无 .metadata CSV 数据', { tables: metadata?.tables?.size || 0, cols: metadata?.columns?.size || 0 });
        return [];
    }
    logger.debug(`[补全] 加载元数据: ${metadata.tables.size} 张表, ${metadata.columns.size} 个有字段定义的表`);

    const items = [];
    const rangeUntilCursor = new vscode.Range(
        new vscode.Position(position.line, 0),
        position
    );
    const textBeforeCursor = document.getText(rangeUntilCursor);
    const upperBefore = textBeforeCursor.toUpperCase();

    // ---- 判断补全上下文 ----
    // 上下文1: SELECT ... FROM/JOIN 之后 → 补全表名
    // 上下文2: SELECT ... table_alias.column → 补全字段名
    // 上下文3: 逗号分隔 → 补全字段名

    const isAfterFromJoin = /\b(FROM|JOIN|INTO|UPDATE|TABLE|TRUNCATE|DESCRIBE|DESC)\s+$/i.test(textBeforeCursor)
        || /\b(FROM|JOIN|INTO|UPDATE|TABLE|TRUNCATE|DESCRIBE|DESC)\s+[^,\s]+\s*$/i.test(textBeforeCursor)
        || /,\s*$/i.test(textBeforeCursor) && /\b(FROM|JOIN)\b/i.test(upperBefore);

    const dotMatch = textBeforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_]*)\.\s*$/);

    if (dotMatch) {
        // 表别名. 之后 → 补全该表的字段
        const prefix = dotMatch[1].toLowerCase();
        // 先解析别名映射，找到真实表名
        const aliasMap = parseAliasDefinitions(document);
        const resolvedName = aliasMap.has(prefix) ? aliasMap.get(prefix).tableName.toLowerCase() : prefix;
        const columns = metadata.columns.get(resolvedName);
        if (columns && columns.length > 0) {
            for (const col of columns) {
                const item = new vscode.CompletionItem(col.column_name, vscode.CompletionItemKind.Field);
                item.detail = `${col.data_type}${col.nullable ? '' : ' NOT NULL'}${col.default_value ? ' DEFAULT ' + col.default_value : ''}`;
                item.documentation = new vscode.MarkdownString(
                    `**${col.table_name}.${col.column_name}**  \n` +
                    `类型: \`${col.data_type}\`${col.nullable ? ' 可空' : ' 不可空'}  \n` +
                    `${col.default_value ? '默认值: `' + col.default_value + '`  \n' : ''}` +
                    `${col.description || ''}`
                );
                item.sortText = '0' + col.column_name;
                items.push(item);
            }
        }
    } else if (isAfterFromJoin) {
        // FROM/JOIN 之后 → 补全表名
        for (const [key, t] of metadata.tables) {
            const item = new vscode.CompletionItem(t.table_name, vscode.CompletionItemKind.Class);
            item.detail = `${t.type}${t.schema ? ' · ' + t.schema : ''}${t.database ? '@' + t.database : ''}`;
            item.documentation = new vscode.MarkdownString(
                `**${t.table_name}**  \n` +
                `类型: ${t.type}  \n` +
                `${t.schema ? 'Schema: `' + t.schema + '`  \n' : ''}` +
                `${t.database ? 'Database: `' + t.database + '`  \n' : ''}` +
                `${t.description || ''}`
            );
            item.sortText = '0' + t.table_name;
            items.push(item);
        }
    } else if (/\bSELECT\b/i.test(upperBefore)) {
        // SELECT 之后 → 列出所有表的所有字段（全局字段补全）
        const seen = new Set();
        for (const [tableKey, cols] of metadata.columns) {
            if (!cols || cols.length === 0) continue;
            for (const col of cols) {
                if (seen.has(col.column_name)) continue;
                seen.add(col.column_name);
                const item = new vscode.CompletionItem(col.column_name, vscode.CompletionItemKind.Field);
                item.detail = `${col.data_type} · ${col.table_name}`;
                item.documentation = new vscode.MarkdownString(
                    `**${col.table_name}.${col.column_name}**  \n` +
                    `类型: \`${col.data_type}\`${col.nullable ? ' 可空' : ' 不可空'}  \n` +
                    `${col.description || ''}`
                );
                item.sortText = '1' + col.column_name;
                items.push(item);
            }
        }
    }

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

    const tokens = builder.build();
    logger.debug(`[语义高亮] 完成, 共 ${tokens.length} 个 token`, { lang: document.languageId });
    return tokens;
}

function deactivate() {
    logger.info('SQL Dialect Highlight 扩展停用');
    require('./metadata-loader').clearCache();
}

module.exports = { activate, deactivate };
