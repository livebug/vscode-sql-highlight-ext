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

-- 测试6: CASE WHEN 格式化
-- 格式化后 CASE/WHEN/THEN/ELSE/END 应保持清晰
SELECT cust_id, CASE WHEN balance > 10000 THEN 'HIGH' WHEN balance > 1000 THEN 'MEDIUM' ELSE 'LOW' END AS balance_level FROM acct_info;

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
