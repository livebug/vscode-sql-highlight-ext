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
WHERE o.status = 'PAID';

-- 3. CASE WHEN 格式化（长 CASE：多分支 + THEN 对齐 + END 对齐）
SELECT user_id, CASE WHEN total_amount > 10000 THEN 'HIGH' WHEN total_amount > 5000 THEN 'MEDIUM' WHEN total_amount > 1000 THEN 'LOW' ELSE 'NONE' END AS level FROM orders;

-- 4. CASE WHEN 简单 CASE（CASE expr）
SELECT user_id, CASE o.status WHEN 'PAID' THEN '已支付' WHEN 'PENDING' THEN '待支付' WHEN 'CANCELLED' THEN '已取消' ELSE '未知' END AS st FROM orders o;

-- 5. CASE WHEN 内多条件 AND/OR 对齐
SELECT CASE WHEN o.total_amount > 10000 AND o.status = 'PAID' OR o.express = 1 THEN 'VIP' WHEN o.total_amount > 1000 THEN 'NORMAL' ELSE 'LOW' END AS grade FROM orders o;

-- 6. 嵌套 CASE WHEN
SELECT CASE WHEN u.vip = 1 THEN CASE WHEN u.score > 90 THEN 'GOLD' WHEN u.score > 60 THEN 'SILVER' ELSE 'BRONZE' END ELSE 'NONE' END AS vip_level FROM users u;

-- 7. CASE WHEN 内行注释（注释应落在行尾，不吞后文）
SELECT id, CASE WHEN status = 1 THEN 'ok' -- 正常
 WHEN status = 2 THEN 'warn' -- 警告
 ELSE 'err' END AS st FROM orders;
