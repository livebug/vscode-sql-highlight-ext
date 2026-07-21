-- ============================================================
-- 语义跳转 + 补全测试用例
-- ============================================================

-- 1. 建临时表
CREATE TEMP TABLE tmp_order_summary AS
SELECT
    user_id
  , COUNT(*) AS order_cnt
  , SUM(total_amount) AS total_amt
FROM orders
WHERE created_at >= CURRENT_DATE - 30
GROUP BY user_id;

-- 2. 别名定义 + 使用
SELECT
    u.name
  , u.email
  , o.total_amount
  , t.order_cnt
  , t.total_amt
FROM users u
    JOIN orders o ON u.id = o.user_id
    LEFT JOIN tmp_order_summary t ON u.id = t.user_id
WHERE o.status = 
