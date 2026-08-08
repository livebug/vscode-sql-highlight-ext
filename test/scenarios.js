#!/usr/bin/env node
/**
 * SQL Formatter 全面场景测试
 * ==========================
 * 针对各类 SQL 构造逐场景验证格式化：
 *   1. 语义保持（关键字/字符串/语句数不变）
 *   2. 无占位符泄漏（__S/__C/__K/__V/__O/__L 残留即 bug）
 *   3. 幂等性（格式化两次结果一致）
 *   4. 行注释不吞后文（-- 后同行不得再有内容）
 *   5. 括号平衡
 *
 * 用法: node test/scenarios.js [--out <path>]
 * 默认输出: testdata/scenario_test_report.md
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { formatSQL } = require('../src/core/formatter');
const KEYWORDS = require('../src/core/keywords');

// ======================== 场景库 ========================
const SCENARIOS = [
    // ---------- 基础 SELECT ----------
    { id: 'S01', cat: '基础 SELECT', name: '单表简单查询', sql: "SELECT cust_id, cust_name, cert_no FROM customer;" },
    { id: 'S02', cat: '基础 SELECT', name: '多字段逗号优先', sql: "SELECT a, b, c, d, e, f, g, h FROM t;" },
    { id: 'S03', cat: '基础 SELECT', name: '表达式+别名（AS 对齐）', sql: "SELECT total_amount * 0.8 AS discount, CONCAT(cust_name, '-', cert_no) AS full_id, balance AS bal FROM customer;" },
    { id: 'S06', cat: '基础 SELECT', name: 'AS 对齐 + 注释对齐', sql: "SELECT a AS alpha, bbbb AS beta, c -- 说明c\n, ddd -- 说明d\nFROM t;" },
    { id: 'S04', cat: '基础 SELECT', name: 'DISTINCT', sql: "SELECT DISTINCT acct_type, currency FROM acct_info;" },
    { id: 'S05', cat: '基础 SELECT', name: 'SELECT 无 FROM（标量）', sql: "SELECT CURRENT_DATE, 1 + 2 AS sum_result;" },

    // ---------- WHERE / 条件 ----------
    { id: 'W01', cat: 'WHERE 条件', name: '多条件 AND 对齐', sql: "SELECT * FROM acct_info WHERE balance > 10000 AND acct_type = 'SAVING' AND status = 'ACTIVE' AND currency = 'CNY';" },
    { id: 'W02', cat: 'WHERE 条件', name: 'AND/OR 混合', sql: "SELECT * FROM t WHERE a = 1 AND (b = 2 OR c = 3) AND NOT d = 4;" },
    { id: 'W03', cat: 'WHERE 条件', name: 'BETWEEN 范围', sql: "SELECT * FROM trade WHERE trade_date BETWEEN '2026-01-01' AND '2026-12-31';" },
    { id: 'W04', cat: 'WHERE 条件', name: 'IN / NOT IN', sql: "SELECT * FROM t WHERE id IN (1, 2, 3, 4, 5) AND status NOT IN ('X', 'Y');" },
    { id: 'W05', cat: 'WHERE 条件', name: 'LIKE / RLIKE', sql: "SELECT * FROM t WHERE name LIKE '%张%' OR phone RLIKE '^1[3-9]';" },
    { id: 'W06', cat: 'WHERE 条件', name: 'IS NULL / 逻辑运算', sql: "SELECT * FROM t WHERE deleted_at IS NULL AND balance IS NOT NULL AND age >= 18;" },
    { id: 'W07', cat: 'WHERE 条件', name: 'BETWEEN 后跟 AND 连接', sql: "SELECT * FROM t WHERE amount BETWEEN 100 AND 500 AND status = 1 AND create_time BETWEEN '2026-01-01' AND '2026-06-30';" },

    // ---------- JOIN ----------
    { id: 'J01', cat: 'JOIN', name: 'INNER JOIN', sql: "SELECT a.id, b.name FROM t1 a INNER JOIN t2 b ON a.id = b.id;" },
    { id: 'J02', cat: 'JOIN', name: 'LEFT JOIN + ON 多条件', sql: "SELECT a.id, b.name FROM t1 a LEFT JOIN t2 b ON a.id = b.id AND a.type = b.type;" },
    { id: 'J03', cat: 'JOIN', name: 'RIGHT / FULL / CROSS / NATURAL', sql: "SELECT * FROM a RIGHT JOIN b ON a.id = b.id FULL OUTER JOIN c ON a.id = c.id CROSS JOIN d NATURAL JOIN e;" },
    { id: 'J04', cat: 'JOIN', name: 'SEMI / ANTI JOIN (TDH)', sql: "SELECT a.id FROM a LEFT SEMI JOIN b ON a.id = b.id WHERE a.x = 1 UNION SELECT a.id FROM a LEFT ANTI JOIN b ON a.id = b.id;" },
    { id: 'J05', cat: 'JOIN', name: '多表 JOIN 链', sql: "SELECT o.id, c.name, p.price FROM orders o JOIN customers c ON o.cust_id = c.id JOIN products p ON o.prod_id = p.id LEFT JOIN payments py ON py.order_id = o.id;" },

    // ---------- 子查询 ----------
    { id: 'Q01', cat: '子查询', name: 'FROM 派生表', sql: "SELECT * FROM (SELECT cust_id, SUM(amount) AS total FROM trade GROUP BY cust_id) sub WHERE total > 1000;" },
    { id: 'Q02', cat: '子查询', name: 'WHERE IN 子查询', sql: "SELECT * FROM t WHERE id IN (SELECT id FROM banned WHERE reason = 'fraud');" },
    { id: 'Q03', cat: '子查询', name: 'EXISTS 相关子查询', sql: "SELECT * FROM orders o WHERE EXISTS (SELECT 1 FROM items i WHERE i.order_id = o.id AND i.qty > 5);" },
    { id: 'Q04', cat: '子查询', name: '多层嵌套子查询', sql: "SELECT * FROM (SELECT a.id, (SELECT MAX(b.score) FROM scores b WHERE b.uid = a.id) AS top FROM users a) x WHERE x.top > 90;" },
    { id: 'Q05', cat: '子查询', name: '标量子查询', sql: "SELECT id, (SELECT name FROM users WHERE users.id = orders.uid) AS uname FROM orders;" },

    // ---------- CASE WHEN ----------
    { id: 'C01', cat: 'CASE WHEN', name: '短 CASE 保持单行', sql: "SELECT CASE WHEN a > 1 THEN 'x' WHEN a > 0 THEN 'y' ELSE 'z' END AS t FROM tab;" },
    { id: 'C02', cat: 'CASE WHEN', name: '长 CASE THEN 对齐', sql: "SELECT cust_id, CASE WHEN balance > 10000 THEN 'HIGH' WHEN balance > 1000 THEN 'MEDIUM' WHEN balance > 100 THEN 'LOW' ELSE 'VERY LOW' END AS level FROM acct_info;" },
    { id: 'C03', cat: 'CASE WHEN', name: '简单 CASE (CASE expr)', sql: "SELECT CASE status WHEN 1 THEN 'active' WHEN 2 THEN 'inactive' WHEN 3 THEN 'disabled' WHEN 4 THEN 'archived' ELSE 'unknown' END AS st FROM users;" },
    { id: 'C04', cat: 'CASE WHEN', name: '嵌套 CASE', sql: "SELECT CASE WHEN a > 1 THEN CASE WHEN b > 1 THEN 'x' WHEN b > 0 THEN 'y' ELSE 'z' END WHEN a > 0 THEN 'm' ELSE 'n' END AS t FROM tab;" },
    { id: 'C05', cat: 'CASE WHEN', name: 'WHEN 多条件 AND/OR', sql: "SELECT CASE WHEN a > 100 AND b > 50 OR c = 10 THEN 'big' WHEN a > 10 THEN 'mid' ELSE 'small' END AS size FROM t;" },
    { id: 'C06', cat: 'CASE WHEN', name: 'CASE 内行注释', sql: "SELECT id, CASE WHEN status = 1 THEN 'ok' -- 正常\n WHEN status = 2 THEN 'warn' -- 警告\n ELSE 'err' END AS st FROM t;" },
    { id: 'C07', cat: 'CASE WHEN', name: 'WHERE/ORDER BY 中 CASE', sql: "SELECT a, b FROM t WHERE CASE WHEN a IS NULL THEN 1 ELSE 0 END = 1 ORDER BY CASE WHEN b > 0 THEN b ELSE 999 END DESC;" },
    { id: 'C08', cat: 'CASE WHEN', name: '大 CASE（10 分支）', sql: "SELECT CASE WHEN a = 1 THEN 'one' WHEN a = 2 THEN 'two' WHEN a = 3 THEN 'three' WHEN a = 4 THEN 'four' WHEN a = 5 THEN 'five' WHEN a = 6 THEN 'six' WHEN a = 7 THEN 'seven' WHEN a = 8 THEN 'eight' WHEN a = 9 THEN 'nine' WHEN a = 10 THEN 'ten' ELSE 'many' END AS num FROM t;" },
    { id: 'C09', cat: 'CASE WHEN', name: 'THEN 值含子查询', sql: "SELECT CASE WHEN a > 1 THEN (SELECT MAX(x) FROM tab2 WHERE tab2.id = tab.id) ELSE 0 END AS t FROM tab;" },
    { id: 'C10', cat: 'CASE WHEN', name: '简单 CASE 长表达式', sql: "SELECT CASE category_code WHEN 'A001' THEN 'Category Alpha' WHEN 'B002' THEN 'Category Beta' WHEN 'C003' THEN 'Category Gamma' ELSE 'Other' END AS cat FROM items;" },

    // ---------- GROUP / HAVING / ORDER / LIMIT ----------
    { id: 'G01', cat: '聚合排序', name: 'GROUP BY + 聚合', sql: "SELECT cust_id, COUNT(*) AS cnt, SUM(amount) AS total, AVG(amount) AS avg_amt, MAX(amount) AS max_amt FROM trade GROUP BY cust_id;" },
    { id: 'G02', cat: '聚合排序', name: 'HAVING 过滤分组', sql: "SELECT dept_id, COUNT(*) AS cnt FROM emp GROUP BY dept_id HAVING COUNT(*) > 10 AND SUM(salary) > 100000;" },
    { id: 'G03', cat: '聚合排序', name: 'ORDER BY 多列', sql: "SELECT a, b FROM t ORDER BY a DESC, b ASC NULLS LAST, c NULLS FIRST;" },
    { id: 'G04', cat: '聚合排序', name: 'LIMIT / OFFSET', sql: "SELECT * FROM t ORDER BY id LIMIT 100 OFFSET 20;" },

    // ---------- DML ----------
    { id: 'D01', cat: 'DML', name: 'INSERT VALUES', sql: "INSERT INTO customer (cust_id, cust_name, risk_level) VALUES ('C001', '张三', 'HIGH'), ('C002', '李四', 'MEDIUM');" },
    { id: 'D02', cat: 'DML', name: 'INSERT SELECT', sql: "INSERT INTO tmp_result (cust_id, cnt) SELECT cust_id, COUNT(*) FROM trade GROUP BY cust_id;" },
    { id: 'D03', cat: 'DML', name: 'UPDATE', sql: "UPDATE customer SET status = 'INACTIVE', risk_level = 'LOW' WHERE cust_id = 'C002' AND update_time < '2026-01-01';" },
    { id: 'D04', cat: 'DML', name: 'DELETE', sql: "DELETE FROM customer WHERE status = 'INACTIVE' AND deleted_at IS NOT NULL;" },
    { id: 'D05', cat: 'DML', name: 'MERGE (GaussDB)', sql: "MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.name = s.name WHEN NOT MATCHED THEN INSERT (id, name) VALUES (s.id, s.name);" },
    { id: 'D06', cat: 'DML', name: 'TRUNCATE', sql: "TRUNCATE TABLE tmp_order_summary;" },

    // ---------- DDL ----------
    { id: 'DD1', cat: 'DDL', name: 'CREATE TABLE', sql: "CREATE TABLE acct_info (acct_id VARCHAR(32) PRIMARY KEY, cust_id VARCHAR(32) NOT NULL, balance DECIMAL(18,2) DEFAULT 0, status VARCHAR(10), create_time TIMESTAMP);" },
    { id: 'DD5', cat: 'DDL', name: 'CREATE TABLE 列内注释', sql: "CREATE TABLE t (id INT, -- 主键\n name STRING COMMENT '姓名', age INT) LOCATION '/data/t';" },
    { id: 'DD2', cat: 'DDL', name: 'CREATE TEMP TABLE', sql: "CREATE TEMPORARY TABLE tmp_x AS SELECT a, b FROM src WHERE a > 1;" },
    { id: 'DD3', cat: 'DDL', name: 'CREATE VIEW', sql: "CREATE VIEW v_active AS SELECT id, name FROM users WHERE status = 1;" },
    { id: 'DD4', cat: 'DDL', name: 'ALTER / DROP', sql: "ALTER TABLE customer ADD COLUMN email VARCHAR(100); DROP TABLE IF EXISTS tmp_x;" },

    // ---------- CTE ----------
    { id: 'T01', cat: 'CTE', name: '单个 CTE', sql: "WITH cte AS (SELECT id, name FROM users WHERE status = 1) SELECT * FROM cte;" },
    { id: 'T02', cat: 'CTE', name: '多个 CTE 链式', sql: "WITH a AS (SELECT id FROM t1), b AS (SELECT id FROM t2) SELECT a.id FROM a JOIN b ON a.id = b.id;" },
    { id: 'T03', cat: 'CTE', name: '递归 CTE', sql: "WITH RECURSIVE cte AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM cte WHERE n < 10) SELECT * FROM cte;" },

    // ---------- 窗口函数 ----------
    { id: 'F01', cat: '窗口函数', name: 'OVER PARTITION ORDER', sql: "SELECT cust_id, trade_date, SUM(amount) OVER (PARTITION BY cust_id ORDER BY trade_date) AS running FROM trade;" },
    { id: 'F02', cat: '窗口函数', name: 'ROWS BETWEEN 帧', sql: "SELECT cust_id, amount, AVG(amount) OVER (PARTITION BY cust_id ORDER BY trade_date ROWS BETWEEN 3 PRECEDING AND CURRENT ROW) AS ma FROM trade;" },

    // ---------- 集合运算 ----------
    { id: 'U01', cat: '集合运算', name: 'UNION / UNION ALL', sql: "SELECT id FROM a UNION SELECT id FROM b UNION ALL SELECT id FROM c;" },
    { id: 'U02', cat: '集合运算', name: 'INTERSECT / EXCEPT / MINUS', sql: "SELECT id FROM a INTERSECT SELECT id FROM b EXCEPT SELECT id FROM c MINUS SELECT id FROM d;" },

    // ---------- TDH 特有 ----------
    { id: 'H01', cat: 'TDH 特有', name: 'LATERAL VIEW EXPLODE', sql: "SELECT id, tag FROM t LATERAL VIEW EXPLODE(tags) tag_table AS tag WHERE tag != '';" },
    { id: 'H02', cat: 'TDH 特有', name: 'STACK / INLINE / POSEXPLODE', sql: "SELECT id, x FROM t LATERAL VIEW EXPLODE(STACK(2, 'a', 1, 'b', 2)) s AS x;" },
    { id: 'H03', cat: 'TDH 特有', name: 'MAPJOIN 提示', sql: "SELECT /*+ MAPJOIN(b) */ a.id, b.name FROM a JOIN b ON a.id = b.id;" },
    { id: 'H04', cat: 'TDH 特有', name: 'CLUSTERED / SORTED / BUCKETS', sql: "CREATE TABLE t (id INT, name STRING) CLUSTERED BY (id) SORTED BY (name) INTO 16 BUCKETS STORED AS PARQUET;" },

    // ---------- 注释 / 字符串 / 变量 ----------
    { id: 'N01', cat: '注释字符串', name: '行注释', sql: "SELECT cust_id -- 客户编号\n, cust_name -- 客户名称\nFROM customer;" },
    { id: 'N02', cat: '注释字符串', name: '块注释', sql: "SELECT /* 主查询 */ a, /* 字段 b */ b FROM /* 表 */ t;" },
    { id: 'N03', cat: '注释字符串', name: '字段后行注释', sql: "SELECT cust_id, -- 客户\n cust_name, -- 姓名\n risk_level FROM customer;" },
    { id: 'N04', cat: '注释字符串', name: '字符串转义引号', sql: "SELECT 'it''s ok' AS msg, '包含,逗号' AS s2, '包含''''引号' AS s3 FROM t;" },
    { id: 'N05', cat: '注释字符串', name: '字符串含关键字', sql: "SELECT CASE WHEN status = 'CASE' THEN 'WHEN' ELSE 'END' END AS x, 'SELECT FROM WHERE' AS y FROM t;" },
    { id: 'N06', cat: '注释字符串', name: '${VAR} 变量', sql: "SELECT * FROM ${V_DB}.customer WHERE status = '${STATUS}' AND region = '${REGION}';" },
    { id: 'N07', cat: '注释字符串', name: '字符串含分号', sql: "SELECT 'a;b;c' AS s FROM t WHERE x = ';';" },

    // ---------- 多语句 / 块 ----------
    { id: 'M01', cat: '多语句块', name: '多条语句分号分隔', sql: "SELECT * FROM a WHERE x = 1; UPDATE b SET y = 2 WHERE id = 1; DELETE FROM c WHERE z = 3;" },
    { id: 'M02', cat: '多语句块', name: 'BEGIN...END 块', sql: "BEGIN DECLARE v_cnt INT; SELECT COUNT(*) INTO v_cnt FROM orders; IF v_cnt > 0 THEN UPDATE orders SET status = 'P'; END IF; END;" },

    // ---------- 边界 ----------
    { id: 'E01', cat: '边界', name: '空/纯注释输入', sql: "-- 只有注释\n/* 块注释 */\n" },
    { id: 'E02', cat: '边界', name: '深层嵌套括号函数', sql: "SELECT func(a, func2(b, func3(c, d)), e) AS r FROM t;" },
    { id: 'E03', cat: '边界', name: '无引号标识符边界', sql: "SELECT a, a_end, end_flag, t.case, t.when FROM t;" },
    { id: 'E04', cat: '边界', name: '多语句块注释内嵌行注释+字符串', sql: "SELECT 1; SELECT 2 /* a\n -- inner line 'x'\n -- more 'y'\n */ FROM t;" },
    { id: 'E05', cat: '边界', name: '多行表达式含行尾注释（不拆散）', sql: "SELECT SUM(CASE WHEN x = 'C' AND nvl(a,'') = '' THEN b ELSE 0 END\n ) / 100 AS ACCU --累计\nFROM t;" },
    { id: 'E06', cat: '边界', name: 'AS 在表达式内（CAST AS STRING）', sql: "SELECT CAST(DATE(x, 'YYYY-MM-DD') AS STRING) AS a, y AS bb FROM t;" },
    { id: 'E07', cat: '边界', name: '含子查询字段 AS（不参与对齐）', sql: "SELECT nvl((SELECT max(v) FROM t2 WHERE t2.id = t.id), 0) AS a, b AS bb FROM t;" },
    { id: 'E08', cat: '边界', name: '行注释含字符串/变量', sql: "SELECT 1; SELECT a -- 注释 'xyz' ${V_OG}\nFROM t;" },
    { id: 'E09', cat: '边界', name: '嵌套 nvl 长子查询字段缩进', sql: "SELECT id, nvl((SELECT cfg.item_value FROM mod.SS_CONFIG cfg WHERE cfg.p_og='${V_OG}' AND cfg.item_id='ISNT_NAME' AND a.p_og=cfg.p_og LIMIT 1), 'XXXXXXXXXXXX') AS ISSUE_NAME FROM ods.c_PDPDTPDT_sp a;" },
];

// ======================== 校验工具 ========================

// 提取字符串字面量（顺序保留）
function extractStrings(sql) {
    const re = /'([^'\n]|'')*'/g;
    const out = [];
    let m;
    while ((m = re.exec(sql)) !== null) out.push(m[0]);
    return out;
}

// 关键字计数（基于统一关键字表，忽略大小写；先剥离注释，避免注释文本中的单词被误计）
function countKeywords(sql) {
    const counts = {};
    const cleaned = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    let m;
    while ((m = re.exec(cleaned)) !== null) {
        const u = m[1].toUpperCase();
        if (KEYWORDS.has(u)) counts[u] = (counts[u] || 0) + 1;
    }
    return counts;
}

// 语句数量（按 ; 分割，保护字符串与注释）
function countStatements(sql) {
    const cleaned = sql
        .replace(/'([^'\n]|'')*'/g, "''")
        .replace(/--[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    return cleaned.split(';').filter(s => s.trim()).length;
}

// 括号平衡
function parenBalance(sql) {
    let open = 0, close = 0;
    for (const c of sql) {
        if (c === '(') open++;
        else if (c === ')') close++;
    }
    return { open, close };
}

// 行注释吞后文检测：仅当 -- 之后紧跟强 SQL 从句关键字（说明后续代码被注释吞并）才算问题。
// 不用 AND/OR/IS/NOT（常见于注释文本本身，如告警注释 "-- ⚠ 混合 AND/OR"）
function findCommentSwallow(text) {
    const issues = [];
    const kwRe = /\b(SELECT|FROM|WHERE|JOIN|ON|CASE|WHEN|THEN|ELSE|END|BY|GROUP|ORDER|HAVING|LIMIT|INSERT|INTO|UPDATE|DELETE|SET|VALUES|CREATE)\b/i;
    text.split('\n').forEach((line, i) => {
        const idx = line.indexOf('--');
        if (idx >= 0 && kwRe.test(line.slice(idx + 2))) {
            issues.push({ line: i + 1, text: line.trim() });
        }
    });
    return issues;
}

// 占位符泄漏检测
function findPlaceholderLeak(text) {
    const re = /__(S|C|K|V|O|L)\d+__/g;
    const found = [];
    let m;
    while ((m = re.exec(text)) !== null) found.push(m[0]);
    return found;
}

// ======================== 场景运行 ========================

function runScenario(sc) {
    const report = { id: sc.id, cat: sc.cat, name: sc.name, checks: [], output: null, error: null };
    const keyOf = (k) => k;
    const addCheck = (name, ok, detail) => report.checks.push({ name, ok, detail });

    try {
        const formatted = formatSQL(sc.sql);
        report.output = formatted;

        // 检查1: 关键字保持
        const k1 = countKeywords(sc.sql), k2 = countKeywords(formatted);
        const kwDiffs = [];
        for (const k of new Set([...Object.keys(k1), ...Object.keys(k2)])) {
            if ((k1[k] || 0) !== (k2[k] || 0)) kwDiffs.push(`${k}:${k1[k]||0}→${k2[k]||0}`);
        }
        addCheck('关键字保持', kwDiffs.length === 0, kwDiffs.join(', '));

        // 检查2: 字符串保持
        const s1 = JSON.stringify(extractStrings(sc.sql));
        const s2 = JSON.stringify(extractStrings(formatted));
        addCheck('字符串保持', s1 === s2, s1 === s2 ? '' : '字符串内容/顺序变化');

        // 检查3: 语句数量
        const n1 = countStatements(sc.sql), n2 = countStatements(formatted);
        addCheck('语句数量', n1 === n2, `${n1}→${n2}`);

        // 检查4: 无占位符泄漏
        const leak = findPlaceholderLeak(formatted);
        addCheck('无占位符泄漏', leak.length === 0, leak.join(', '));

        // 检查5: 幂等性
        const second = formatSQL(formatted);
        addCheck('幂等性', second === formatted, second === formatted ? '' : '二次格式化结果不一致');

        // 检查6: 行注释不吞后文
        const swallow = findCommentSwallow(formatted);
        addCheck('注释不吞后文', swallow.length === 0, swallow.map(x => `L${x.line}`).join(', '));

        // 检查7: 括号平衡
        const pb = parenBalance(formatted);
        addCheck('括号平衡', pb.open === pb.close, `(${pb.open} vs ${pb.close})`);
    } catch (e) {
        report.error = `${e.message}`;
        report.checks.push({ name: '运行无异常', ok: false, detail: e.stack ? e.message : '' });
    }

    report.passed = report.error === null && report.checks.every(c => c.ok);
    return report;
}

// ======================== Markdown 报告 ========================

function escapeMd(s) {
    return String(s).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function renderReport(results) {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    const lines = [];

    lines.push('# SQL Formatter 全面场景测试报告');
    lines.push('');
    lines.push(`> 生成时间: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`);
    lines.push(`> 覆盖类别: ${new Set(results.map(r => r.cat)).size} 类 · ${total} 个场景`);
    lines.push('');
    lines.push(`## 汇总`);
    lines.push('');
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|---|---|`);
    lines.push(`| 场景总数 | ${total} |`);
    lines.push(`| ✅ 通过 | ${passed} |`);
    lines.push(`| ❌ 失败 | ${failed} |`);
    lines.push(`| 通过率 | ${(passed / total * 100).toFixed(1)}% |`);
    lines.push('');

    // 失败清单
    const failList = results.filter(r => !r.passed);
    if (failList.length > 0) {
        lines.push(`## ❌ 失败场景`);
        lines.push('');
        lines.push(`| 编号 | 类别 | 场景 | 失败原因 |`);
        lines.push(`|---|---|---|---|`);
        for (const r of failList) {
            const reason = r.error
                ? `运行异常: ${escapeMd(r.error)}`
                : r.checks.filter(c => !c.ok).map(c => escapeMd(c.name) + (c.detail ? `(${escapeMd(c.detail)})` : '')).join('; ');
            lines.push(`| ${r.id} | ${escapeMd(r.cat)} | ${escapeMd(r.name)} | ${reason} |`);
        }
        lines.push('');
    }

    // 按类别分组明细
    const byCat = {};
    for (const r of results) (byCat[r.cat] = byCat[r.cat] || []).push(r);

    lines.push(`## 分场景明细`);
    lines.push('');
    for (const cat of Object.keys(byCat)) {
        const catResults = byCat[cat];
        const catPass = catResults.filter(r => r.passed).length;
        lines.push(`### ${cat} （${catPass}/${catResults.length}）`);
        lines.push('');
        lines.push(`| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |`);
        lines.push(`|---|---|---|---|---|---|---|---|---|---|`);
        for (const r of catResults) {
            const cell = (name, check) => {
                const c = r.checks.find(x => x.name === name);
                return c ? (c.ok ? '✅' : '❌') : '—';
            };
            lines.push(`| ${r.id} | ${escapeMd(r.name)} | ${cell('关键字保持', r)} | ${cell('字符串保持', r)} | ${cell('语句数量', r)} | ${cell('无占位符泄漏', r)} | ${cell('幂等性', r)} | ${cell('注释不吞后文', r)} | ${cell('括号平衡', r)} | ${r.passed ? '✅' : '❌'} |`);
        }
        lines.push('');
    }

    // 代表性输出（每个场景的输入/输出）
    lines.push(`## 输入 / 输出示例`);
    lines.push('');
    for (const r of results) {
        lines.push(`### ${r.id} — ${r.name} ${r.passed ? '' : '（❌ 失败）'}`);
        lines.push('');
        lines.push('<details>');
        lines.push(`<summary>查看</summary>`);
        lines.push('');
        lines.push('**输入:**');
        lines.push('```sql');
        lines.push(SCENARIOS.find(s => s.id === r.id).sql);
        lines.push('```');
        lines.push('');
        lines.push('**输出:**');
        lines.push('```sql');
        lines.push(r.output === null ? `(运行异常: ${r.error})` : r.output);
        lines.push('```');
        lines.push('');
        lines.push('</details>');
        lines.push('');
    }

    return lines.join('\n');
}

// ======================== 主入口 ========================

function main() {
    const outArg = process.argv.indexOf('--out');
    const outPath = outArg >= 0 ? process.argv[outArg + 1] : path.join(__dirname, '..', 'testdata', 'scenario_test_report.md');

    const results = SCENARIOS.map(runScenario);
    const passed = results.filter(r => r.passed).length;

    // 控制台摘要
    console.log(`\n${'='.repeat(60)}`);
    console.log(`场景测试完成: ${results.length} 个, 通过 ${passed}, 失败 ${results.length - passed}`);
    console.log(`${'='.repeat(60)}`);
    for (const r of results.filter(x => !x.passed)) {
        console.log(`❌ ${r.id} [${r.cat}] ${r.name}`);
        const fail = r.error || r.checks.filter(c => !c.ok).map(c => `${c.name}${c.detail ? '(' + c.detail + ')' : ''}`).join('; ');
        console.log(`   ↳ ${fail}`);
    }
    if (passed === results.length) console.log('\n🎉 全部通过');
    console.log('');

    const md = renderReport(results);
    fs.writeFileSync(outPath, md, 'utf8');
    console.log(`📋 报告已保存: ${outPath}`);
    process.exit(passed === results.length ? 0 : 1);
}

if (require.main === module) main();

module.exports = { SCENARIOS, runScenario };
