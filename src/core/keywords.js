/**
 * keywords.js — SQL 关键字统一集合（唯一事实来源）
 *
 * 之前 keyword 集合在 formatter / semantic-tokens / alias-parser / table-scanner
 * 中各自维护一份且内容漂移。现统一收口到本模块，新增关键字只改这一处。
 *
 * 用途：
 *   - formatter.uppercase(): 需要大写的关键字
 *   - 各解析器: 过滤掉关键字，避免把关键字误判为表名/别名
 */
'use strict';

const KEYWORDS = new Set([
    // ---- 通用 SQL ----
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
    'BETWEEN', 'LIKE', 'RLIKE', 'REGEXP', 'IS', 'NULL', 'TRUE', 'FALSE',
    'AS', 'ON', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS',
    'NATURAL', 'OUTER', 'SEMI', 'ANTI', 'USING',
    'UNION', 'ALL', 'ANY', 'SOME', 'INTERSECT', 'EXCEPT', 'MINUS',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
    'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'REPLACE', 'MERGE',
    'GRANT', 'REVOKE', 'ORDER', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
    'FETCH', 'FOR', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST', 'BY',
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'DISTINCT',
    'WITH', 'RECURSIVE', 'WINDOW', 'OVER', 'PARTITION',
    'ROWS', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW',
    'LATERAL', 'VIEW', 'TABLE', 'SCHEMA', 'DATABASE',
    'TEMP', 'TEMPORARY', 'IF', 'EXISTS', 'BEGIN', 'CALL', 'COMMIT',
    'ROLLBACK', 'SAVEPOINT', 'COMMENT', 'RENAME', 'TO',
    'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'INDEX', 'CONSTRAINT',
    'CHECK', 'UNIQUE', 'ADD', 'COLUMN', 'DEFAULT', 'CASCADE', 'RESTRICT',

    // ---- TDH / Hive 方言 ----
    'EXPLODE', 'POSEXPLODE', 'INLINE', 'STACK', 'PARTITIONED', 'CLUSTERED',
    'DISTRIBUTE', 'SORT', 'BUCKET', 'BUCKETS', 'STORED', 'FORMAT', 'SERDE',
    'TBLPROPERTIES', 'LOCATION', 'OVERWRITE', 'PURGE', 'REFRESH', 'COMPACT',
    'TRANSACTIONAL', 'MSCK', 'REPAIR', 'INVALIDATE', 'METADATA', 'COMPUTE',
    'STATISTICS', 'BROADCAST', 'MAPJOIN', 'STREAMTABLE',
]);

module.exports = KEYWORDS;
