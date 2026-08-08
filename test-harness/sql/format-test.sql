-- ============================================================
-- 格式化 测试用例
-- 操作: Shift+Alt+F (全文) / Ctrl+K Ctrl+F (选区)
-- ============================================================

-- 测试1: 基础 SELECT 逗号优先
-- 格式化后逗号应在行首
SELECT cust_id, cust_name, cert_no, mobile, risk_level FROM customer WHERE risk_level = 'HIGH';

-- 测试2: 多条件 AND 对齐
-- 格式化后 AND 应对齐
SELECT * FROM acct_info WHERE balance > 10000 AND acct_type = 'SAVING' AND status = 'ACTIVE' AND currency = 'CNY';

-- 测试3: JOIN 对齐
-- 格式化后 JOIN 应缩进，ON 应右对齐
SELECT a.acct_id, a.balance, l.loan_amount FROM acct_info a LEFT JOIN loan_info l ON a.acct_id = l.acct_id INNER JOIN customer c ON a.cust_id = c.cust_id;

-- 测试4: 子查询递归格式化
-- 格式化后内层 SELECT 也应缩进
SELECT * FROM (SELECT cust_id, SUM(trade_amount) AS total FROM trade_record WHERE trade_date >= '2026-01-01' GROUP BY cust_id) sub WHERE total > 5000;

-- 测试5: 多语句格式化
-- 格式化后各语句应独立，分号后空行
SELECT * FROM customer WHERE cust_id = 'C001';
INSERT INTO customer (cust_id, cust_name) VALUES ('C002', '测试客户');
UPDATE customer SET status = 'INACTIVE' WHERE cust_id = 'C002';

-- 测试6: CASE WHEN 格式化（短则单行）
-- 格式化后短 CASE 保持单行
SELECT cust_id, CASE WHEN balance > 10000 THEN 'HIGH' ELSE 'LOW' END AS balance_level FROM acct_info;

-- 测试6a: CASE WHEN 长 CASE（CASE/END 对齐 + THEN 对齐）
-- 格式化后 CASE/END 对齐，WHEN/THEN 独立行并对齐
SELECT cust_id, CASE WHEN balance > 10000 THEN 'HIGH' WHEN balance > 1000 THEN 'MEDIUM' WHEN balance > 100 THEN 'LOW' ELSE 'VERY LOW' END AS balance_level FROM acct_info;

-- 测试6b: 简单 CASE（CASE expr）
SELECT CASE status WHEN 1 THEN 'active' WHEN 2 THEN 'inactive' WHEN 3 THEN 'disabled' WHEN 4 THEN 'archived' ELSE 'unknown' END AS st FROM users;

-- 测试6c: WHEN 内多条件（AND/OR 对齐）
SELECT CASE WHEN balance > 10000 AND acct_type = 'SAVING' OR cust_level = 'VIP' THEN 'HIGH' WHEN balance > 1000 THEN 'MEDIUM' ELSE 'LOW' END AS level FROM acct_info;

-- 测试6d: 嵌套 CASE
SELECT CASE WHEN a > 1 THEN CASE WHEN b > 1 THEN 'x' WHEN b > 0 THEN 'y' ELSE 'z' END WHEN a > 0 THEN 'm' ELSE 'n' END AS t FROM tab;

-- 测试6e: CASE 内行注释（注释应落在行尾，不吞后文）
SELECT CASE WHEN a > 1 THEN 'x' -- 条件一
 WHEN a > 0 THEN 'y' ELSE 'z' END AS t FROM tab;
SELECT id, CASE WHEN status = 1 THEN 'ok' -- 正常
 WHEN status = 2 THEN 'warn' -- 警告
 ELSE 'err' END AS st FROM t;

-- 测试7: OVER() 窗口函数保护
-- 格式化后 OVER 内 PARTITION BY/ORDER BY 不应被拆分
SELECT cust_id, trade_amount, trade_date, SUM(trade_amount) OVER (PARTITION BY cust_id ORDER BY trade_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total FROM trade_record;

-- 测试8: 变量保护
-- 格式化后 ${VAR} 不应被修改
SELECT * FROM ${V_DB}.customer WHERE status = '${STATUS}';

-- 测试9: 注释保留
-- 格式化后注释应在正确位置
SELECT
    cust_id    -- 客户编号
  , cust_name  -- 客户名称
  , risk_level -- 风险等级
FROM customer;

-- 测试10: INSERT INTO ... SELECT
INSERT INTO ${V_DB}.tmp_result (cust_id, cnt)
SELECT cust_id, COUNT(*) FROM trade_record GROUP BY cust_id;

-- 测试11: SELECT 字段 AS 对齐 + 注释对齐
-- 格式化后 AS 关键字列对齐，尾部注释列对齐
SELECT total_amount * 0.8 AS discount, CONCAT(cust_name, '-', cert_no) AS full_id, balance AS bal FROM customer;

-- 测试12: GROUP BY / ORDER BY 各自独立成行
SELECT cust_id, COUNT(*) AS cnt, SUM(amount) AS total FROM trade GROUP BY cust_id ORDER BY total DESC;

-- 测试13: UPDATE SET 逐行 / DELETE 短则单行
UPDATE customer SET status = 'INACTIVE', risk_level = 'LOW', balance = 0 WHERE cust_id = 'C002';
DELETE FROM customer WHERE status = 'INACTIVE';

-- 测试14: CREATE TABLE 强制多行 + 存储子句换行
CREATE TABLE acct_info (acct_id VARCHAR(32) PRIMARY KEY, cust_id VARCHAR(32) NOT NULL, balance DECIMAL(18,2) DEFAULT 0) CLUSTERED BY (acct_id) SORTED BY (acct_id) INTO 16 BUCKETS STORED AS PARQUET;

-- 测试15: WITH 多 CTE 逐行 + 内层 SELECT 格式化
WITH a AS (SELECT id, name FROM t1 WHERE x > 1), b AS (SELECT id FROM t2 WHERE y < 2) SELECT a.id FROM a JOIN b ON a.id = b.id;

-- 测试16: WHEN 多条件 AND/OR 换行 + 优先级告警
SELECT CASE WHEN balance > 10000 AND acct_type = 'SAVING' OR cust_level = 'VIP' THEN 'HIGH' WHEN balance > 1000 THEN 'MEDIUM' ELSE 'LOW' END AS level FROM acct_info;

-- 测试17: 字段后行注释（注释留在字段行尾，逗号保留）
SELECT cust_id, -- 客户编号
 cust_name, -- 客户名称
 risk_level FROM customer;

-- 测试18: MERGE（WHEN 独立成行，SET 动作缩进不与 WHEN 同行）
MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.name = s.name WHEN NOT MATCHED THEN INSERT (id, name) VALUES (s.id, s.name);
