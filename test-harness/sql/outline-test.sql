-- ============================================================
-- 大纲 & 定义跳转 测试用例
-- 语言: SQL (TDH) 或 SQL (GaussDB)
-- 测试: Ctrl+Shift+O 查看大纲, F12 跳转
-- ============================================================

-- 测试1: 变量表别名跳转
-- 悬浮第14行的 t 别名，应显示 "原表 my_table"
-- F12 应跳转到第14行
SELECT
    t.id
  , t.name
  , t.balance
FROM ${V_DB}.my_table t
WHERE t.status = 'ACTIVE';

-- 测试2: CREATE TABLE 含变量
-- F12 悬浮 23行的 tmp_result 应跳转到此处
-- 大纲应显示 "tmp_result"
CREATE TABLE ${V_DB}.tmp_result
AS
SELECT
    cust_id
  , COUNT(*) AS cnt
FROM ${V_DB}.my_table
GROUP BY cust_id;

-- 测试3: WITH CTE 应在大纲中出现
-- 大纲应显示: sales_cte, top_customers
WITH sales_cte AS (
    SELECT
        cust_id
      , SUM(trade_amount) AS total_sales
    FROM ${V_DB}.trade_record
    WHERE trade_date >= '2026-01-01'
    GROUP BY cust_id
)
, top_customers AS (
    SELECT
        cust_id
      , total_sales
      , RANK() OVER (ORDER BY total_sales DESC) AS rnk
    FROM sales_cte
    WHERE total_sales > 10000
)
SELECT
    c.cust_name
  , t.total_sales
  , t.rnk
FROM top_customers t
    JOIN ${V_DB}.customer c ON t.cust_id = c.cust_id
WHERE t.rnk <= 10;

-- 测试4: 嵌套子查询中的别名
-- F12 在66行的 s 别名上: 应跳转到58行
-- F12 悬浮67行的 r 表名: 应跳转到 CREATE TABLE tmp_result
SELECT
    s.cust_id
  , s.cnt
  , r.cust_id AS ref_id
FROM (
    SELECT
        cust_id
      , COUNT(*) AS cnt
    FROM ${V_DB}.my_table
    GROUP BY cust_id
) s
    LEFT JOIN ${V_DB}.tmp_result r ON s.cust_id = r.cust_id;

-- 测试5: CREATE VIEW
-- 大纲应显示 "📋 v_active_customers"
CREATE VIEW ${V_DB}.v_active_customers AS
SELECT
    cust_id
  , cust_name
  , status
FROM ${V_DB}.customer
WHERE status = 'ACTIVE';

-- 测试6: BEGIN ... END 配对
-- 光标在 BEGIN 上，应高亮 END
BEGIN
    INSERT INTO ${V_DB}.tmp_result (cust_id, cnt)
    VALUES ('C001', 100);

    UPDATE ${V_DB}.customer
    SET status = 'INACTIVE'
    WHERE cust_id = 'C001';
END;
