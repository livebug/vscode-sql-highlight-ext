-- ============================================================
-- EAST 监管报送 — 测试用例
-- 打开本文件后测试: 补全、Hover、跳转
-- 语言选择: SQL TDH 或 SQL GaussDB
-- ============================================================

-- 试试在 FROM 后面打字，看能否补全表名
-- 试试在 u. 后面打字，看能否补全字段
create temp table ${V_JES_MOD}.tmp_cust_acct as
SELECT
    u.cust_id
  , u.cust_name
  , u.cert_no
  , a.acct_id
  , a.balance
FROM customer u
    JOIN acct_info a ON u.cust_id = a.cust_id;

-- 多个别名 JOIN
SELECT
    a.acct_id
  , l.loan_amount
  , l.loan_balance
  , d.amount AS deposit_amount
FROM acct_info a
    LEFT JOIN loan_info l ON a.acct_id = l.acct_id
    LEFT JOIN ${V_JES_MOD}.tmp_cust_acct d ON a.acct_id = d.acct_id;

-- 试试 F12 在别名的使用位置上，看能否跳转
-- 再试试在折行后打 o. 补全字段
SELECT
    o.trade_id
  , o.trade_date
  , o.trade_amount
  , o.channel
  , r.mark_type
  , r.mark_desc
FROM trade_record o
    LEFT JOIN risk_mark r ON o.acct_id = r.cust_id;

-- 聚合查询
SELECT
    cust_id
  , COUNT(*) AS trade_cnt
  , SUM(trade_amount) AS total_amt
  , AVG(trade_amount) AS avg_amt
FROM trade_record
WHERE trade_date >= '2026-01-01'
GROUP BY cust_id
HAVING COUNT(*) > 5;

-- CREATE TEMP TABLE 后跳转
CREATE TEMP TABLE ${V_JES_MOD}.tmp_daily_stat AS
SELECT
    trade_date
  , COUNT(*) AS cnt
  , SUM(trade_amount) AS amt
FROM trade_record
GROUP BY trade_date;

SELECT * FROM ${V_JES_MOD}.tmp_daily_stat WHERE cnt > 100;
