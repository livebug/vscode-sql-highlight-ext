/**
 * completion-data.js — SQL 代码补全静态数据
 *
 * 提供: 关键字、函数名、数据类型、Snippet 模板
 * 不依赖 AST，全部基于静态列表 + 正则上下文检测
 */
'use strict';

const vscode = require('vscode');

// ==================== SQL 关键字（按类别） ====================
const SQL_KEYWORD_GROUPS = {
    statement: [
        { label: 'SELECT', detail: '查询数据', doc: '从表中检索数据' },
        { label: 'WITH', detail: 'CTE 公共表表达式', doc: '定义临时的命名结果集，在主查询中引用' },
        { label: 'INSERT INTO', detail: '插入数据', doc: '向表中插入新行' },
        { label: 'UPDATE', detail: '更新数据', doc: '修改表中的现有行' },
        { label: 'DELETE', detail: '删除数据', doc: '从表中删除行' },
        { label: 'CREATE TABLE', detail: '创建表', doc: '创建新的数据库表' },
        { label: 'CREATE TEMPORARY TABLE', detail: '创建临时表', doc: '创建会话级/Tx级临时表' },
        { label: 'CREATE VIEW', detail: '创建视图', doc: '创建虚拟表（查询定义）' },
        { label: 'DROP TABLE', detail: '删除表', doc: '删除表及其数据' },
        { label: 'DROP VIEW', detail: '删除视图', doc: '删除视图定义' },
        { label: 'TRUNCATE', detail: '清空表数据', doc: '快速删除表中所有行' },
        { label: 'ALTER TABLE', detail: '修改表结构', doc: '添加/修改/删除列或约束' },
        { label: 'EXPLAIN', detail: '查询执行计划', doc: '显示 SQL 语句的执行计划' },
        { label: 'DESCRIBE', detail: '查看表结构', doc: '显示表的列信息' },
        { label: 'REPLACE', detail: '替换/插入', doc: 'REPLACE INTO 或 MERGE 替代语法' },
        { label: 'MERGE', detail: '合并操作', doc: '根据条件执行 INSERT/UPDATE/DELETE' },
    ],
    clauses: [
        { label: 'FROM', detail: '指定数据源', doc: '指定要查询的主表或子查询' },
        { label: 'WHERE', detail: '行过滤条件', doc: '在聚合前过滤行' },
        { label: 'GROUP BY', detail: '分组聚合', doc: '按指定列分组' },
        { label: 'HAVING', detail: '分组后过滤', doc: '在聚合后过滤分组' },
        { label: 'ORDER BY', detail: '排序', doc: '对结果集排序' },
        { label: 'LIMIT', detail: '限制行数', doc: '限制返回的最大行数' },
        { label: 'OFFSET', detail: '偏移量', doc: '跳过前 N 行' },
    ],
    joins: [
        { label: 'JOIN', detail: 'INNER JOIN 简写', doc: '等价于 INNER JOIN' },
        { label: 'INNER JOIN', detail: '内连接', doc: '返回两个表中匹配的行' },
        { label: 'LEFT JOIN', detail: '左外连接', doc: '返回左表所有行 + 右表匹配行' },
        { label: 'RIGHT JOIN', detail: '右外连接', doc: '返回右表所有行 + 左表匹配行' },
        { label: 'FULL JOIN', detail: '全外连接', doc: '返回两表所有行' },
        { label: 'CROSS JOIN', detail: '交叉连接', doc: '返回笛卡尔积' },
        { label: 'NATURAL JOIN', detail: '自然连接', doc: '自动按同名列等值连接' },
        { label: 'LEFT SEMI JOIN', detail: '左半连接 (Hive/TDH)', doc: '只返回左表中有匹配的行' },
        { label: 'LEFT ANTI JOIN', detail: '左反连接 (Hive/TDH)', doc: '只返回左表中没有匹配的行' },
        { label: 'ON', detail: '连接条件', doc: '指定 JOIN 的匹配条件' },
    ],
    operators: [
        { label: 'AND', detail: '逻辑与', doc: '两个条件都满足' },
        { label: 'OR', detail: '逻辑或', doc: '任一条件满足' },
        { label: 'NOT', detail: '逻辑非', doc: '条件取反' },
        { label: 'IN', detail: '集合成员判断', doc: '值是否在集合中' },
        { label: 'EXISTS', detail: '存在性子查询', doc: '子查询是否有结果' },
        { label: 'BETWEEN', detail: '范围判断', doc: '值是否在闭区间内' },
        { label: 'LIKE', detail: '通配符模式匹配', doc: '% 匹配任意字符, _ 匹配单个字符' },
        { label: 'RLIKE', detail: '正则匹配 (Hive/TDH)', doc: 'Java 正则表达式匹配' },
        { label: 'REGEXP', detail: '正则匹配', doc: '正则表达式匹配' },
        { label: 'IS NULL', detail: '空值判断', doc: '是否为 NULL' },
        { label: 'IS NOT NULL', detail: '非空判断', doc: '是否不为 NULL' },
    ],
    modifiers: [
        { label: 'DISTINCT', detail: '去重', doc: '返回唯一行' },
        { label: 'ALL', detail: '全部（默认）', doc: '返回所有行（含重复）' },
        { label: 'AS', detail: '别名', doc: '为表或列指定别名' },
        { label: 'ASC', detail: '升序排序', doc: '从小到大' },
        { label: 'DESC', detail: '降序排序', doc: '从大到小' },
        { label: 'NULLS FIRST', detail: 'NULL 排最前', doc: 'ORDER BY 时 NULL 放在最前面' },
        { label: 'NULLS LAST', detail: 'NULL 排最后', doc: 'ORDER BY 时 NULL 放在最后面' },
    ],
    controlFlow: [
        { label: 'CASE', detail: '条件表达式', doc: 'CASE WHEN ... THEN ... ELSE ... END' },
        { label: 'WHEN', detail: 'CASE 分支条件', doc: 'WHEN condition THEN result' },
        { label: 'THEN', detail: 'CASE 分支结果', doc: '条件满足时返回的值' },
        { label: 'ELSE', detail: 'CASE 默认分支', doc: '所有条件不满足时的默认值' },
        { label: 'END', detail: 'CASE/BEGIN 结束', doc: '结束 CASE 或 BEGIN 块' },
        { label: 'BEGIN', detail: '块开始', doc: '开始一个 PL/SQL 代码块' },
        { label: 'COALESCE', detail: '取第一个非空值', doc: 'COALESCE(a, b, c) 返回第一个非 NULL' },
        { label: 'NULLIF', detail: '相等返回 NULL', doc: '两值相等返回 NULL，否则返回第一个' },
        { label: 'IFNULL', detail: '空值替换', doc: 'IFNULL(expr, default)' },
        { label: 'NVL', detail: '空值替换 (Oracle)', doc: 'NVL(expr, default)' },
    ],
    setOps: [
        { label: 'UNION', detail: '合并（去重）', doc: '合并两个查询结果并去重' },
        { label: 'UNION ALL', detail: '合并（不去重）', doc: '合并两个查询结果不去重' },
        { label: 'INTERSECT', detail: '交集', doc: '取两个查询结果交集' },
        { label: 'EXCEPT', detail: '差集', doc: '第一个查询有但第二个没有的行' },
        { label: 'MINUS', detail: '差集 (Oracle)', doc: '同 EXCEPT' },
    ],
    agg: [
        { label: 'COUNT', detail: '计数', doc: 'COUNT(*), COUNT(col), COUNT(DISTINCT col)' },
        { label: 'SUM', detail: '求和', doc: 'SUM(column)' },
        { label: 'AVG', detail: '平均值', doc: 'AVG(column)' },
        { label: 'MIN', detail: '最小值', doc: 'MIN(column)' },
        { label: 'MAX', detail: '最大值', doc: 'MAX(column)' },
    ],
};

// ==================== SQL 函数（按类别） ====================
const SQL_FUNCTIONS = [
    // ---- 聚合函数 ----
    { label: 'COUNT', detail: '行计数', category: '聚合' },
    { label: 'SUM', detail: '求和', category: '聚合' },
    { label: 'AVG', detail: '平均值', category: '聚合' },
    { label: 'MIN', detail: '最小值', category: '聚合' },
    { label: 'MAX', detail: '最大值', category: '聚合' },
    { label: 'STDDEV', detail: '标准差', category: '聚合' },
    { label: 'STDDEV_POP', detail: '总体标准差', category: '聚合' },
    { label: 'STDDEV_SAMP', detail: '样本标准差', category: '聚合' },
    { label: 'VARIANCE', detail: '方差', category: '聚合' },
    { label: 'VAR_POP', detail: '总体方差', category: '聚合' },
    { label: 'VAR_SAMP', detail: '样本方差', category: '聚合' },
    { label: 'COLLECT_LIST', detail: '收集为数组 (TDH)', category: '聚合' },
    { label: 'COLLECT_SET', detail: '收集为去重数组 (TDH)', category: '聚合' },
    { label: 'ARRAY_AGG', detail: '聚合为数组 (GaussDB)', category: '聚合' },
    { label: 'STRING_AGG', detail: '聚合为字符串 (GaussDB)', category: '聚合' },
    { label: 'GROUP_CONCAT', detail: '分组连接字符串', category: '聚合' },
    { label: 'GROUPING', detail: '分组标识', category: '聚合' },

    // ---- 字符串函数 ----
    { label: 'CONCAT', detail: '字符串拼接', category: '字符串' },
    { label: 'CONCAT_WS', detail: '带分隔符拼接', category: '字符串' },
    { label: 'SUBSTR', detail: '子字符串', category: '字符串' },
    { label: 'SUBSTRING', detail: '子字符串', category: '字符串' },
    { label: 'LENGTH', detail: '字符串长度', category: '字符串' },
    { label: 'UPPER', detail: '转大写', category: '字符串' },
    { label: 'LOWER', detail: '转小写', category: '字符串' },
    { label: 'TRIM', detail: '去除首尾空格', category: '字符串' },
    { label: 'LTRIM', detail: '去除左侧空格', category: '字符串' },
    { label: 'RTRIM', detail: '去除右侧空格', category: '字符串' },
    { label: 'LPAD', detail: '左侧填充', category: '字符串' },
    { label: 'RPAD', detail: '右侧填充', category: '字符串' },
    { label: 'REPLACE', detail: '替换子字符串', category: '字符串' },
    { label: 'REVERSE', detail: '反转字符串', category: '字符串' },
    { label: 'REPEAT', detail: '重复字符串', category: '字符串' },
    { label: 'SPACE', detail: '空格字符串', category: '字符串' },
    { label: 'SPLIT', detail: '分割字符串 (TDH)', category: '字符串' },
    { label: 'INSTR', detail: '子串位置', category: '字符串' },
    { label: 'LOCATE', detail: '子串位置', category: '字符串' },
    { label: 'POSITION', detail: '子串位置', category: '字符串' },
    { label: 'INITCAP', detail: '首字母大写', category: '字符串' },
    { label: 'REGEXP_EXTRACT', detail: '正则提取 (TDH)', category: '字符串' },
    { label: 'REGEXP_REPLACE', detail: '正则替换 (TDH)', category: '字符串' },
    { label: 'REGEXP_MATCHES', detail: '正则匹配 (GaussDB)', category: '字符串' },
    { label: 'GET_JSON_OBJECT', detail: 'JSON 字段提取 (TDH)', category: '字符串' },
    { label: 'FORMAT_NUMBER', detail: '数字格式化 (TDH)', category: '字符串' },
    { label: 'ASCII', detail: '首字符 ASCII 码', category: '字符串' },
    { label: 'CHR', detail: 'ASCII 码转字符', category: '字符串' },
    { label: 'BASE64', detail: 'Base64 编码', category: '字符串' },
    { label: 'TRANSLATE', detail: '字符映射替换', category: '字符串' },
    { label: 'SOUNDEX', detail: '语音编码', category: '字符串' },
    { label: 'LEVENSHTEIN', detail: '编辑距离', category: '字符串' },
    { label: 'MD5', detail: 'MD5 哈希', category: '字符串' },

    // ---- 数学函数 ----
    { label: 'ABS', detail: '绝对值', category: '数学' },
    { label: 'CEIL', detail: '向上取整', category: '数学' },
    { label: 'CEILING', detail: '向上取整', category: '数学' },
    { label: 'FLOOR', detail: '向下取整', category: '数学' },
    { label: 'ROUND', detail: '四舍五入', category: '数学' },
    { label: 'TRUNC', detail: '截断', category: '数学' },
    { label: 'MOD', detail: '取模', category: '数学' },
    { label: 'POWER', detail: '幂运算', category: '数学' },
    { label: 'POW', detail: '幂运算', category: '数学' },
    { label: 'SQRT', detail: '平方根', category: '数学' },
    { label: 'EXP', detail: 'e 的幂', category: '数学' },
    { label: 'LN', detail: '自然对数', category: '数学' },
    { label: 'LOG', detail: '对数', category: '数学' },
    { label: 'LOG10', detail: '以 10 为底对数', category: '数学' },
    { label: 'LOG2', detail: '以 2 为底对数', category: '数学' },
    { label: 'SIGN', detail: '符号函数', category: '数学' },
    { label: 'SIN', detail: '正弦', category: '数学' },
    { label: 'COS', detail: '余弦', category: '数学' },
    { label: 'TAN', detail: '正切', category: '数学' },
    { label: 'ASIN', detail: '反正弦', category: '数学' },
    { label: 'ACOS', detail: '反余弦', category: '数学' },
    { label: 'ATAN', detail: '反正切', category: '数学' },
    { label: 'DEGREES', detail: '弧度转角度', category: '数学' },
    { label: 'RADIANS', detail: '角度转弧度', category: '数学' },
    { label: 'PI', detail: '圆周率', category: '数学' },
    { label: 'RAND', detail: '随机数', category: '数学' },
    { label: 'RANDOM', detail: '随机数 (GaussDB)', category: '数学' },
    { label: 'GREATEST', detail: '取最大值', category: '数学' },
    { label: 'LEAST', detail: '取最小值', category: '数学' },
    { label: 'HEX', detail: '转十六进制', category: '数学' },
    { label: 'BIN', detail: '转二进制', category: '数学' },
    { label: 'CONV', detail: '进制转换', category: '数学' },

    // ---- 日期函数 ----
    { label: 'NOW', detail: '当前日期时间', category: '日期' },
    { label: 'CURRENT_DATE', detail: '当前日期', category: '日期' },
    { label: 'CURRENT_TIMESTAMP', detail: '当前时间戳', category: '日期' },
    { label: 'YEAR', detail: '提取年份', category: '日期' },
    { label: 'MONTH', detail: '提取月份', category: '日期' },
    { label: 'DAY', detail: '提取日', category: '日期' },
    { label: 'HOUR', detail: '提取小时', category: '日期' },
    { label: 'MINUTE', detail: '提取分钟', category: '日期' },
    { label: 'SECOND', detail: '提取秒', category: '日期' },
    { label: 'QUARTER', detail: '提取季度', category: '日期' },
    { label: 'WEEKOFYEAR', detail: '年中第几周', category: '日期' },
    { label: 'DAYOFMONTH', detail: '月中第几天', category: '日期' },
    { label: 'DATEDIFF', detail: '日期差', category: '日期' },
    { label: 'DATE_ADD', detail: '日期加法', category: '日期' },
    { label: 'DATE_SUB', detail: '日期减法', category: '日期' },
    { label: 'ADD_MONTHS', detail: '加月份', category: '日期' },
    { label: 'LAST_DAY', detail: '月末日期', category: '日期' },
    { label: 'NEXT_DAY', detail: '下一个指定星期', category: '日期' },
    { label: 'MONTHS_BETWEEN', detail: '月数差', category: '日期' },
    { label: 'FROM_UNIXTIME', detail: 'Unix 时间戳转日期', category: '日期' },
    { label: 'UNIX_TIMESTAMP', detail: '日期转 Unix 时间戳', category: '日期' },
    { label: 'TO_DATE', detail: '字符串转日期', category: '日期' },
    { label: 'EXTRACT', detail: '提取日期部分', category: '日期' },

    // ---- 类型转换 ----
    { label: 'CAST', detail: '类型转换', category: '转换' },
    { label: 'CONVERT', detail: '类型转换', category: '转换' },
    { label: 'BINARY', detail: '转二进制', category: '转换' },
    { label: 'DECODE', detail: '解码/条件映射', category: '转换' },
    { label: 'ENCODE', detail: '编码', category: '转换' },

    // ---- 窗口函数 ----
    { label: 'ROW_NUMBER', detail: '行号', category: '窗口' },
    { label: 'RANK', detail: '排名（有间隙）', category: '窗口' },
    { label: 'DENSE_RANK', detail: '排名（无间隙）', category: '窗口' },
    { label: 'NTILE', detail: '分桶', category: '窗口' },
    { label: 'LAG', detail: '前一行值', category: '窗口' },
    { label: 'LEAD', detail: '后一行值', category: '窗口' },
    { label: 'FIRST_VALUE', detail: '窗口第一个值', category: '窗口' },
    { label: 'LAST_VALUE', detail: '窗口最后一个值', category: '窗口' },
    { label: 'NTH_VALUE', detail: '窗口第 N 个值', category: '窗口' },
    { label: 'CUME_DIST', detail: '累积分布', category: '窗口' },
    { label: 'PERCENT_RANK', detail: '百分比排名', category: '窗口' },

    // ---- 条件函数 ----
    { label: 'IF', detail: '条件表达式 (Hive/TDH)', category: '条件' },
    { label: 'ISNULL', detail: '是否为空', category: '条件' },
    { label: 'ISNOTNULL', detail: '是否非空', category: '条件' },
    { label: 'ASSERT_TRUE', detail: '断言为真 (TDH)', category: '条件' },

    // ---- 数组/集合 ----
    { label: 'ARRAY', detail: '构造数组', category: '数组' },
    { label: 'ARRAY_CONTAINS', detail: '数组包含判断', category: '数组' },
    { label: 'SORT_ARRAY', detail: '数组排序', category: '数组' },
    { label: 'EXPLODE', detail: '数组展开为行 (TDH)', category: '数组' },
    { label: 'POSEXPLODE', detail: '带位置数组展开 (TDH)', category: '数组' },
    { label: 'INLINE', detail: '结构体展开 (TDH)', category: '数组' },
    { label: 'UNNEST', detail: '数组展开 (GaussDB)', category: '数组' },
    { label: 'GENERATE_SERIES', detail: '生成序列 (GaussDB)', category: '数组' },

    // ---- JSON ----
    { label: 'JSON_TUPLE', detail: 'JSON 元组提取 (TDH)', category: 'JSON' },
    { label: 'PARSE_URL_TUPLE', detail: 'URL 解析 (TDH)', category: 'JSON' },
    { label: 'JSON_AGG', detail: 'JSON 聚合 (GaussDB)', category: 'JSON' },
    { label: 'JSON_BUILD_OBJECT', detail: '构建 JSON 对象 (GaussDB)', category: 'JSON' },
    { label: 'JSON_BUILD_ARRAY', detail: '构建 JSON 数组 (GaussDB)', category: 'JSON' },

    // ---- GaussDB 专用 ----
    { label: 'PG_SLEEP', detail: '暂停 (GaussDB)', category: '系统' },
    { label: 'GEN_RANDOM_UUID', detail: '随机 UUID (GaussDB)', category: '系统' },
    { label: 'PG_SIZE_PRETTY', detail: '大小格式化 (GaussDB)', category: '系统' },
];

// ==================== SQL 数据类型 ====================
const SQL_DATA_TYPES = [
    // 通用数值
    { label: 'INT', detail: '32位整数' },
    { label: 'INTEGER', detail: '32位整数' },
    { label: 'BIGINT', detail: '64位整数' },
    { label: 'SMALLINT', detail: '16位整数' },
    { label: 'TINYINT', detail: '8位整数' },
    { label: 'FLOAT', detail: '单精度浮点' },
    { label: 'DOUBLE', detail: '双精度浮点' },
    { label: 'DECIMAL', detail: '精确数值' },
    { label: 'NUMERIC', detail: '精确数值' },
    { label: 'REAL', detail: '单精度浮点' },
    { label: 'MONEY', detail: '货币类型' },
    // 字符串
    { label: 'VARCHAR', detail: '可变长字符串' },
    { label: 'CHAR', detail: '定长字符串' },
    { label: 'TEXT', detail: '长文本' },
    { label: 'STRING', detail: '字符串 (TDH)' },
    { label: 'CLOB', detail: '大字符对象' },
    // 日期时间
    { label: 'DATE', detail: '日期' },
    { label: 'TIME', detail: '时间' },
    { label: 'TIMESTAMP', detail: '日期时间戳' },
    { label: 'INTERVAL', detail: '时间间隔' },
    // 布尔/二进制
    { label: 'BOOLEAN', detail: '布尔值' },
    { label: 'BOOL', detail: '布尔值' },
    { label: 'BINARY', detail: '二进制' },
    { label: 'BLOB', detail: '大二进制对象' },
    { label: 'BYTEA', detail: '字节数组 (GaussDB)' },
    // JSON/XML
    { label: 'JSON', detail: 'JSON 数据类型' },
    { label: 'JSONB', detail: '二进制 JSON (GaussDB)' },
    { label: 'XML', detail: 'XML 数据类型' },
    { label: 'XMLTYPE', detail: 'XML 类型 (GaussDB)' },
    // 复合类型
    { label: 'ARRAY', detail: '数组类型' },
    { label: 'MAP', detail: '键值对映射 (TDH)' },
    { label: 'STRUCT', detail: '结构体 (TDH)' },
    // GaussDB 扩展
    { label: 'SERIAL', detail: '自增整数 (GaussDB)' },
    { label: 'BIGSERIAL', detail: '自增64位整数 (GaussDB)' },
    { label: 'UUID', detail: 'UUID (GaussDB)' },
    { label: 'INET', detail: 'IP 地址 (GaussDB)' },
    { label: 'CIDR', detail: 'CIDR 网段 (GaussDB)' },
    { label: 'MACADDR', detail: 'MAC 地址 (GaussDB)' },
];

// ==================== Snippet 模板 ====================
const SQL_SNIPPETS = [
    {
        label: 'sel', detail: 'SELECT 查询模板',
        insertText: 'SELECT ${1:*} FROM ${2:table_name} WHERE ${3:condition}',
        doc: '基本 SELECT 查询',
    },
    {
        label: 'self', detail: 'SELECT ... FROM 模板',
        insertText: 'SELECT ${1:column1},\n       ${2:column2}\nFROM ${3:table_name}\nWHERE ${4:condition}',
        doc: '多列 SELECT 查询',
    },
    {
        label: 'selj', detail: 'SELECT + JOIN 模板',
        insertText: 'SELECT ${1:a}.*,\n       ${2:b}.${3:col}\nFROM ${4:table_a} ${1:a}\nLEFT JOIN ${5:table_b} ${2:b}\n    ON ${1:a}.${6:id} = ${2:b}.${6:id}\nWHERE ${7:condition}',
        doc: '带 JOIN 的 SELECT',
    },
    {
        label: 'ins', detail: 'INSERT 模板',
        insertText: 'INSERT INTO ${1:table_name} (${2:col1}, ${3:col2})\nVALUES (${4:val1}, ${5:val2})',
        doc: '插入单行数据',
    },
    {
        label: 'insm', detail: 'INSERT 多行模板',
        insertText: 'INSERT INTO ${1:table_name} (${2:col1}, ${3:col2})\nVALUES\n    (${4:val1}, ${5:val2}),\n    (${6:val3}, ${7:val4})',
        doc: '插入多行数据',
    },
    {
        label: 'upd', detail: 'UPDATE 模板',
        insertText: 'UPDATE ${1:table_name}\nSET ${2:col1} = ${3:val1},\n    ${4:col2} = ${5:val2}\nWHERE ${6:condition}',
        doc: '更新数据',
    },
    {
        label: 'del', detail: 'DELETE 模板',
        insertText: 'DELETE FROM ${1:table_name}\nWHERE ${2:condition}',
        doc: '删除数据',
    },
    {
        label: 'ctbl', detail: 'CREATE TABLE 模板',
        insertText: 'CREATE TABLE ${1:table_name} (\n    ${2:col1} ${3:VARCHAR(255)} NOT NULL,\n    ${4:col2} ${5:INT}\n)',
        doc: '创建新表',
    },
    {
        label: 'ctmp', detail: 'CREATE TEMP TABLE 模板',
        insertText: 'CREATE TEMPORARY TABLE ${1:table_name} (\n    ${2:col1} ${3:VARCHAR(255)},\n    ${4:col2} ${5:INT}\n)',
        doc: '创建临时表',
    },
    {
        label: 'ctbls', detail: 'CREATE TABLE AS SELECT 模板',
        insertText: 'CREATE TABLE ${1:table_name} AS\nSELECT ${2:*}\nFROM ${3:source_table}\nWHERE ${4:condition}',
        doc: '从查询创建表',
    },
    {
        label: 'cvw', detail: 'CREATE VIEW 模板',
        insertText: 'CREATE VIEW ${1:view_name} AS\nSELECT ${2:*}\nFROM ${3:table_name}\nWHERE ${4:condition}',
        doc: '创建视图',
    },
    {
        label: 'with', detail: 'WITH CTE 模板',
        insertText: 'WITH ${1:cte_name} AS (\n    SELECT ${2:*}\n    FROM ${3:table_name}\n    WHERE ${4:condition}\n)\nSELECT * FROM ${1:cte_name}',
        doc: 'CTE 公共表表达式',
    },
    {
        label: 'case', detail: 'CASE WHEN 模板',
        insertText: 'CASE\n    WHEN ${1:condition1} THEN ${2:result1}\n    WHEN ${3:condition2} THEN ${4:result2}\n    ELSE ${5:default_result}\nEND',
        doc: 'CASE WHEN 条件表达式',
    },
    {
        label: 'caseg', detail: 'CASE 等值模板',
        insertText: 'CASE ${1:column}\n    WHEN ${2:value1} THEN ${3:result1}\n    WHEN ${4:value2} THEN ${5:result2}\n    ELSE ${6:default_result}\nEND',
        doc: 'CASE 等值比较（简单 CASE）',
    },
    {
        label: 'group', detail: 'GROUP BY 聚合模板',
        insertText: 'SELECT ${1:dim_col},\n       COUNT(*) AS cnt,\n       SUM(${2:metric}) AS total\nFROM ${3:table_name}\nWHERE ${4:condition}\nGROUP BY ${1:dim_col}\nHAVING COUNT(*) > ${5:1}\nORDER BY cnt DESC\nLIMIT ${6:100}',
        doc: '分组聚合完整模板',
    },
    {
        label: 'sub', detail: '子查询模板',
        insertText: 'SELECT ${1:*}\nFROM (\n    SELECT ${2:*}\n    FROM ${3:table_name}\n    WHERE ${4:condition}\n) ${5:sub}',
        doc: '子查询',
    },
    {
        label: 'win', detail: '窗口函数模板',
        insertText: '${1:ROW_NUMBER}() OVER (\n    PARTITION BY ${2:partition_col}\n    ORDER BY ${3:order_col} ${4:DESC}\n) AS ${5:rn}',
        doc: '窗口函数 OVER()',
    },
    {
        label: 'exp', detail: 'EXPLAIN 模板',
        insertText: 'EXPLAIN\nSELECT ${1:*}\nFROM ${2:table_name}\nWHERE ${3:condition}',
        doc: '查看执行计划',
    },
    {
        label: 'dpt', detail: 'DROP TABLE 模板',
        insertText: 'DROP TABLE IF EXISTS ${1:table_name}',
        doc: '删除表',
    },
    {
        label: 'trunc', detail: 'TRUNCATE 模板',
        insertText: 'TRUNCATE TABLE ${1:table_name}',
        doc: '清空表数据',
    },
];

// ==================== 创建补全项的工厂函数 ====================

/**
 * 判断是否匹配当前输入的前缀（大小写不敏感）
 */
function matchPrefix(input, label) {
    if (!input) return true;
    const ci = input.toLowerCase();
    const cl = label.toLowerCase();
    // 支持部分匹配：前缀 或 包含
    return cl.startsWith(ci);
}

/**
 * 创建关键字补全项
 * @param {Object} ctx - 上下文对象 { isStatementStart, isExpressionContext, isTableContext, isColumnDefContext }
 * @param {string} prefix - 当前输入前缀
 */
function createKeywordItems(ctx, prefix) {
    const items = [];

    // 语句起始：语句关键字 + 排序靠前
    if (ctx.isStatementStart) {
        addGroup(items, SQL_KEYWORD_GROUPS.statement, '0', '关键字·语句', prefix);
        // 语句起始也补充 WITH 和 set ops
        addGroup(items, SQL_KEYWORD_GROUPS.setOps, '1', '关键字·集合运算', prefix);
    }

    // 表达式上下文：运算符 + 控制流 + 聚合 + 修饰符
    if (ctx.isExpressionContext) {
        addGroup(items, SQL_KEYWORD_GROUPS.operators, '0', '关键字·运算符', prefix);
        addGroup(items, SQL_KEYWORD_GROUPS.controlFlow, '0', '关键字·控制流', prefix);
        addGroup(items, SQL_KEYWORD_GROUPS.agg, '1', '关键字·聚合', prefix);
        addGroup(items, SQL_KEYWORD_GROUPS.modifiers, '1', '关键字·修饰', prefix);
    }

    // 表上下文：JOIN 类型 + 子句关键字
    if (ctx.isTableContext) {
        addGroup(items, SQL_KEYWORD_GROUPS.joins, '0', '关键字·连接', prefix);
        addGroup(items, SQL_KEYWORD_GROUPS.clauses, '1', '关键字·子句', prefix);
    }

    // 列定义上下文
    if (ctx.isColumnDefContext) {
        addGroup(items, SQL_KEYWORD_GROUPS.controlFlow.filter(k =>
            ['NOT NULL', 'DEFAULT', 'PRIMARY KEY', 'UNIQUE', 'CHECK'].includes(k.label.toUpperCase()) ||
            k.label === 'COMMENT'
        ), '1', '关键字·约束', prefix);
        // 额外补充约束关键字
        [
            { label: 'NOT NULL', detail: '非空约束', doc: '列不允许 NULL' },
            { label: 'DEFAULT', detail: '默认值', doc: '设置列的默认值' },
            { label: 'PRIMARY KEY', detail: '主键约束', doc: '唯一标识每一行' },
            { label: 'UNIQUE', detail: '唯一约束', doc: '列值必须唯一' },
            { label: 'CHECK', detail: '检查约束', doc: '值必须满足条件' },
            { label: 'REFERENCES', detail: '外键引用', doc: '引用另一张表的列' },
            { label: 'COMMENT', detail: '列注释', doc: '添加列注释' },
        ].forEach(k => {
            if (matchPrefix(prefix, k.label)) {
                const item = new vscode.CompletionItem(k.label, vscode.CompletionItemKind.Keyword);
                item.detail = k.detail;
                item.documentation = new vscode.MarkdownString(k.doc || '');
                item.sortText = '1' + k.label;
                items.push(item);
            }
        });
    }

    // 通用关键字（总是提供，排序靠后）
    const allGroups = ['statement', 'clauses', 'joins', 'operators', 'modifiers', 'controlFlow', 'setOps', 'agg'];
    for (const g of allGroups) {
        addGroup(items, SQL_KEYWORD_GROUPS[g], '2', '关键字·' + g, prefix);
    }

    return items;
}

function addGroup(items, group, sortPrefix, categoryLabel, prefix) {
    if (!group || group.length === 0) return;
    for (const k of group) {
        if (!matchPrefix(prefix, k.label)) continue;
        const item = new vscode.CompletionItem(k.label, vscode.CompletionItemKind.Keyword);
        item.detail = `${categoryLabel} · ${k.detail}`;
        item.documentation = new vscode.MarkdownString(k.doc || k.detail);
        item.sortText = sortPrefix + k.label;
        items.push(item);
    }
}

/**
 * 创建函数补全项
 */
function createFunctionItems(prefix) {
    const items = [];
    const seen = new Set();
    for (const f of SQL_FUNCTIONS) {
        if (!matchPrefix(prefix, f.label)) continue;
        if (seen.has(f.label)) continue;
        seen.add(f.label);

        const item = new vscode.CompletionItem(f.label, vscode.CompletionItemKind.Function);
        item.detail = `${f.category} · ${f.detail}`;
        item.documentation = new vscode.MarkdownString(`**${f.label}()**  \n${f.detail}  \n*类别: ${f.category}*`);
        item.sortText = '0' + f.label;
        // 函数补全后自动插入括号
        item.insertText = new vscode.SnippetString(f.label + '($1)');
        items.push(item);
    }
    return items;
}

/**
 * 创建数据类型补全项
 */
function createTypeItems(prefix) {
    const items = [];
    for (const t of SQL_DATA_TYPES) {
        if (!matchPrefix(prefix, t.label)) continue;
        const item = new vscode.CompletionItem(t.label, vscode.CompletionItemKind.TypeParameter);
        item.detail = '数据类型 · ' + t.detail;
        item.sortText = '0' + t.label;
        items.push(item);
    }
    return items;
}

/**
 * 创建 Snippet 补全项
 */
function createSnippetItems() {
    const items = [];
    for (const s of SQL_SNIPPETS) {
        const item = new vscode.CompletionItem(s.label, vscode.CompletionItemKind.Snippet);
        item.detail = '📋 ' + s.detail;
        item.documentation = new vscode.MarkdownString(
            `**${s.label}** — ${s.detail}\n\n\`\`\`sql\n${s.insertText}\n\`\`\`\n\n${s.doc || ''}`
        );
        item.insertText = new vscode.SnippetString(s.insertText);
        item.sortText = '0' + s.label;
        items.push(item);
    }
    return items;
}

/**
 * 从当前行/已输入文本中提取当前正在输入的部分单词
 */
function getCurrentWord(textBeforeCursor) {
    const m = textBeforeCursor.match(/([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)$/);
    return m ? m[1] : '';
}

module.exports = {
    createKeywordItems,
    createFunctionItems,
    createTypeItems,
    createSnippetItems,
    getCurrentWord,
    matchPrefix,
};
