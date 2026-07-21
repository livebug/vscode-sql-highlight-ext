-- ============================================================
-- 子查询格式化测试
-- ============================================================

-- 1. FROM 子查询
SELECT
    a.id
  , a.name
FROM (
    SELECT
        id
      , name
      , dt
    FROM ods_users WHERE dt = '2026-01-01'
) a
WHERE a.id > 100;

-- 2. WHERE IN 子查询
SELECT
    id
  , name
FROM ods_users
WHERE id IN (
    SELECT user_id FROM ods_order_header WHERE order_amount > 1000
)
    AND dt = '2026-01-01';

-- 3. 嵌套子查询 (2层)
SELECT
    id
  , name
FROM (
    SELECT
        id
      , name
    FROM (
        SELECT
            id
          , name
          , dt
        FROM ods_users WHERE dt = '2026-01-01'
    ) inner_t
    WHERE id > 100
) outer_t;

-- 4. EXISTS 子查询
SELECT
    id
  , name
FROM ods_users u
WHERE EXISTS (
    SELECT 1 FROM ods_order_header o
    WHERE o.user_id = u.id
     AND o.order_amount > 500
);

-- 5. 子查询在 SELECT 字段中 (标量子查询)
SELECT
    id
  , name
  , (
    SELECT COUNT(*) FROM ods_order_header o WHERE o.user_id = u.id
) AS order_count
FROM ods_users u;

-- 6. JOIN 后接子查询
SELECT
    u.id
  , o.cnt
FROM ods_users u
    LEFT JOIN (
    SELECT
        user_id
      , COUNT(*) AS cnt
    FROM ods_order_header WHERE dt = '2026-01-01' GROUP BY user_id
) o
    ON u.id = o.user_id;

-- 7. 子查询 + UNION
SELECT
    id
  , name
FROM (
    SELECT
        id
      , name
    FROM ods_users WHERE dt = '2026-01-01'
    UNION ALL
    SELECT
        id
      , name
    FROM ods_users WHERE dt = '2026-01-02'
) combined