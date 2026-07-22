-- ============================================================
-- 悬浮提示 & 定义跳转 测试用例
-- 测试: 鼠标悬浮(Hover) / F12 / Ctrl+Click
-- ============================================================

-- ----------------------------------------------------------
-- 场景A: 表别名悬浮与跳转
-- ----------------------------------------------------------

-- A1: 基本别名
-- 悬浮第20行的 u → 应显示 "原表 customer"
-- F12(在20行u上) → 跳转到第19行
SELECT
    u.cust_id
  , u.cust_name
FROM customer u
WHERE u.status = 'ACTIVE';

-- A2: AS 别名
-- 悬浮第30行的 a → 应显示 "原表 acct_info"
-- F12(在30行a上) → 跳转到第29行的 AS a 处
SELECT
    a.acct_id
  , a.balance
FROM acct_info AS a
WHERE a.balance > 1000;

-- A3: 多表别名
-- 悬浮第41行的 c → 应显示 "原表 customer"
-- 悬浮第41行的 a → 应显示 "原表 acct_info"
SELECT
    c.cust_name
  , a.acct_id
  , a.balance
FROM customer c
    JOIN acct_info a ON c.cust_id = a.cust_id;

-- A4: 变量表别名 (关键！)
-- 悬浮第54行的 t → 应显示 "原表 trade_record"
-- F12(在54行t上) → 跳转到第53行
-- 之前会失败，修复后应正常
SELECT
    t.trade_id
  , t.trade_amount
FROM ${V_DB}.trade_record t
WHERE t.trade_date >= '2026-01-01';

-- A5: 子查询别名
-- 悬浮第66行的 s → 应显示 "原表 ?" (子查询无表名)
-- F12(在66行s上) → 跳转到第63行
SELECT
    s.cust_id
  , s.cnt
FROM (
    SELECT cust_id, COUNT(*) AS cnt
    FROM trade_record
    GROUP BY cust_id
) s
WHERE s.cnt > 5;

-- ----------------------------------------------------------
-- 场景B: CREATE TABLE 定义跳转
-- ----------------------------------------------------------

CREATE TABLE test_customers (
    cust_id    VARCHAR(32) NOT NULL
  , cust_name  VARCHAR(200)
  , created_at DATE DEFAULT CURRENT_DATE
);

-- B1: 跳转到 CREATE
-- 悬浮第88行的 test_customers → 应显示 CREATE 语句摘要
-- F12 → 跳转到第81行
SELECT * FROM test_customers;

-- B2: 变量 CREATE TABLE 跳转 (关键!)
-- 悬浮第96行的 tmp_log → 应显示 CREATE 语句摘要
-- F12 → 跳转到第93行
-- 之前会失败，修复后应正常
CREATE TABLE ${V_DB}.tmp_log (
    log_id   VARCHAR(32)
  , log_msg  VARCHAR(500)
);
SELECT * FROM ${V_DB}.tmp_log;

-- ----------------------------------------------------------
-- 场景C: BEGIN...END / CASE...END 配对
-- ----------------------------------------------------------

-- C1: 光标在 BEGIN 上，END 应高亮
BEGIN
    INSERT INTO test_customers VALUES ('C001', 'Alice', CURRENT_DATE);
END;

-- C2: 光标在 CASE 上，END 应高亮 (对应 CASE，而非 BEGIN)
SELECT
    cust_id
  , CASE WHEN balance > 10000 THEN 'HIGH' ELSE 'LOW' END AS level
FROM acct_info;
