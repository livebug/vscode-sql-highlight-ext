#!/usr/bin/env node
/**
 * SQL Formatter 测试 Agent
 * =========================
 * 功能:
 *   1. 批量格式化 SQL 文件 (单文件 / 目录)
 *   2. 语义对比验证 (关键字/变量/字符串/标识符)
 *   3. 结构性问题检测 (BETWEEN 断裂/JOIN 断裂/注释合并等)
 *   4. 生成 JSON + Markdown 报告
 *
 * 用法:
 *   node test/agent.js [options] <path>
 *
 * 选项:
 *   --dir          将 path 视为目录，递归处理所有 .sql 文件
 *   --fix          自动应用修复（暂未实现）
 *   --format-only  仅格式化，不做对比
 *   --output <dir> 输出目录（默认: path 同目录 + _report/）
 *   --verbose      详细输出
 *   --ci           CI 模式：非零退出码表示失败
 *
 * 示例:
 *   node test/agent.js testdata/sql/boundary_edge_cases.sql
 *   node test/agent.js --dir testdata/sql/
 *   node test/agent.js --ci testdata/sql/boundary_edge_cases.sql
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ======================== 语义分析器 ========================

class SemanticAnalyzer {
    constructor() {
        this.reset();
    }

    reset() {
        this.keywords_ = new Set([
            'SELECT','FROM','WHERE','AND','OR','NOT','IN','EXISTS','BETWEEN','LIKE','RLIKE','REGEXP',
            'IS','NULL','TRUE','FALSE','AS','ON','JOIN','INNER','LEFT','RIGHT','FULL','CROSS',
            'NATURAL','OUTER','SEMI','ANTI','UNION','ALL','INTERSECT','EXCEPT','MINUS',
            'INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','ALTER','DROP','TRUNCATE',
            'REPLACE','MERGE','GRANT','REVOKE','ORDER','GROUP','HAVING','LIMIT','OFFSET',
            'FETCH','FOR','ASC','DESC','NULLS','FIRST','LAST','BY','CASE','WHEN','THEN','ELSE',
            'END','DISTINCT','WITH','RECURSIVE','WINDOW','OVER','PARTITION','ROWS','RANGE',
            'UNBOUNDED','PRECEDING','FOLLOWING','CURRENT','ROW','LATERAL','VIEW','TABLE',
            'SCHEMA','DATABASE','TEMP','TEMPORARY','IF','EXISTS','BEGIN','CALL','COMMIT',
            'ROLLBACK','PRIMARY','KEY','FOREIGN','REFERENCES','INDEX','CONSTRAINT','CHECK',
            'UNIQUE','ADD','COLUMN','DEFAULT','CASCADE','RESTRICT',
        ]);
    }

    /** 提取关键字计数 */
    countKeywords(text) {
        const counts = {};
        const re = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const w = m[0].toUpperCase();
            if (this.keywords_.has(w)) counts[w] = (counts[w] || 0) + 1;
        }
        return counts;
    }

    /** 提取 ${VAR} */
    extractVars(text) {
        return (text.match(/\$\{[a-zA-Z_][a-zA-Z0-9_]*\}/g) || []);
    }

    /** 提取字符串字面量（支持 '' 转义，不跨行） */
    extractStrings(text) {
        return (text.match(/'([^'\n]|'')*'/g) || []);
    }

    /** 提取反引号标识符（不跨行） */
    extractBackticks(text) {
        return (text.match(/`[^`\n]*`/g) || []);
    }

    /** 通过 ; 拆分语句 */
    splitStatements(text) {
        let clean = text
            .replace(/--[^\n]*/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/'([^'\n]|'')*'/g, "''")
            .replace(/`[^`\n]*`/g, '``');
        return clean.split(';').map(s => s.trim()).filter(Boolean);
    }

    /** 检测小写关键字残留（跳过注释行） */
    detectLowerKeywords(text) {
        const re = /\b([a-z][a-z0-9_]*)\b/g;
        const lower = [];
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
            let m;
            const lineRe = new RegExp(re.source, 'g');
            while ((m = lineRe.exec(lines[i])) !== null) {
                const w = m[1].toUpperCase();
                if (this.keywords_.has(w)) lower.push({ word: m[1], line: i + 1 });
            }
        }
        return lower;
    }

    /** 检测 FULL OUTER JOIN 断裂 */
    detectBrokenFullOuterJoin(text) {
        const issues = [];
        const re = /FULL\s+OUTER\s*\n\s*JOIN/gi;
        let m;
        while ((m = re.exec(text)) !== null) {
            issues.push({ line: this.lineAt(text, m.index), text: 'FULL OUTER\\nJOIN' });
        }
        return issues;
    }

    /** 检测 BETWEEN ... AND 被误拆 */
    detectBrokenBetween(text) {
        const issues = [];
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (/^\s*AND\s+\d+/.test(lines[i])) {
                issues.push({ line: i + 1, text: lines[i].trim() });
            }
        }
        return issues;
    }

    /** 检测多语句合并到一行（跳过注释行） */
    detectMergedStatements(text) {
        const issues = [];
        // 先移除块注释内容
        const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, '');
        const lines = cleaned.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed || trimmed.startsWith('--')) continue;
            const ddls = trimmed.match(/\b(DROP|CREATE|DELETE|INSERT)\b/gi);
            if (ddls && ddls.length >= 2) {
                issues.push({ line: i + 1, text: trimmed.slice(0, 120) + '...' });
            }
        }
        return issues;
    }

    /** 检测分号后注释与代码在同一行 */
    detectCommentAfterSemicolon(text) {
        const issues = [];
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (/;\s*--.*\S+/.test(lines[i])) {
                issues.push({ line: i + 1, text: lines[i].trim().slice(0, 100) });
            }
        }
        return issues;
    }

    /** 归一化文本（去注释/空白/大小写，仅保留 SQL 标记） */
    normalize(text) {
        return text
            .replace(/--[^\n]*/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/'([^'\n]|'')*'/g, "''")
            .replace(/`[^`\n]*`/g, '``')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();
    }

    lineAt(text, offset) {
        return text.slice(0, offset).split('\n').length;
    }
}

// ======================== 测试用例运行器 ========================

class TestRunner {
    constructor(opts = {}) {
        this.formatter = null;
        this.analyzer = new SemanticAnalyzer();
        this.opts = Object.assign({ verbose: false, ci: false }, opts);
    }

    loadFormatter() {
        // 尝试从多个路径加载
        const paths = [
            path.join(__dirname, '..', 'formatter.js'),
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) {
                this.formatter = require(p).formatSQL;
                return true;
            }
        }
        return false;
    }

    /** 运行单个文件的完整测试 */
    runSingleFile(originalPath, options) {
        const report = {
            file: path.basename(originalPath),
            filePath: originalPath,
            timestamp: new Date().toISOString(),
            checks: [],
            issues: { semantic: [], formatting: [], warnings: [] },
            passed: true,
        };

        // 格式化
        const sql = fs.readFileSync(originalPath, 'utf8');
        const fmtOpts = Object.assign({
            indentSize: 4, maxWidth: 200, commaFirst: true,
            andAlign: true, keywordCase: 'upper',
        }, options || {});
        const formatted = this.formatter(sql, fmtOpts);

        // 保存格式化结果
        const fmtPath = originalPath.replace(/\.sql$/, '_formatted.sql');
        fs.writeFileSync(fmtPath, formatted);

        // === 语义对比检查 ===
        const check = (name, fn) => {
            const result = fn();
            report.checks.push({ name, ...result });
            if (result.status === 'FAIL') {
                report.passed = false;
                report.issues.semantic.push({ check: name, ...result });
            }
            if (this.opts.verbose) {
                const icon = result.status === 'PASS' ? '✓' : '✗';
                console.log(`  ${icon} ${name}: ${result.status}${result.detail ? ' - ' + result.detail : ''}`);
            }
        };

        // 检查 1: 关键字计数
        check('关键字计数', () => {
            const orig = this.analyzer.countKeywords(sql);
            const fmt = this.analyzer.countKeywords(formatted);
            const diffs = [];
            const all = new Set([...Object.keys(orig), ...Object.keys(fmt)]);
            for (const k of all) {
                if ((orig[k] || 0) !== (fmt[k] || 0)) {
                    diffs.push({ keyword: k, original: orig[k] || 0, formatted: fmt[k] || 0 });
                }
            }
            return diffs.length === 0
                ? { status: 'PASS' }
                : { status: 'FAIL', detail: `${diffs.length} 个关键字不一致`, data: diffs };
        });

        // 检查 2: 变量引用
        check('变量引用', () => {
            const orig = this.analyzer.extractVars(sql);
            const fmt = this.analyzer.extractVars(formatted);
            return JSON.stringify(orig) === JSON.stringify(fmt)
                ? { status: 'PASS' }
                : { status: 'FAIL', detail: `原始=${orig.length}, 格式化=${fmt.length}` };
        });

        // 检查 3: 字符串字面量
        check('字符串字面量', () => {
            const orig = this.analyzer.extractStrings(sql);
            const fmt = this.analyzer.extractStrings(formatted);
            return JSON.stringify(orig) === JSON.stringify(fmt)
                ? { status: 'PASS' }
                : { status: 'FAIL', detail: `原始=${orig.length}, 格式化=${fmt.length}` };
        });

        // 检查 4: 反引号标识符
        check('反引号标识符', () => {
            const orig = this.analyzer.extractBackticks(sql);
            const fmt = this.analyzer.extractBackticks(formatted);
            return JSON.stringify(orig) === JSON.stringify(fmt)
                ? { status: 'PASS' }
                : { status: 'FAIL', detail: `原始=${orig.length}, 格式化=${fmt.length}` };
        });

        // 检查 5: 语句数量
        check('语句数量', () => {
            const origStmts = this.analyzer.splitStatements(sql);
            const fmtStmts = this.analyzer.splitStatements(formatted);
            return origStmts.length === fmtStmts.length
                ? { status: 'PASS' }
                : { status: 'FAIL', detail: `原始=${origStmts.length}, 格式化=${fmtStmts.length}` };
        });

        // 检查 6: 归一化语义指纹（仅警告，不阻塞）
        const normOrig = this.analyzer.normalize(sql);
        const normFmt = this.analyzer.normalize(formatted);
        if (normOrig !== normFmt) {
            report.issues.warnings.push({
                check: '归一化语义',
                detail: '去注释后文本存在差异（可能受注释内特殊字符影响）',
            });
            if (this.opts.verbose) console.log(`  ⚠ 归一化语义: 存在非关键差异`);
        } else if (this.opts.verbose) {
            console.log(`  ✓ 归一化语义: PASS`);
        }

        // === 结构性问题检测 ===
        const detect = (name, fn) => {
            const results = fn();
            if (results.length > 0) {
                report.issues.formatting.push({ check: name, count: results.length, items: results });
                report.passed = false;
                if (this.opts.verbose) console.log(`  ⚠ ${name}: ${results.length} 处问题`);
            }
        };

        detect('FULL_OUTER_JOIN断裂', () => this.analyzer.detectBrokenFullOuterJoin(formatted));
        detect('BETWEEN断裂', () => this.analyzer.detectBrokenBetween(formatted));
        detect('多语句合并', () => this.analyzer.detectMergedStatements(formatted));
        detect('分号注释合并', () => this.analyzer.detectCommentAfterSemicolon(formatted));

        // 小写关键字
        const lowerKW = this.analyzer.detectLowerKeywords(formatted);
        if (lowerKW.length > 0) {
            report.issues.warnings.push({ check: '小写关键字', count: lowerKW.length, items: lowerKW });
            if (this.opts.verbose) console.log(`  ⚠ 小写关键字: ${lowerKW.length} 处`);
        }

        // 统计摘要
        report.summary = {
            totalChecks: report.checks.length,
            passedChecks: report.checks.filter(c => c.status === 'PASS').length,
            failedChecks: report.checks.filter(c => c.status === 'FAIL').length,
            formattingIssues: report.issues.formatting.reduce((s, i) => s + i.count, 0),
            semanticIssues: report.issues.semantic.length,
            overall: report.passed ? 'PASS' : 'FAIL',
        };

        return report;
    }

    /** 运行目录批量测试 */
    runDirectory(dirPath, options) {
        const reports = [];
        const sqlFiles = this._findSQLFiles(dirPath);

        if (sqlFiles.length === 0) {
            console.log('未找到 .sql 文件');
            return reports;
        }

        console.log(`\n找到 ${sqlFiles.length} 个 SQL 文件\n`);

        for (const file of sqlFiles) {
            if (file.includes('_formatted') || file.includes('_tmp')) continue;
            console.log(`\n--- ${path.basename(file)} ---`);
            try {
                const report = this.runSingleFile(file, options);
                reports.push(report);
                const icon = report.passed ? '✅' : '❌';
                console.log(`${icon} ${report.summary.overall} (${report.summary.passedChecks}/${report.summary.totalChecks})`);
            } catch (e) {
                console.log(`❌ ERROR: ${e.message}`);
                reports.push({ file: path.basename(file), error: e.message, passed: false });
            }
        }

        // 汇总
        const total = reports.length;
        const passed = reports.filter(r => r.passed).length;
        const failed = total - passed;

        console.log(`\n${'='.repeat(60)}`);
        console.log(`批量测试完成: ${total} 个文件, ${passed} 通过, ${failed} 失败`);
        console.log(`${'='.repeat(60)}`);

        return reports;
    }

    _findSQLFiles(dirPath) {
        const files = [];
        const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(p);
                else if (entry.name.endsWith('.sql')) files.push(p);
            }
        };
        walk(dirPath);
        return files;
    }
}

// ======================== 命令行入口 ========================

function parseArgs(args) {
    const opts = { dir: false, formatOnly: false, output: null, verbose: false, ci: false };
    const positional = [];
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--dir': opts.dir = true; break;
            case '--format-only': opts.formatOnly = true; break;
            case '--verbose': opts.verbose = true; break;
            case '--ci': opts.ci = true; break;
            case '--output': opts.output = args[++i]; break;
            default:
                if (!args[i].startsWith('--')) positional.push(args[i]);
        }
    }
    opts.path = positional[0] || '.';
    return opts;
}

function printUsage() {
    console.log(`
SQL Formatter 测试 Agent
=========================
用法: node test/agent.js [options] <path>

选项:
  --dir          将 path 视为目录，递归处理所有 .sql 文件
  --format-only  仅格式化，不做语义对比
  --output <dir> 输出目录
  --verbose      详细输出
  --ci           CI 模式：失败时非零退出码
  --fix          自动修复（预留）
`);
}

if (require.main === module) {
    const cliOpts = parseArgs(process.argv.slice(2));

    if (!cliOpts.path || cliOpts.path === '-h' || cliOpts.path === '--help') {
        printUsage();
        process.exit(0);
    }

    const runner = new TestRunner(cliOpts);
    if (!runner.loadFormatter()) {
        console.error('错误: 无法加载 formatter.js。请确保在项目根目录运行。');
        process.exit(1);
    }

    let reports;
    if (cliOpts.dir) {
        reports = runner.runDirectory(cliOpts.path);
    } else {
        const singlePath = cliOpts.path;
        if (cliOpts.formatOnly) {
            const sql = fs.readFileSync(singlePath, 'utf8');
            const formatted = runner.formatter(sql);
            const fmtPath = singlePath.replace(/\.sql$/, '_formatted.sql');
            fs.writeFileSync(fmtPath, formatted);
            console.log(`✅ 格式化完成: ${fmtPath}`);
            process.exit(0);
        }
        reports = [runner.runSingleFile(singlePath)];
    }

    // 保存报告
    const outputDir = cliOpts.output || path.dirname(cliOpts.path);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const reportPath = path.join(outputDir, 'formatter_test_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));
    console.log(`\n📋 报告已保存: ${reportPath}`);

    // 打印单文件详细报告
    if (!cliOpts.dir && reports.length > 0) {
        const r = reports[0];
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📄 ${r.file}`);
        console.log(`${'='.repeat(60)}`);
        console.log(`总检查项: ${r.summary.totalChecks}`);
        console.log(`✅ 通过: ${r.summary.passedChecks}`);
        console.log(`❌ 失败: ${r.summary.failedChecks}`);
        console.log(`🔧 格式化问题: ${r.summary.formattingIssues} 处`);
        console.log(`🔴 语义问题: ${r.summary.semanticIssues} 处`);
        console.log(`🏁 总体结果: ${r.summary.overall}`);

        if (r.issues.semantic.length > 0) {
            console.log(`\n🔴 语义问题:`);
            for (const issue of r.issues.semantic) {
                console.log(`  - ${issue.check}: ${issue.detail || ''}`);
            }
        }
        if (r.issues.formatting.length > 0) {
            console.log(`\n🔧 格式化问题:`);
            for (const issue of r.issues.formatting) {
                console.log(`  - ${issue.check}: ${issue.count} 处`);
            }
        }
    }

    const hasFailure = Array.isArray(reports)
        ? reports.some(r => !r.passed)
        : !reports.passed;

    if (cliOpts.ci && hasFailure) process.exit(1);
}

module.exports = { SemanticAnalyzer, TestRunner };
