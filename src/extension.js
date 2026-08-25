/**
 * extension.js — SQL Dialect Highlight 扩展入口
 *
 * 职责: 激活时注册所有 Provider (格式化/语义/括号/悬停/跳转/补全/大纲/依赖视图)
 */
'use strict';

const vscode = require('vscode');
const logger = require('./logger');

const { createFormatProvider } = require('./providers/format-provider');
const { createLegend, provideSemanticTokens } = require('./providers/semantic-tokens');
const { registerBracketHighlight } = require('./providers/bracket-highlight');
const { provideAliasHover, provideTableHover } = require('./providers/hover-provider');
const { provideAliasDefinition, provideTableDefinition } = require('./providers/definition-provider');
const { doProvideCompletionItems } = require('./providers/completion-provider');
const { provideSQLDocumentSymbols } = require('./providers/document-symbols');

const { scanTablesForDocument } = require('./core/table-scanner');
const { loadTableColumns } = require('./core/metadata-loader');
const { DepsTreeProvider } = require('./views/deps-view-provider');

const SUPPORTED_LANGUAGES = ['sql-tdh', 'sql-gaussdb'];

/**
 * 激活扩展
 */
function activate(context) {
    logger.init(context);
    logger.info('SQL Dialect Highlight 扩展开始激活...');

    // ========== 1. SQL 格式化 (全文 + 选区) ==========
    SUPPORTED_LANGUAGES.forEach(lang => {
        const provider = createFormatProvider(lang);
        context.subscriptions.push(
            vscode.languages.registerDocumentFormattingEditProvider(lang, provider),
            vscode.languages.registerDocumentRangeFormattingEditProvider(lang, provider)
        );
    });

    // ========== 2. 语义高亮：表名 / 字段名 / 别名 ==========
    const legend = createLegend();
    SUPPORTED_LANGUAGES.forEach(lang => {
        context.subscriptions.push(
            vscode.languages.registerDocumentSemanticTokensProvider(lang, {
                provideDocumentSemanticTokens(document) {
                    return provideSemanticTokens(document, legend);
                }
            }, legend)
        );
    });

    // ========== 3. 文档大纲 ==========
    logger.info('[大纲] 注册文档符号提供器...');
    SUPPORTED_LANGUAGES.forEach(lang => {
        context.subscriptions.push(
            vscode.languages.registerDocumentSymbolProvider(lang, {
                provideDocumentSymbols(document) {
                    return provideSQLDocumentSymbols(document);
                }
            })
        );
    });

    // ========== 4. CASE/BEGIN ↔ END 括号配对 ==========
    logger.info('[括号配对] 注册 CASE↔END, BEGIN↔END, WHEN↔THEN 配对高亮...');
    registerBracketHighlight(context);

    // ========== 5. 侧面板表依赖视图 ==========
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
        if (!SUPPORTED_LANGUAGES.includes(langId)) { depsProvider.clear(); return; }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!workspaceFolder) { depsProvider.clear(); return; }

        // 复用文档版本缓存，文档未编辑时避免重复全量扫描
        const scanResult = scanTablesForDocument(editor.document);
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

    // 文档变化时刷新（防抖 500ms）
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
    setTimeout(refreshDepsView, 1000);

    // ========== 6. Hover + Definition: 表别名 & 临时表跳转 ==========
    SUPPORTED_LANGUAGES.forEach(lang => {
        // Hover: 别名提示原表，表名提示 CREATE 定义
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
        // Definition: 别名跳转、临时表跳转到 CREATE
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
        // Completion: 代码补全
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

    // ========== 7. 方言自动识别（.sql 内容特征 → 自动切换 TDH/GaussDB） ==========
    registerDialectAutoDetect(context);

    logger.info('SQL Dialect Highlight 已激活 (TDH & GaussDB)');
    vscode.window.showInformationMessage('SQL Dialect Highlight 已激活 (TDH & GaussDB)');
}

/**
 * 方言自动识别：打开普通 .sql 文件时，按内容特征自动判断 TDH 还是 GaussDB，
 * 并切换语言（语法高亮 + 文件图标随之生效）。
 */
const DIALECT_RULES = [
    {
        lang: 'sql-tdh',
        patterns: [
            /^\s*--\s*(@dialect\s*:\s*tdh|tdh\s*sql)/i,
            /\b(ADD JAR|INCEPTOR|LATERAL VIEW|TRANSACTIONAL|SHOW CREATE TABLE|CLUSTER BY|DISTRIBUTE BY|STORED AS ORC|hive\.|set\s+hive\.)/i
        ]
    },
    {
        lang: 'sql-gaussdb',
        patterns: [
            /^\s*--\s*(@dialect\s*:\s*gauss|gaussdb\s*sql)/i,
            /\b(SET search_path|pg_catalog|information_schema|ON CONFLICT|RETURNING|::\w+|SERIAL|BIGSERIAL)\b/i
        ]
    }
];

function detectDialect(text) {
    for (const rule of DIALECT_RULES) {
        if (rule.patterns.some(p => p.test(text))) {
            return rule.lang;
        }
    }
    return null;
}

function registerDialectAutoDetect(context) {
    async function autoDetect(document) {
        if (!document) return;
        // 只处理普通 SQL / 纯文本（已明确 .tdhsql/.gaussql 的跳过）
        if (document.languageId !== 'sql' && document.languageId !== 'plaintext') return;
        const text = document.getText();
        if (text.length > 200000) return; // 超大文件跳过
        // 1. 目录配置优先：配置的目录强制指定方言
        const dirLang = dirDialectFor(document);
        if (dirLang && document.languageId !== dirLang) {
            try {
                await vscode.languages.setTextDocumentLanguage(document, dirLang);
                logger.info('[方言识别] ' + document.fileName + ' → ' + dirLang + '（目录配置）');
            } catch (e) {
                logger.warn('[方言识别] 切换失败: ' + e.message);
            }
            return;
        }
        // 2. 内容特征识别
        const lang = detectDialect(text);
        if (lang && document.languageId !== lang) {
            try {
                await vscode.languages.setTextDocumentLanguage(document, lang);
                logger.info('[方言识别] ' + document.fileName + ' → ' + lang);
            } catch (e) {
                logger.warn('[方言识别] 切换失败: ' + e.message);
            }
        }
    }

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(autoDetect),
        vscode.window.onDidChangeActiveTextEditor(ed => autoDetect(ed && ed.document))
    );
}

/**
 * 目录方言配置：sqlDialectHighlight.dirDialects = { "etl/tdh": "tdh", "etl/gauss": "gauss" }
 * 匹配目录（路径包含即命中）→ 强制使用对应方言。
 */
function dirDialectFor(document) {
    const cfg = vscode.workspace.getConfiguration('sqlDialectHighlight');
    const dirs = cfg.get('dirDialects') || {};
    const fsPath = document.uri.fsPath.replace(/\\/g, '/');
    for (const dir of Object.keys(dirs)) {
        if (dir && fsPath.includes(dir.replace(/\\/g, '/'))) {
            const v = String(dirs[dir]).toLowerCase();
            if (v === 'tdh') return 'sql-tdh';
            if (v === 'gauss' || v === 'gaussdb') return 'sql-gaussdb';
        }
    }
    return null;
}

/**
 * 停用扩展
 */
function deactivate() {
    logger.info('SQL Dialect Highlight 扩展停用');
    require('./core/metadata-loader').clearCache();
    require('./core/doc-cache').clear();
}

module.exports = { activate, deactivate };