#!/usr/bin/env node
/**
 * SQL Formatter 语义对比测试脚本
 * 用法: node test/semantic_diff.js <原始sql文件> [格式化后sql文件]
 *
 * 对比维度:
 *   A. 语句数量一致性
 *   B. 关键字保留检查
 *   C. 标识符 / 变量 / 字符串字面量一致性
 *   D. 行内注释位置偏移检测
 *   E. 特殊语法结构检测 (BETWEEN/OVER/FULL OUTER JOIN)
 *   F. 结构性 bug 检测 (误合并/断开/缺失)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ======================== 工具函数 ========================

/** 提取所有 SQL 关键字（不区分大小写） */
function extractKeywords(text) {
    const kw = new Set([
        'SELECT','FROM','WHERE','AND','OR','NOT','IN','EXISTS','BETWEEN','LIKE','RLIKE','REGEXP','IS','NULL','TRUE','FALSE',
        'AS','ON','JOIN','INNER','LEFT','RIGHT','FULL','CROSS','NATURAL','OUTER','SEMI','ANTI','UNION','ALL','INTERSECT','EXCEPT','MINUS',
        'INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','ALTER','DROP','TRUNCATE','REPLACE','MERGE',
        'GRANT','REVOKE','ORDER','GROUP','HAVING','LIMIT','OFFSET','FETCH','FOR','ASC','DESC','NULLS','FIRST','LAST','BY',
        'CASE','WHEN','THEN','ELSE','END','DISTINCT','WITH','RECURSIVE','WINDOW','OVER','PARTITION',
        'ROWS','RANGE','UNBOUNDED','PRECEDING','FOLLOWING','CURRENT','ROW','LATERAL','VIEW','TABLE','SCHEMA','DATABASE',
        'TEMP','TEMPORARY','IF','EXISTS','BEGIN','CALL','COMMIT','ROLLBACK',
        'PRIMARY','KEY','FOREIGN','REFERENCES','INDEX','CONSTRAINT','CHECK','UNIQUE','ADD','COLUMN','DEFAULT','CASCADE','RESTRICT',
    ]);
    const re = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    const counts = {};
    let m;
    while ((m = re.exec(text)) !== null) {
        const w = m[0].toUpperCase();
        if (kw.has(w)) counts[w] = (counts[w] || 0) + 1;
    }
    return counts;
}

/** 提取所有 ${VAR} 变量引用 */
function extractVariables(text) {
    const re = /\$\{[a-zA-Z_][a-zA-Z0-9_]*\}/g;
    const vars = [];
    let m;
    while ((m = re.exec(text)) !== null) vars.push(m[0]);
    return vars;
}

/** 提取所有字符串字面量（单引号） */
function extractStringLiterals(text) {
    const re = /'[^']*'/g;
    const strs = [];
    let m;
    while ((m = re.exec(text)) !== null) strs.push(m[0]);
    return strs;
}

/** 提取反引号标识符 */
function extractBacktickIds(text) {
    const re = /`[^`]*`/g;
    const ids = [];
    let m;
    while ((m = re.exec(text)) !== null) ids.push(m[0]);
    return ids;
}

/** 通过 ; 拆分 SQL 语句（忽略注释和字符串内的分号） */
function splitStatements(text) {
    // 先去掉注释和字符串的影响
    let clean = text
        .replace(/--[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/'[^']*'/g, "''")
        .replace(/`[^`]*`/g, '``');
    const stmts = clean.split(';').map(s => s.trim()).filter(Boolean);
    return stmts;
}

/** 检测小写关键字（格式化后应全大写） */
function detectLowercaseKeywords(text) {
    const kw = new Set([
        'SELECT','FROM','WHERE','AND','OR','NOT','IN','EXISTS','BETWEEN','LIKE',
        'AS','ON','JOIN','INNER','LEFT','RIGHT','FULL','CROSS','NATURAL','OUTER',
        'UNION','ALL','INTERSECT','EXCEPT','INSERT','INTO','VALUES','UPDATE','SET',
        'DELETE','CREATE','ALTER','DROP','TRUNCATE','ORDER','GROUP','HAVING','LIMIT',
        'OFFSET','FETCH','FOR','ASC','DESC','CASE','WHEN','THEN','ELSE','END',
        'DISTINCT','WITH','RECURSIVE','OVER','PARTITION','IS','NULL','TRUE','FALSE',
        'TABLE','VIEW','SCHEMA','DATABASE','IF','EXISTS','BEGIN','PRIMARY','KEY',
        'FOREIGN','REFERENCES','INDEX','CONSTRAINT','CHECK','UNIQUE',
    ]);
    const re = /\b([a-z][a-z0-9_]*)\b/g;
    const lower = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        const w = m[0].toUpperCase();
        if (kw.has(w)) lower.push({word: m[0], pos: m.index});
    }
    return lower;
}

/** 检测 "FULL OUTER" 后换行的 JOIN */
function detectBrokenPhrases(text) {
    const issues = [];
    // FULL OUTER\n    JOIN
    const re = /FULL\s+OUTER\s*\n\s*JOIN/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
        issues.push({type: 'broken_phrase', phrase: 'FULL OUTER JOIN', line: lineAt(text, m.index)});
    }
    return issues;
}

/** 获取指定偏移所在行号 */
function lineAt(text, offset) {
    return text.slice(0, offset).split('\n').length;
}

/** 检测 BETWEEN ... AND 被误拆 */
function detectBrokenBetween(text) {
    const issues = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        // 检测某行以 AND 结尾 (BETWEEN 10\nAND 20 模式)
        if (/BETWEEN\s+\S+$/.test(lines[i].trim())) {
            issues.push({
                type: 'broken_between',
                line: i + 1,
                detail: 'BETWEEN 后的 AND 条件被拆分到独立行',
                context: lines[i].trim() + ' ...',
            });
        }
        // 检测纯 AND 数字 的行（BETWEEN 断开后的另一半）
        if (/^\s*AND\s+\d+/.test(lines[i])) {
            issues.push({
                type: 'broken_between',
                line: i + 1,
                detail: 'AND 数值独立成行（疑似 BETWEEN 断裂）',
                context: lines[i].trim(),
            });
        }
    }
    return issues;
}

/** 检测行内注释嵌在 SQL 中间导致的结构问题 */
function detectInlineCommentsInSQL(text) {
    const issues = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        // COMMA 后跟 -- 注释再跟字段（逗号前置时）
        if (/^\s*,\s*--/.test(lines[i]) && i + 1 < lines.length) {
            const next = lines[i + 1];
            if (/^\s*(SELECT|FROM|WHERE|AND|OR|JOIN|ON|ORDER|GROUP)/i.test(next.trim())) {
                // 正常，跳过
            } else {
                issues.push({
                    type: 'inline_comment_break',
                    line: i + 1,
                    detail: '逗号+行内注释可能中断字段列表结构',
                });
            }
        }
    }
    return issues;
}

// ======================== 主测试逻辑 ========================

function runSemanticTest(originalPath, formattedPath) {
    const report = {
        file: path.basename(originalPath),
        timestamp: new Date().toISOString(),
        summary: {},
        keywordComparison: null,
        variableComparison: null,
        stringComparison: null,
        backtickComparison: null,
        statementCountComparison: null,
        formattingIssues: [],
        semanticIssues: [],
        passed: true,
    };

    const original = fs.readFileSync(originalPath, 'utf8');
    const formatted = fs.readFileSync(formattedPath, 'utf8');

    console.log('='.repeat(70));
    console.log('SQL Formatter 语义对比测试');
    console.log('='.repeat(70));
    console.log(`原始文件: ${originalPath} (${original.split('\n').length} 行)`);
    console.log(`格式化后: ${formattedPath} (${formatted.split('\n').length} 行)\n`);

    // ---- A. 语句数量对比 ----
    console.log('--- A. 语句数量对比 ---');
    const origStmts = splitStatements(original);
    const fmtStmts = splitStatements(formatted);
    report.statementCountComparison = { original: origStmts.length, formatted: fmtStmts.length };
    console.log(`  原始: ${origStmts.length} 条语句`);
    console.log(`  格式化后: ${fmtStmts.length} 条语句`);
    if (origStmts.length !== fmtStmts.length) {
        console.log(`  ✗ FAIL: 语句数量不一致! 差异: ${fmtStmts.length - origStmts.length}`);
        report.semanticIssues.push({
            type: 'statement_count_mismatch',
            original: origStmts.length,
            formatted: fmtStmts.length,
        });
        report.passed = false;
    } else {
        console.log(`  ✓ PASS`);
    }

    // ---- B. 关键字计数对比 ----
    console.log('\n--- B. 关键字计数对比 ---');
    const origKW = extractKeywords(original);
    const fmtKW = extractKeywords(formatted);
    report.keywordComparison = { original: origKW, formatted: fmtKW };

    let kwDiffs = [];
    const allKW = new Set([...Object.keys(origKW), ...Object.keys(fmtKW)]);
    for (const k of allKW) {
        const o = origKW[k] || 0;
        const f = fmtKW[k] || 0;
        if (o !== f) kwDiffs.push({ keyword: k, original: o, formatted: f });
    }
    if (kwDiffs.length > 0) {
        console.log(`  ✗ FAIL: ${kwDiffs.length} 个关键字计数不一致:`);
        for (const d of kwDiffs) {
            console.log(`    ${d.keyword}: 原始=${d.original}, 格式化后=${d.formatted}`);
        }
        report.semanticIssues.push({ type: 'keyword_count_mismatch', diffs: kwDiffs });
        report.passed = false;
    } else {
        console.log(`  ✓ PASS (${allKW.size} 个关键字，计数一致)`);
    }

    // ---- C. 变量引用对比 ----
    console.log('\n--- C. 变量引用对比 ---');
    const origVar = extractVariables(original);
    const fmtVar = extractVariables(formatted);
    report.variableComparison = { original: origVar, formatted: fmtVar };
    if (JSON.stringify(origVar) !== JSON.stringify(fmtVar)) {
        console.log(`  ✗ FAIL: 变量引用不一致!`);
        console.log(`    原始 (${origVar.length}): ${origVar.join(', ')}`);
        console.log(`    格式化后 (${fmtVar.length}): ${fmtVar.join(', ')}`);
        report.semanticIssues.push({ type: 'variable_mismatch', original: origVar, formatted: fmtVar });
        report.passed = false;
    } else {
        console.log(`  ✓ PASS (${origVar.length} 个变量引用一致)`);
    }

    // ---- D. 字符串字面量对比 ----
    console.log('\n--- D. 字符串字面量对比 ---');
    const origStr = extractStringLiterals(original);
    const fmtStr = extractStringLiterals(formatted);
    report.stringComparison = { original: origStr, formatted: fmtStr };
    if (JSON.stringify(origStr) !== JSON.stringify(fmtStr)) {
        console.log(`  ✗ FAIL: 字符串字面量不一致!`);
        console.log(`    原始 (${origStr.length}): ${origStr.join(', ')}`);
        console.log(`    格式化后 (${fmtStr.length}): ${fmtStr.join(', ')}`);
        report.semanticIssues.push({ type: 'string_literal_mismatch', original: origStr, formatted: fmtStr });
        report.passed = false;
    } else {
        console.log(`  ✓ PASS (${origStr.length} 个字符串一致)`);
    }

    // ---- E. 反引号标识符对比 ----
    console.log('\n--- E. 反引号标识符对比 ---');
    const origBT = extractBacktickIds(original);
    const fmtBT = extractBacktickIds(formatted);
    report.backtickComparison = { original: origBT, formatted: fmtBT };
    if (JSON.stringify(origBT) !== JSON.stringify(fmtBT)) {
        console.log(`  ✗ FAIL: 反引号标识符不一致!`);
        report.semanticIssues.push({ type: 'backtick_mismatch', original: origBT, formatted: fmtBT });
        report.passed = false;
    } else {
        console.log(`  ✓ PASS (${origBT.length} 个反引号标识符一致)`);
    }

    // ---- F. 格式化结构性问题检测 ----
    console.log('\n--- F. 格式化结构性问题检测 ---');

    // F1. 小写关键字残留
    const lowerKW = detectLowercaseKeywords(formatted);
    if (lowerKW.length > 0) {
        console.log(`  ✗ FAIL: ${lowerKW.length} 个小写关键字未转换:`);
        for (const l of lowerKW.slice(0, 10)) {
            console.log(`    行${lineAt(formatted, l.pos)}: "${l.word}"`);
        }
        if (lowerKW.length > 10) console.log(`    ... 还有 ${lowerKW.length - 10} 个`);
        report.formattingIssues.push({ type: 'lowercase_keywords', count: lowerKW.length, samples: lowerKW.slice(0, 10) });
        report.passed = false;
    } else {
        console.log(`  ✓ PASS: 所有关键字已大写`);
    }

    // F2. FULL OUTER JOIN 断裂检测
    const brokenPhrases = detectBrokenPhrases(formatted);
    if (brokenPhrases.length > 0) {
        console.log(`  ✗ FAIL: FULL OUTER JOIN 被断开换行`);
        for (const b of brokenPhrases) {
            console.log(`    行${b.line}: ${b.phrase}`);
        }
        report.formattingIssues.push({ type: 'broken_full_outer_join', count: brokenPhrases.length });
        report.passed = false;
    }

    // F3. BETWEEN ... AND 断裂检测
    const brokenBetween = detectBrokenBetween(formatted);
    if (brokenBetween.length > 0) {
        console.log(`  ✗ FAIL: BETWEEN ... AND 被断开`);
        for (const b of brokenBetween) {
            console.log(`    行${b.line}: ${b.context}`);
        }
        report.formattingIssues.push({ type: 'broken_between', count: brokenBetween.length });
        report.passed = false;
    }

    // F4. 行内注释嵌在 SQL 中
    const inlineCommentIssues = detectInlineCommentsInSQL(formatted);
    if (inlineCommentIssues.length > 0) {
        console.log(`  ✗ WARN: ${inlineCommentIssues.length} 个行内注释可能影响结构`);
        for (const c of inlineCommentIssues) {
            console.log(`    行${c.line}: ${c.detail}`);
        }
        report.formattingIssues.push({ type: 'inline_comment', count: inlineCommentIssues.length });
    }

    // F5. 多语句被合并到一行
    console.log('\n--- G. 多语句合并检测 ---');
    const mergedStmts = [];
    const lines = formatted.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('/*')) continue;
        // 检测一行中有 DROP/CREATE/DELETE/INSERT 等多个 DDL/DML
        const dmlCount = (trimmed.match(/\b(DROP|CREATE|DELETE|INSERT|SELECT|ALTER|TRUNCATE)\b/gi) || []).length;
        if (dmlCount >= 2) {
            // 排除 SELECT ... FROM ... WHERE 这类正常情况
            const keywords = trimmed.match(/\b(DROP|CREATE|DELETE|INSERT)\b/gi);
            if (keywords && keywords.length >= 2) {
                mergedStmts.push({ line: i + 1, text: trimmed.slice(0, 120) + '...' });
            }
        }
    }
    if (mergedStmts.length > 0) {
        console.log(`  ✗ FAIL: ${mergedStmts.length} 行存在多语句合并:`);
        for (const m of mergedStmts) {
            console.log(`    行${m.line}: ${m.text}`);
        }
        report.formattingIssues.push({ type: 'merged_statements', details: mergedStmts });
        report.passed = false;
    } else {
        console.log(`  ✓ PASS: 无多语句合并`);
    }

    // ---- H. 注释后内容被合并检测 ----
    console.log('\n--- H. 注释边界检测 ---');
    const commentMergeIssues = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 检测: ;-- xxx  （分号后紧跟注释再跟内容）
        if (/;\s*--/.test(line) && /;\s*--.*\S+/.test(line)) {
            commentMergeIssues.push({
                line: i + 1,
                detail: '分号后的注释与后续内容在同一行',
                context: line.trim().slice(0, 100),
            });
        }
    }
    if (commentMergeIssues.length > 0) {
        console.log(`  ✗ FAIL: ${commentMergeIssues.length} 处注释后内容未换行:`);
        for (const c of commentMergeIssues) {
            console.log(`    行${c.line}: ${c.context}`);
        }
        report.formattingIssues.push({ type: 'comment_merge', details: commentMergeIssues });
        report.passed = false;
    } else {
        console.log(`  ✓ PASS: 注释后正确换行`);
    }

    // ---- I. 字符级语义对比（移除空格/注释后） ----
    console.log('\n--- I. 归一化语义指纹对比 ---');
    function normalizeForCompare(text) {
        return text
            .replace(/--[^\n]*/g, '')          // 去掉行注释
            .replace(/\/\*[\s\S]*?\*\//g, '')   // 去掉块注释
            .replace(/\s+/g, ' ')                // 合并空白
            .trim()
            .toUpperCase();
    }
    const normOrig = normalizeForCompare(original);
    const normFmt = normalizeForCompare(formatted);

    if (normOrig === normFmt) {
        console.log(`  ✓ PASS: 归一化后语义完全一致`);
    } else {
        // 逐字符比较找差异点
        const minLen = Math.min(normOrig.length, normFmt.length);
        let firstDiff = -1;
        for (let i = 0; i < minLen; i++) {
            if (normOrig[i] !== normFmt[i]) {
                firstDiff = i;
                break;
            }
        }
        if (firstDiff >= 0) {
            const ctx = 40;
            console.log(`  ✗ FAIL: 归一化语义不一致 (第一个差异在偏移 ${firstDiff})`);
            console.log(`    原始:  ...${normOrig.slice(Math.max(0, firstDiff - ctx), firstDiff + ctx)}...`);
            console.log(`    格式化:...${normFmt.slice(Math.max(0, firstDiff - ctx), firstDiff + ctx)}...`);
        } else if (normOrig.length !== normFmt.length) {
            console.log(`  ✗ FAIL: 归一化后长度不一致 (原始 ${normOrig.length}, 格式化 ${normFmt.length})`);
        }
        report.semanticIssues.push({
            type: 'normalized_mismatch',
            lengthDiff: normFmt.length - normOrig.length,
        });
        report.passed = false;
    }

    // ---- 生成摘要 ----
    report.summary = {
        totalChecks: 9,
        passed: Object.values(report).filter(v => v === true).length,
        formattingIssueCount: report.formattingIssues.length,
        semanticIssueCount: report.semanticIssues.length,
        overallResult: report.passed ? 'PASS' : 'FAIL',
    };

    console.log('\n' + '='.repeat(70));
    console.log(`测试结果: ${report.passed ? '✓ 全部通过' : '✗ 存在问题'}`);
    console.log(`格式化问题: ${report.formattingIssues.length} 类 | 语义问题: ${report.semanticIssues.length} 类`);
    console.log('='.repeat(70));

    return report;
}

// ======================== 命令行入口 ========================
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.log('用法: node test/semantic_diff.js <原始文件> [格式化后文件]');
        console.log('如果未指定格式化后文件，将使用 formatter 现场格式化');
        process.exit(1);
    }

    const originalPath = args[0];
    let formattedPath = args[1];

    if (!formattedPath) {
        // 现场格式化
        const { formatSQL } = require('../formatter');
        const sql = fs.readFileSync(originalPath, 'utf8');
        const formatted = formatSQL(sql, {
            indentSize: 4, maxWidth: 200, commaFirst: true,
            andAlign: true, keywordCase: 'upper',
        });
        formattedPath = originalPath.replace(/\.sql$/, '_formatted_tmp.sql');
        fs.writeFileSync(formattedPath, formatted);
        console.log(`已生成临时格式化文件: ${formattedPath}\n`);
    }

    const report = runSemanticTest(originalPath, formattedPath);

    // 输出 JSON 报告
    const reportPath = originalPath.replace(/\.sql$/, '_semantic_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n报告已保存: ${reportPath}`);

    process.exit(report.passed ? 0 : 1);
}

module.exports = { runSemanticTest, splitStatements, extractKeywords, extractVariables, extractStringLiterals };
