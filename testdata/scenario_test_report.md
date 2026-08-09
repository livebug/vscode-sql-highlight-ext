# SQL Formatter 全面场景测试报告

> 生成时间: 2026-08-08 23:28:46
> 覆盖类别: 15 类 · 77 个场景

## 汇总

| 指标 | 数值 |
|---|---|
| 场景总数 | 77 |
| ✅ 通过 | 77 |
| ❌ 失败 | 0 |
| 通过率 | 100.0% |

## 分场景明细

### 基础 SELECT （6/6）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| S01 | 单表简单查询 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| S02 | 多字段逗号优先 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| S03 | 表达式+别名（AS 对齐） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| S06 | AS 对齐 + 注释对齐 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| S04 | DISTINCT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| S05 | SELECT 无 FROM（标量） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### WHERE 条件 （7/7）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| W01 | 多条件 AND 对齐 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| W02 | AND/OR 混合 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| W03 | BETWEEN 范围 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| W04 | IN / NOT IN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| W05 | LIKE / RLIKE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| W06 | IS NULL / 逻辑运算 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| W07 | BETWEEN 后跟 AND 连接 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### JOIN （5/5）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| J01 | INNER JOIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J02 | LEFT JOIN + ON 多条件 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J03 | RIGHT / FULL / CROSS / NATURAL | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J04 | SEMI / ANTI JOIN (TDH) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J05 | 多表 JOIN 链 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 子查询 （5/5）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| Q01 | FROM 派生表 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Q02 | WHERE IN 子查询 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Q03 | EXISTS 相关子查询 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Q04 | 多层嵌套子查询 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Q05 | 标量子查询 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### CASE WHEN （10/10）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| C01 | 短 CASE 保持单行 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| C02 | 长 CASE THEN 对齐 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| C03 | 简单 CASE (CASE expr) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| C04 | 嵌套 CASE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| C05 | WHEN 多条件 AND/OR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| C06 | CASE 内行注释 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| C07 | WHERE/ORDER BY 中 CASE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| C08 | 大 CASE（10 分支） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| C09 | THEN 值含子查询 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| C10 | 简单 CASE 长表达式 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 聚合排序 （4/4）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| G01 | GROUP BY + 聚合 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| G02 | HAVING 过滤分组 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| G03 | ORDER BY 多列 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| G04 | LIMIT / OFFSET | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### DML （6/6）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| D01 | INSERT VALUES | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| D02 | INSERT SELECT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| D03 | UPDATE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| D04 | DELETE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| D05 | MERGE (GaussDB) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| D06 | TRUNCATE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### DDL （5/5）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| DD1 | CREATE TABLE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DD5 | CREATE TABLE 列内注释 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DD2 | CREATE TEMP TABLE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DD3 | CREATE VIEW | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DD4 | ALTER / DROP | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### CTE （3/3）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| T01 | 单个 CTE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| T02 | 多个 CTE 链式 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| T03 | 递归 CTE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 窗口函数 （2/2）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| F01 | OVER PARTITION ORDER | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F02 | ROWS BETWEEN 帧 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 集合运算 （2/2）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| U01 | UNION / UNION ALL | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| U02 | INTERSECT / EXCEPT / MINUS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### TDH 特有 （4/4）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| H01 | LATERAL VIEW EXPLODE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| H02 | STACK / INLINE / POSEXPLODE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| H03 | MAPJOIN 提示 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| H04 | CLUSTERED / SORTED / BUCKETS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 注释字符串 （7/7）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| N01 | 行注释 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| N02 | 块注释 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| N03 | 字段后行注释 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| N04 | 字符串转义引号 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| N05 | 字符串含关键字 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| N06 | ${VAR} 变量 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| N07 | 字符串含分号 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 多语句块 （2/2）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| M01 | 多条语句分号分隔 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| M02 | BEGIN...END 块 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 边界 （9/9）

| 编号 | 场景 | 关键字 | 字符串 | 语句数 | 无泄漏 | 幂等 | 注释 | 括号 | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| E01 | 空/纯注释输入 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| E02 | 深层嵌套括号函数 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| E03 | 无引号标识符边界 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| E04 | 多语句块注释内嵌行注释+字符串 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| E05 | 多行表达式含行尾注释（不拆散） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| E06 | AS 在表达式内（CAST AS STRING） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| E07 | 含子查询字段 AS（不参与对齐） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| E08 | 行注释含字符串/变量 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| E09 | 嵌套 nvl 长子查询字段缩进 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## 输入 / 输出示例

### S01 — 单表简单查询 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT cust_id, cust_name, cert_no FROM customer;
```

**输出:**
```sql
SELECT
    cust_id
  , cust_name
  , cert_no
FROM customer;
```

</details>

### S02 — 多字段逗号优先 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT a, b, c, d, e, f, g, h FROM t;
```

**输出:**
```sql
SELECT
    a
  , b
  , c
  , d
  , e
  , f
  , g
  , h
FROM t;
```

</details>

### S03 — 表达式+别名（AS 对齐） 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT total_amount * 0.8 AS discount, CONCAT(cust_name, '-', cert_no) AS full_id, balance AS bal FROM customer;
```

**输出:**
```sql
SELECT
    total_amount * 0.8              AS discount
  , CONCAT(cust_name, '-', cert_no) AS full_id
  , balance                         AS bal
FROM customer;
```

</details>

### S06 — AS 对齐 + 注释对齐 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT a AS alpha, bbbb AS beta, c -- 说明c
, ddd -- 说明d
FROM t;
```

**输出:**
```sql
SELECT
    a    AS alpha
  , bbbb AS beta
  , c   -- 说明c
  , ddd -- 说明d
FROM t;
```

</details>

### S04 — DISTINCT 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT DISTINCT acct_type, currency FROM acct_info;
```

**输出:**
```sql
SELECT
    DISTINCT acct_type
  , currency
FROM acct_info;
```

</details>

### S05 — SELECT 无 FROM（标量） 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT CURRENT_DATE, 1 + 2 AS sum_result;
```

**输出:**
```sql
SELECT
    CURRENT_DATE
  , 1 + 2 AS sum_result;
```

</details>

### W01 — 多条件 AND 对齐 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM acct_info WHERE balance > 10000 AND acct_type = 'SAVING' AND status = 'ACTIVE' AND currency = 'CNY';
```

**输出:**
```sql
SELECT * FROM acct_info
WHERE balance > 10000
    AND acct_type = 'SAVING'
    AND status = 'ACTIVE'
    AND currency = 'CNY';
```

</details>

### W02 — AND/OR 混合 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM t WHERE a = 1 AND (b = 2 OR c = 3) AND NOT d = 4;
```

**输出:**
```sql
SELECT * FROM t
WHERE a = 1
    AND (b = 2 OR c = 3)
    AND NOT d = 4;
```

</details>

### W03 — BETWEEN 范围 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM trade WHERE trade_date BETWEEN '2026-01-01' AND '2026-12-31';
```

**输出:**
```sql
SELECT * FROM trade WHERE trade_date BETWEEN '2026-01-01' AND '2026-12-31';
```

</details>

### W04 — IN / NOT IN 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM t WHERE id IN (1, 2, 3, 4, 5) AND status NOT IN ('X', 'Y');
```

**输出:**
```sql
SELECT * FROM t
WHERE id IN (1, 2, 3, 4, 5)
    AND status NOT IN ('X', 'Y');
```

</details>

### W05 — LIKE / RLIKE 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM t WHERE name LIKE '%张%' OR phone RLIKE '^1[3-9]';
```

**输出:**
```sql
SELECT * FROM t
WHERE name LIKE '%张%'
    OR phone RLIKE '^1[3-9]';
```

</details>

### W06 — IS NULL / 逻辑运算 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM t WHERE deleted_at IS NULL AND balance IS NOT NULL AND age >= 18;
```

**输出:**
```sql
SELECT * FROM t
WHERE deleted_at IS NULL
    AND balance IS NOT NULL
    AND age >= 18;
```

</details>

### W07 — BETWEEN 后跟 AND 连接 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM t WHERE amount BETWEEN 100 AND 500 AND status = 1 AND create_time BETWEEN '2026-01-01' AND '2026-06-30';
```

**输出:**
```sql
SELECT * FROM t
WHERE amount BETWEEN 100 AND 500
    AND status = 1
    AND create_time BETWEEN '2026-01-01' AND '2026-06-30';
```

</details>

### J01 — INNER JOIN 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT a.id, b.name FROM t1 a INNER JOIN t2 b ON a.id = b.id;
```

**输出:**
```sql
SELECT
    a.id
  , b.name
FROM t1 a
    INNER JOIN t2 b
            ON a.id = b.id;
```

</details>

### J02 — LEFT JOIN + ON 多条件 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT a.id, b.name FROM t1 a LEFT JOIN t2 b ON a.id = b.id AND a.type = b.type;
```

**输出:**
```sql
SELECT
    a.id
  , b.name
FROM t1 a
    LEFT JOIN t2 b
           ON a.id = b.id
          AND a.type = b.type;
```

</details>

### J03 — RIGHT / FULL / CROSS / NATURAL 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM a RIGHT JOIN b ON a.id = b.id FULL OUTER JOIN c ON a.id = c.id CROSS JOIN d NATURAL JOIN e;
```

**输出:**
```sql
SELECT * FROM a
    RIGHT JOIN b
            ON a.id = b.id
    FULL OUTER JOIN c
                 ON a.id = c.id
    CROSS JOIN d
    NATURAL JOIN e;
```

</details>

### J04 — SEMI / ANTI JOIN (TDH) 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT a.id FROM a LEFT SEMI JOIN b ON a.id = b.id WHERE a.x = 1 UNION SELECT a.id FROM a LEFT ANTI JOIN b ON a.id = b.id;
```

**输出:**
```sql
SELECT a.id FROM a LEFT SEMI
    JOIN b
      ON a.id = b.id
WHERE a.x = 1
UNION 
SELECT a.id FROM a LEFT ANTI
    JOIN b
      ON a.id = b.id;
```

</details>

### J05 — 多表 JOIN 链 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT o.id, c.name, p.price FROM orders o JOIN customers c ON o.cust_id = c.id JOIN products p ON o.prod_id = p.id LEFT JOIN payments py ON py.order_id = o.id;
```

**输出:**
```sql
SELECT
    o.id
  , c.name
  , p.price
FROM orders o
    JOIN customers c
      ON o.cust_id = c.id
    JOIN products p
      ON o.prod_id = p.id
    LEFT JOIN payments py
           ON py.order_id = o.id;
```

</details>

### Q01 — FROM 派生表 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM (SELECT cust_id, SUM(amount) AS total FROM trade GROUP BY cust_id) sub WHERE total > 1000;
```

**输出:**
```sql
SELECT *
FROM (
         SELECT
             cust_id
           , SUM(amount) AS total
         FROM trade
         GROUP BY cust_id
     ) sub
WHERE total > 1000;
```

</details>

### Q02 — WHERE IN 子查询 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM t WHERE id IN (SELECT id FROM banned WHERE reason = 'fraud');
```

**输出:**
```sql
SELECT * FROM t
WHERE id IN (
                SELECT id FROM banned WHERE reason = 'fraud'
            );
```

</details>

### Q03 — EXISTS 相关子查询 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM orders o WHERE EXISTS (SELECT 1 FROM items i WHERE i.order_id = o.id AND i.qty > 5);
```

**输出:**
```sql
SELECT * FROM orders o
WHERE EXISTS (
                 SELECT 1 FROM items i
                 WHERE i.order_id = o.id
                     AND i.qty > 5
             );
```

</details>

### Q04 — 多层嵌套子查询 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM (SELECT a.id, (SELECT MAX(b.score) FROM scores b WHERE b.uid = a.id) AS top FROM users a) x WHERE x.top > 90;
```

**输出:**
```sql
SELECT *
FROM (
         SELECT
             a.id
           , (
                 SELECT MAX(b.score) FROM scores b WHERE b.uid = a.id
             ) AS top
         FROM users a
     ) x
WHERE x.top > 90;
```

</details>

### Q05 — 标量子查询 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT id, (SELECT name FROM users WHERE users.id = orders.uid) AS uname FROM orders;
```

**输出:**
```sql
SELECT
    id
  , (
        SELECT name FROM users WHERE users.id = orders.uid
    ) AS uname
FROM orders;
```

</details>

### C01 — 短 CASE 保持单行 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT CASE WHEN a > 1 THEN 'x' WHEN a > 0 THEN 'y' ELSE 'z' END AS t FROM tab;
```

**输出:**
```sql
SELECT CASE WHEN a > 1 THEN 'x' WHEN a > 0 THEN 'y' ELSE 'z' END AS t
FROM tab;
```

</details>

### C02 — 长 CASE THEN 对齐 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT cust_id, CASE WHEN balance > 10000 THEN 'HIGH' WHEN balance > 1000 THEN 'MEDIUM' WHEN balance > 100 THEN 'LOW' ELSE 'VERY LOW' END AS level FROM acct_info;
```

**输出:**
```sql
SELECT
    cust_id
  , CASE
        WHEN balance > 10000 THEN 'HIGH'
        WHEN balance > 1000  THEN 'MEDIUM'
        WHEN balance > 100   THEN 'LOW'
        ELSE 'VERY LOW'
    END AS level
FROM acct_info;
```

</details>

### C03 — 简单 CASE (CASE expr) 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT CASE status WHEN 1 THEN 'active' WHEN 2 THEN 'inactive' WHEN 3 THEN 'disabled' WHEN 4 THEN 'archived' ELSE 'unknown' END AS st FROM users;
```

**输出:**
```sql
SELECT CASE status
           WHEN 1 THEN 'active'
           WHEN 2 THEN 'inactive'
           WHEN 3 THEN 'disabled'
           WHEN 4 THEN 'archived'
           ELSE 'unknown'
       END AS st
FROM users;
```

</details>

### C04 — 嵌套 CASE 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT CASE WHEN a > 1 THEN CASE WHEN b > 1 THEN 'x' WHEN b > 0 THEN 'y' ELSE 'z' END WHEN a > 0 THEN 'm' ELSE 'n' END AS t FROM tab;
```

**输出:**
```sql
SELECT CASE
           WHEN a > 1 THEN CASE WHEN b > 1 THEN 'x' WHEN b > 0 THEN 'y' ELSE 'z' END
           WHEN a > 0 THEN 'm'
           ELSE 'n'
       END AS t
FROM tab;
```

</details>

### C05 — WHEN 多条件 AND/OR 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT CASE WHEN a > 100 AND b > 50 OR c = 10 THEN 'big' WHEN a > 10 THEN 'mid' ELSE 'small' END AS size FROM t;
```

**输出:**
```sql
SELECT CASE
           -- ⚠ 混合 AND/OR，建议用括号明确优先级
           WHEN a > 100
           AND b > 50
           OR c = 10
           THEN 'big'
           WHEN a > 10 THEN 'mid'
           ELSE 'small'
       END AS size
FROM t;
```

</details>

### C06 — CASE 内行注释 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT id, CASE WHEN status = 1 THEN 'ok' -- 正常
 WHEN status = 2 THEN 'warn' -- 警告
 ELSE 'err' END AS st FROM t;
```

**输出:**
```sql
SELECT
    id
  , CASE
        WHEN status = 1 THEN 'ok' -- 正常
        WHEN status = 2 THEN 'warn' -- 警告
        ELSE 'err'
    END AS st
FROM t;
```

</details>

### C07 — WHERE/ORDER BY 中 CASE 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT a, b FROM t WHERE CASE WHEN a IS NULL THEN 1 ELSE 0 END = 1 ORDER BY CASE WHEN b > 0 THEN b ELSE 999 END DESC;
```

**输出:**
```sql
SELECT
    a
  , b
FROM t
WHERE CASE WHEN a IS NULL THEN 1 ELSE 0 END = 1
ORDER BY CASE WHEN b > 0 THEN b ELSE 999 END DESC;
```

</details>

### C08 — 大 CASE（10 分支） 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT CASE WHEN a = 1 THEN 'one' WHEN a = 2 THEN 'two' WHEN a = 3 THEN 'three' WHEN a = 4 THEN 'four' WHEN a = 5 THEN 'five' WHEN a = 6 THEN 'six' WHEN a = 7 THEN 'seven' WHEN a = 8 THEN 'eight' WHEN a = 9 THEN 'nine' WHEN a = 10 THEN 'ten' ELSE 'many' END AS num FROM t;
```

**输出:**
```sql
SELECT CASE
           WHEN a = 1  THEN 'one'
           WHEN a = 2  THEN 'two'
           WHEN a = 3  THEN 'three'
           WHEN a = 4  THEN 'four'
           WHEN a = 5  THEN 'five'
           WHEN a = 6  THEN 'six'
           WHEN a = 7  THEN 'seven'
           WHEN a = 8  THEN 'eight'
           WHEN a = 9  THEN 'nine'
           WHEN a = 10 THEN 'ten'
           ELSE 'many'
       END AS num
FROM t;
```

</details>

### C09 — THEN 值含子查询 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT CASE WHEN a > 1 THEN (SELECT MAX(x) FROM tab2 WHERE tab2.id = tab.id) ELSE 0 END AS t FROM tab;
```

**输出:**
```sql
SELECT CASE
           WHEN a > 1 THEN
               (
                   SELECT MAX(x) FROM tab2 WHERE tab2.id = tab.id
               )
           ELSE 0
       END AS t
FROM tab;
```

</details>

### C10 — 简单 CASE 长表达式 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT CASE category_code WHEN 'A001' THEN 'Category Alpha' WHEN 'B002' THEN 'Category Beta' WHEN 'C003' THEN 'Category Gamma' ELSE 'Other' END AS cat FROM items;
```

**输出:**
```sql
SELECT CASE category_code
           WHEN 'A001' THEN 'Category Alpha'
           WHEN 'B002' THEN 'Category Beta'
           WHEN 'C003' THEN 'Category Gamma'
           ELSE 'Other'
       END AS cat
FROM items;
```

</details>

### G01 — GROUP BY + 聚合 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT cust_id, COUNT(*) AS cnt, SUM(amount) AS total, AVG(amount) AS avg_amt, MAX(amount) AS max_amt FROM trade GROUP BY cust_id;
```

**输出:**
```sql
SELECT
    cust_id
  , COUNT(*)    AS cnt
  , SUM(amount) AS total
  , AVG(amount) AS avg_amt
  , MAX(amount) AS max_amt
FROM trade
GROUP BY cust_id;
```

</details>

### G02 — HAVING 过滤分组 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT dept_id, COUNT(*) AS cnt FROM emp GROUP BY dept_id HAVING COUNT(*) > 10 AND SUM(salary) > 100000;
```

**输出:**
```sql
SELECT
    dept_id
  , COUNT(*) AS cnt
FROM emp
GROUP BY dept_id
HAVING COUNT(*) > 10
    AND SUM(salary) > 100000;
```

</details>

### G03 — ORDER BY 多列 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT a, b FROM t ORDER BY a DESC, b ASC NULLS LAST, c NULLS FIRST;
```

**输出:**
```sql
SELECT
    a
  , b
FROM t
ORDER BY a DESC, b ASC NULLS LAST, c NULLS FIRST;
```

</details>

### G04 — LIMIT / OFFSET 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM t ORDER BY id LIMIT 100 OFFSET 20;
```

**输出:**
```sql
SELECT * FROM t
ORDER BY id
LIMIT 100
OFFSET 20;
```

</details>

### D01 — INSERT VALUES 

<details>
<summary>查看</summary>

**输入:**
```sql
INSERT INTO customer (cust_id, cust_name, risk_level) VALUES ('C001', '张三', 'HIGH'), ('C002', '李四', 'MEDIUM');
```

**输出:**
```sql
INSERT INTO customer (cust_id, cust_name, risk_level) VALUES ('C001', '张三', 'HIGH'), ('C002', '李四', 'MEDIUM');
```

</details>

### D02 — INSERT SELECT 

<details>
<summary>查看</summary>

**输入:**
```sql
INSERT INTO tmp_result (cust_id, cnt) SELECT cust_id, COUNT(*) FROM trade GROUP BY cust_id;
```

**输出:**
```sql
INSERT INTO tmp_result (cust_id, cnt)
SELECT
    cust_id
  , COUNT(*)
FROM trade
GROUP BY cust_id;
```

</details>

### D03 — UPDATE 

<details>
<summary>查看</summary>

**输入:**
```sql
UPDATE customer SET status = 'INACTIVE', risk_level = 'LOW' WHERE cust_id = 'C002' AND update_time < '2026-01-01';
```

**输出:**
```sql
UPDATE customer
SET status = 'INACTIVE'
  , risk_level = 'LOW'
WHERE cust_id = 'C002'
    AND update_time < '2026-01-01';
```

</details>

### D04 — DELETE 

<details>
<summary>查看</summary>

**输入:**
```sql
DELETE FROM customer WHERE status = 'INACTIVE' AND deleted_at IS NOT NULL;
```

**输出:**
```sql
DELETE FROM customer
WHERE status = 'INACTIVE'
    AND deleted_at IS NOT NULL;
```

</details>

### D05 — MERGE (GaussDB) 

<details>
<summary>查看</summary>

**输入:**
```sql
MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.name = s.name WHEN NOT MATCHED THEN INSERT (id, name) VALUES (s.id, s.name);
```

**输出:**
```sql
MERGE INTO target t
USING source s
ON t.id = s.id
WHEN MATCHED THEN
    UPDATE SET t.name = s.name
WHEN NOT MATCHED THEN
    INSERT (id, name) VALUES (s.id, s.name);
```

</details>

### D06 — TRUNCATE 

<details>
<summary>查看</summary>

**输入:**
```sql
TRUNCATE TABLE tmp_order_summary;
```

**输出:**
```sql
TRUNCATE TABLE tmp_order_summary;
```

</details>

### DD1 — CREATE TABLE 

<details>
<summary>查看</summary>

**输入:**
```sql
CREATE TABLE acct_info (acct_id VARCHAR(32) PRIMARY KEY, cust_id VARCHAR(32) NOT NULL, balance DECIMAL(18,2) DEFAULT 0, status VARCHAR(10), create_time TIMESTAMP);
```

**输出:**
```sql
CREATE TABLE acct_info (
    acct_id VARCHAR(32) PRIMARY KEY
  , cust_id VARCHAR(32) NOT NULL
  , balance DECIMAL(18,2) DEFAULT 0
  , status VARCHAR(10)
  , create_time TIMESTAMP
);
```

</details>

### DD5 — CREATE TABLE 列内注释 

<details>
<summary>查看</summary>

**输入:**
```sql
CREATE TABLE t (id INT, -- 主键
 name STRING COMMENT '姓名', age INT) LOCATION '/data/t';
```

**输出:**
```sql
CREATE TABLE t (
    id INT -- 主键
  , name STRING COMMENT '姓名'
  , age INT
)
LOCATION '/data/t';
```

</details>

### DD2 — CREATE TEMP TABLE 

<details>
<summary>查看</summary>

**输入:**
```sql
CREATE TEMPORARY TABLE tmp_x AS SELECT a, b FROM src WHERE a > 1;
```

**输出:**
```sql
CREATE TEMPORARY TABLE tmp_x AS
SELECT
    a
  , b
FROM src WHERE a > 1;
```

</details>

### DD3 — CREATE VIEW 

<details>
<summary>查看</summary>

**输入:**
```sql
CREATE VIEW v_active AS SELECT id, name FROM users WHERE status = 1;
```

**输出:**
```sql
CREATE VIEW v_active AS
SELECT
    id
  , name
FROM users WHERE status = 1;
```

</details>

### DD4 — ALTER / DROP 

<details>
<summary>查看</summary>

**输入:**
```sql
ALTER TABLE customer ADD COLUMN email VARCHAR(100); DROP TABLE IF EXISTS tmp_x;
```

**输出:**
```sql
ALTER TABLE customer ADD COLUMN email VARCHAR(100);

DROP TABLE IF EXISTS tmp_x
```

</details>

### T01 — 单个 CTE 

<details>
<summary>查看</summary>

**输入:**
```sql
WITH cte AS (SELECT id, name FROM users WHERE status = 1) SELECT * FROM cte;
```

**输出:**
```sql
WITH cte AS (
           SELECT
               id
             , name
           FROM users WHERE status = 1
       )
SELECT * FROM cte;
```

</details>

### T02 — 多个 CTE 链式 

<details>
<summary>查看</summary>

**输入:**
```sql
WITH a AS (SELECT id FROM t1), b AS (SELECT id FROM t2) SELECT a.id FROM a JOIN b ON a.id = b.id;
```

**输出:**
```sql
WITH
    a AS (
             SELECT id FROM t1
         )
  , b AS (
             SELECT id FROM t2
         )
SELECT a.id FROM a
    JOIN b
      ON a.id = b.id;
```

</details>

### T03 — 递归 CTE 

<details>
<summary>查看</summary>

**输入:**
```sql
WITH RECURSIVE cte AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM cte WHERE n < 10) SELECT * FROM cte;
```

**输出:**
```sql
WITH RECURSIVE cte AS (
                     SELECT 1 AS n
                     UNION ALL
                     SELECT n + 1 FROM cte WHERE n < 10
                 )
SELECT * FROM cte;
```

</details>

### F01 — OVER PARTITION ORDER 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT cust_id, trade_date, SUM(amount) OVER (PARTITION BY cust_id ORDER BY trade_date) AS running FROM trade;
```

**输出:**
```sql
SELECT
    cust_id
  , trade_date
  , SUM(amount) OVER (PARTITION BY cust_id ORDER BY trade_date) AS running
FROM trade;
```

</details>

### F02 — ROWS BETWEEN 帧 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT cust_id, amount, AVG(amount) OVER (PARTITION BY cust_id ORDER BY trade_date ROWS BETWEEN 3 PRECEDING AND CURRENT ROW) AS ma FROM trade;
```

**输出:**
```sql
SELECT
    cust_id
  , amount
  , AVG(amount) OVER (PARTITION BY cust_id ORDER BY trade_date ROWS BETWEEN 3 PRECEDING AND CURRENT ROW) AS ma
FROM trade;
```

</details>

### U01 — UNION / UNION ALL 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT id FROM a UNION SELECT id FROM b UNION ALL SELECT id FROM c;
```

**输出:**
```sql
SELECT id FROM a
UNION 
SELECT id FROM b
UNION ALL
SELECT id FROM c;
```

</details>

### U02 — INTERSECT / EXCEPT / MINUS 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT id FROM a INTERSECT SELECT id FROM b EXCEPT SELECT id FROM c MINUS SELECT id FROM d;
```

**输出:**
```sql
SELECT id FROM a
INTERSECT 
SELECT id FROM b
EXCEPT 
SELECT id FROM c
MINUS 
SELECT id FROM d;
```

</details>

### H01 — LATERAL VIEW EXPLODE 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT id, tag FROM t LATERAL VIEW EXPLODE(tags) tag_table AS tag WHERE tag != '';
```

**输出:**
```sql
SELECT
    id
  , tag
FROM t LATERAL VIEW EXPLODE(tags) tag_table AS tag WHERE tag != '';
```

</details>

### H02 — STACK / INLINE / POSEXPLODE 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT id, x FROM t LATERAL VIEW EXPLODE(STACK(2, 'a', 1, 'b', 2)) s AS x;
```

**输出:**
```sql
SELECT
    id
  , x
FROM t LATERAL VIEW EXPLODE(STACK(2, 'a', 1, 'b', 2)) s AS x;
```

</details>

### H03 — MAPJOIN 提示 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT /*+ MAPJOIN(b) */ a.id, b.name FROM a JOIN b ON a.id = b.id;
```

**输出:**
```sql
SELECT
/*+ MAPJOIN(b) */
    a.id
  , b.name
FROM a
    JOIN b
      ON a.id = b.id;
```

</details>

### H04 — CLUSTERED / SORTED / BUCKETS 

<details>
<summary>查看</summary>

**输入:**
```sql
CREATE TABLE t (id INT, name STRING) CLUSTERED BY (id) SORTED BY (name) INTO 16 BUCKETS STORED AS PARQUET;
```

**输出:**
```sql
CREATE TABLE t (
    id INT
  , name STRING
)
CLUSTERED BY (id)
SORTED BY (name)
INTO 16 BUCKETS
STORED AS PARQUET;
```

</details>

### N01 — 行注释 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT cust_id -- 客户编号
, cust_name -- 客户名称
FROM customer;
```

**输出:**
```sql
SELECT
    cust_id   -- 客户编号
  , cust_name -- 客户名称
FROM customer;
```

</details>

### N02 — 块注释 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT /* 主查询 */ a, /* 字段 b */ b FROM /* 表 */ t;
```

**输出:**
```sql
SELECT
/* 主查询 */
    a
/* 字段 b */
    b
FROM /* 表 */ t;
```

</details>

### N03 — 字段后行注释 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT cust_id, -- 客户
 cust_name, -- 姓名
 risk_level FROM customer;
```

**输出:**
```sql
SELECT
    cust_id   -- 客户
  , cust_name -- 姓名
  , risk_level
FROM customer;
```

</details>

### N04 — 字符串转义引号 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT 'it''s ok' AS msg, '包含,逗号' AS s2, '包含''''引号' AS s3 FROM t;
```

**输出:**
```sql
SELECT
    'it''s ok' AS msg
  , '包含,逗号'    AS s2
  , '包含''''引号' AS s3
FROM t;
```

</details>

### N05 — 字符串含关键字 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT CASE WHEN status = 'CASE' THEN 'WHEN' ELSE 'END' END AS x, 'SELECT FROM WHERE' AS y FROM t;
```

**输出:**
```sql
SELECT
    CASE WHEN status = 'CASE' THEN 'WHEN' ELSE 'END' END              AS x
  , 'SELECT FROM WHERE' AS y
FROM t;
```

</details>

### N06 — ${VAR} 变量 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM ${V_DB}.customer WHERE status = '${STATUS}' AND region = '${REGION}';
```

**输出:**
```sql
SELECT * FROM ${V_DB}.customer
WHERE status = '${STATUS}'
    AND region = '${REGION}';
```

</details>

### N07 — 字符串含分号 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT 'a;b;c' AS s FROM t WHERE x = ';';
```

**输出:**
```sql
SELECT 'a;b;c' AS s FROM t WHERE x = ';';
```

</details>

### M01 — 多条语句分号分隔 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT * FROM a WHERE x = 1; UPDATE b SET y = 2 WHERE id = 1; DELETE FROM c WHERE z = 3;
```

**输出:**
```sql
SELECT * FROM a WHERE x = 1;

UPDATE b
SET y = 2
WHERE id = 1;

DELETE FROM c WHERE z = 3
```

</details>

### M02 — BEGIN...END 块 

<details>
<summary>查看</summary>

**输入:**
```sql
BEGIN DECLARE v_cnt INT; SELECT COUNT(*) INTO v_cnt FROM orders; IF v_cnt > 0 THEN UPDATE orders SET status = 'P'; END IF; END;
```

**输出:**
```sql
BEGIN DECLARE v_cnt INT;

SELECT COUNT(*) INTO v_cnt FROM orders;

IF v_cnt > 0 THEN UPDATE orders
SET status = 'P';

END IF;

END
```

</details>

### E01 — 空/纯注释输入 

<details>
<summary>查看</summary>

**输入:**
```sql
-- 只有注释
/* 块注释 */

```

**输出:**
```sql
-- 只有注释
/* 块注释 */
```

</details>

### E02 — 深层嵌套括号函数 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT func(a, func2(b, func3(c, d)), e) AS r FROM t;
```

**输出:**
```sql
SELECT func(a, func2(b, func3(c, d)), e) AS r FROM t;
```

</details>

### E03 — 无引号标识符边界 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT a, a_end, end_flag, t.case, t.when FROM t;
```

**输出:**
```sql
SELECT
    a
  , a_end
  , end_flag
  , t.CASE
  , t.WHEN
FROM t;
```

</details>

### E04 — 多语句块注释内嵌行注释+字符串 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT 1; SELECT 2 /* a
 -- inner line 'x'
 -- more 'y'
 */ FROM t;
```

**输出:**
```sql
SELECT 1;

SELECT 2 /* a
 -- inner line 'x'
 -- more 'y'
 */
FROM t
```

</details>

### E05 — 多行表达式含行尾注释（不拆散） 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT SUM(CASE WHEN x = 'C' AND nvl(a,'') = '' THEN b ELSE 0 END
 ) / 100 AS ACCU --累计
FROM t;
```

**输出:**
```sql
SELECT SUM(CASE
               WHEN x = 'C'
               AND nvl(a,'') = ''
               THEN b
               ELSE 0
           END
 ) / 100 AS ACCU --累计
FROM t;
```

</details>

### E06 — AS 在表达式内（CAST AS STRING） 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT CAST(DATE(x, 'YYYY-MM-DD') AS STRING) AS a, y AS bb FROM t;
```

**输出:**
```sql
SELECT
    CAST(DATE(x, 'YYYY-MM-DD') AS STRING) AS a
  , y                                     AS bb
FROM t;
```

</details>

### E07 — 含子查询字段 AS（不参与对齐） 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT nvl((SELECT max(v) FROM t2 WHERE t2.id = t.id), 0) AS a, b AS bb FROM t;
```

**输出:**
```sql
SELECT
    nvl((
            SELECT max(v) FROM t2 WHERE t2.id = t.id
        ), 0) AS a
  , b AS bb
FROM t;
```

</details>

### E08 — 行注释含字符串/变量 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT 1; SELECT a -- 注释 'xyz' ${V_OG}
FROM t;
```

**输出:**
```sql
SELECT 1;

SELECT a -- 注释 'xyz' ${V_OG}
FROM t
```

</details>

### E09 — 嵌套 nvl 长子查询字段缩进 

<details>
<summary>查看</summary>

**输入:**
```sql
SELECT id, nvl((SELECT cfg.item_value FROM mod.SS_CONFIG cfg WHERE cfg.p_og='${V_OG}' AND cfg.item_id='ISNT_NAME' AND a.p_og=cfg.p_og LIMIT 1), 'XXXXXXXXXXXX') AS ISSUE_NAME FROM ods.c_PDPDTPDT_sp a;
```

**输出:**
```sql
SELECT
    id
  , nvl((
            SELECT cfg.item_value FROM mod.SS_CONFIG cfg
            WHERE cfg.p_og='${V_OG}'
                AND cfg.item_id='ISNT_NAME'
                AND a.p_og=cfg.p_og
            LIMIT 1
        ), 'XXXXXXXXXXXX') AS ISSUE_NAME
FROM ods.c_PDPDTPDT_sp a;
```

</details>
