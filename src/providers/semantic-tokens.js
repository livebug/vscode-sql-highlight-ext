/**
 * semantic-tokens.js — 语义高亮提供器（表名/字段名/别名着色）
 */
'use strict';

const vscode = require('vscode');
const logger = require('../logger');

// 关键字集合（用于跳过）
const KEYWORDS = new Set([
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

/**
 * 语义 token 类型定义
 */
const TOKEN_TYPES = ['class', 'property', 'variable', 'function'];
const TOKEN_MODIFIERS = ['declaration', 'readonly'];

function createLegend() {
    return new vscode.SemanticTokensLegend(TOKEN_TYPES, TOKEN_MODIFIERS);
}

/**
 * 提供语义高亮 Token
 */
function provideSemanticTokens(document, legend) {
    logger.debug('[语义高亮] 开始分析', { lang: document.languageId, file: document.fileName });
    const builder = new vscode.SemanticTokensBuilder(legend);
    const text = document.getText();
    const lines = text.split('\n');

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
            if (KEYWORDS.has(word.toUpperCase())) continue;
            const start = upper.indexOf(word, m.index - 5);
            if (start !== -1) {
                builder.push(i, indentLen + start, word.length, 0, 0);
            }
        }

        // (B) 表别名声明（表名后有空格+短标识符，非关键字）→ variable.declaration
        const aliasDeclRegex = /\b([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_.\u4e00-\u9fa5]*)\s+([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)(?=[\s\(\);,\|]|$)/g;
        while ((m = aliasDeclRegex.exec(cleanUpper)) !== null) {
            const alias = m[2];
            if (KEYWORDS.has(alias.toUpperCase())) continue;
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
            if (KEYWORDS.has(alias.toUpperCase())) continue;
            const start = trimmed.indexOf(alias, m.index + 3);
            if (start !== -1) {
                builder.push(i, indentLen + start, alias.length, 2, 0);
            }
        }

        // (D) 表名.字段名 → property (字段部分高亮)
        const dotFieldRegex = /\.([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)/g;
        while ((m = dotFieldRegex.exec(trimmed)) !== null) {
            const field = m[1];
            if (KEYWORDS.has(field.toUpperCase())) continue;
            builder.push(i, indentLen + m.index + 1, field.length, 1, 0);
        }
    }

    const tokens = builder.build();
    logger.debug(`[语义高亮] 完成, 共 ${tokens.length} 个 token`, { lang: document.languageId });
    return tokens;
}

module.exports = { createLegend, provideSemanticTokens };