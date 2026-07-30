/**
 * completion-provider.js — SQL 代码补全提供器
 *
 * 提供: 关键字、函数、类型、Snippet、CTE、临时表字段、.metadata 元数据
 */
'use strict';

const vscode = require('vscode');
const logger = require('../logger');
const completionData = require('../core/completion-data');
const { parseAliasDefinitions } = require('../core/alias-parser');
const { scanTables } = require('../core/table-scanner');
const { loadMetadata } = require('../core/metadata-loader');

/**
 * 向后扫描 SQL 文本，检测当前光标所在的补全上下文
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
        return ctx;
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

    // 表达式上下文
    const exprKeywords = new Set([
        'SELECT', 'WHERE', 'HAVING', 'AND', 'OR', 'WHEN', 'THEN', 'SET', 'ON',
        'CASE', 'ELSE', 'END', 'THEN',
    ]);

    // 表上下文
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
            if (closeParen === -1 || afterOpen.length > afterKW.length - openParen - 1 - closeParen) {
                ctx.isColumnDefContext = true;
            }
        }
    }

    // SELECT 列表中逗号触发
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
    let clean = text;
    clean = clean.replace(/'([^'\n]|'')*'/g, m => ' '.repeat(m.length));
    clean = clean.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
    clean = clean.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));

    const names = new Map();
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
 */
function getTempTableColumns(document) {
    const text = document.getText();
    const result = scanTables(text);
    return result.temp;
}

/**
 * 代码补全主函数
 */
function doProvideCompletionItems(document, position) {
    const items = [];

    // ---- 获取光标前文本 -------
    const rangeUntilCursor = new vscode.Range(
        new vscode.Position(position.line, 0),
        position
    );
    const textBeforeCursor = document.getText(rangeUntilCursor);
    const currentWord = completionData.getCurrentWord(textBeforeCursor);

    // ---- 上下文检测 ----
    const ctx = detectSQLContext(document, position, textBeforeCursor);
    logger.debug(`[补全] 上下文: stmt=${ctx.isStatementStart} expr=${ctx.isExpressionContext} tbl=${ctx.isTableContext} colDef=${ctx.isColumnDefContext} dot=${ctx.isAfterDot} lastKW="${ctx.lastKeyword}"`);

    // ========== 1. Snippet 模板 ==========
    if (ctx.isStatementStart && !ctx.isAfterDot) {
        const snippetItems = completionData.createSnippetItems();
        logger.debug(`[补全] Snippet: ${snippetItems.length} 个`);
        items.push(...snippetItems);
    }

    // ========== 2. SQL 关键字 ==========
    if (!ctx.isAfterDot) {
        const kwItems = completionData.createKeywordItems(ctx, currentWord);
        if (kwItems.length > 0) {
            logger.debug(`[补全] 关键字: ${kwItems.length} 个`);
            items.push(...kwItems);
        }
    }

    // ========== 3. 函数名 ==========
    if (ctx.isExpressionContext && !ctx.isAfterDot) {
        const fnItems = completionData.createFunctionItems(currentWord);
        if (fnItems.length > 0) {
            logger.debug(`[补全] 函数: ${fnItems.length} 个`);
            items.push(...fnItems);
        }
    }

    // ========== 4. 数据类型 ==========
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

    logger.info(`[补全] 总计 ${items.length} 个候选项`);
    return items;
}

module.exports = { doProvideCompletionItems, detectSQLContext, getCTENames, getTempTableColumns };