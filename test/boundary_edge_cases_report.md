# SQL Formatter 语义对比测试报告

**测试文件**: `boundary_edge_cases.sql`  
**测试时间**: 2026-07-21  
**格式化版本**: `sql-dialect-highlight` v0.4.0 (formatter.js)

---

## 一、测试总览

| 维度 | 结果 |
|------|------|
| 原始行数 | 194 行 |
| 格式化后行数 | 168 行 |
| 原始语句数 | 16 条 |
| 格式化后语句数 | 1 条（多语句被合并） |
| 关键字计数 | ✅ 一致 (39 种, 计数完全匹配) |
| 变量引用 | ✅ 一致 (35 个) |
| 字符串字面量 | ❌ 不一致 (28 → 28，但内容被替换为 `', '`) |
| 反引号标识符 | ❌ 不一致 |
| 归一化语义指纹 | ❌ 不一致 |
| **总体结果** | **❌ FAIL** |

---

## 二、问题详情分级

### 🔴 P0 - 严重：语义破坏

#### P0-1: 字符串字面量丢失（`protect()` 函数缺陷）
- **现象**: 所有字符串被替换为 `', '`，原内容丢失
- **示例**: `'${V_PART_DT}'` → `', '`
- **根因**: `protect()` 的正则 `/'[^']*'/g` 与 `restore()` 中的 `/*...*/` 模式冲突，`${}` 变量在字符串内未正确处理
- **影响**: 所有 WHERE 条件中的日期变量值全部丢失，SQL 完全不可用

#### P0-2: 多语句被合并为单行
- **现象**: 16 条语句合并为 1 条
- **示例**:
  ```
  DROP TABLE IF EXISTS ...; CREATE TABLE ... AS SELECT ... WHERE ...; DROP TABLE IF EXISTS ...;
  ```
- **根因**: `formatSQL()` 中 `replace(/\s*\n\s*/g, ' ')` 将分号后换行也抹除
- **影响**: 多个独立语句混在一行，SQL 无法正确执行

#### P0-3: 字符串中的单引号转义被破坏
- **现象**: `'single ''quote'' inside'` 被错误解析
- **根因**: `protect()` 的 `/'[^']*'/g` 无法处理 SQL 的 `''` 转义语法
- **影响**: 字符串截断，语义完全改变

### 🟡 P1 - 高：结构性错误

#### P1-1: `FULL OUTER JOIN` 被断开换行
- **现象**: `FULL OUTER JOIN` → `FULL OUTER\n    JOIN`
- **行号**: 54, 166
- **根因**: `MAIN_RE` 正则未包含 `FULL OUTER JOIN`，`formatSegment` 默认处理只匹配到 `OUTER` 后的空格
- **修复**: 在 `MAIN_RE` 中添加 `FULL\s+OUTER\s+JOIN`

#### P1-2: `BETWEEN ... AND ...` 被误拆
- **现象**: 
  ```
  AND age BETWEEN 20
      AND 40
  ```
- **行号**: 96-97, 103-104
- **根因**: `splitAndOr()` 无法区分 `BETWEEN ... AND` 中的 `AND` 与逻辑 `AND`
- **修复**: `splitAndOr()` 需检测 `BETWEEN` 上下文

#### P1-3: 分号后注释与下一语句未正确分隔
- **现象**: 11 处 `; -- ====` 注释后紧跟 SQL 代码
- **示例**: `...dt = '...'; -- ===\n=== ...\n\nSELECT ...` 注释头与代码混行
- **根因**: `replace(/\s*\n\s*/g, ' ')` 将注释行与代码行压缩到同一行
- **修复**: 在压缩空白前先按 `;` 分割语句，或保护分号后的注释块

### 🟠 P2 - 中：格式美观问题

#### P2-1: 行内注释嵌入字段列表导致缩进混乱
- **现象**: 
  ```
  , -- RANK / DENSE_RANK
   RANK() OVER (...)   ← 缩进异常
  ```
- **行号**: 71-83 共 4 处
- **根因**: `formatCommaList` 的 `splitComma` 无法处理逗号后跟注释的情况
- **修复**: 在分割时跳过注释占位符 `__C`

#### P2-2: 分号处未强制换行
- **现象**: `WHERE dt = '...'; DROP TABLE ...; -- ====`
- **根因**: `replace(/\s*\n\s*/g, ' ')` 过于激进
- **修复**: 替换时保留分号后的换行

#### P2-3: 关键字残留小写 (`with`)
- **行号**: 83
- **现象**: `ROW_NUMBER with PARTITION`
- **根因**: 原注释 `-- ROW_NUMBER with PARTITION` 中的 `with` 未被保护

### 🟢 P3 - 低：改进建议

#### P3-1: 反引号标识符识别
- 格式化前后反引号标识符不一致
- 建议在 `protect()` 中添加反引号保护

#### P3-2: CASE 表达式的 ELSE 换行
- `THEN 'normal' ELSE 'partial' END` 长 CASE 表达式未拆行
- 建议在 CASE 内部也进行分段格式化

---

## 三、整改方案

### 方案总览

| 序号 | 问题 | 修改文件 | 修复策略 |
|------|------|----------|----------|
| 1 | P0-1/P0-3 字符串保护 | `formatter.js` | `protect()` 改用上下文感知的字符串解析，支持 `''` 转义 |
| 2 | P0-2 多语句合并 | `formatter.js` | `formatSQL()` 先按 `;` 分割，逐条格式化再拼接 |
| 3 | P1-1 FULL OUTER JOIN | `formatter.js` | `MAIN_RE` 正则新增 `FULL\s+OUTER\s+JOIN` |
| 4 | P1-2 BETWEEN AND | `formatter.js` | `splitAndOr()` 检测 `BETWEEN` 上下文跳过其中的 `AND` |
| 5 | P1-3 分号/注释换行 | `formatter.js` | 空白压缩时保留分号后的换行 |
| 6 | P2-1 行内注释 | `formatter.js` | `splitComma()` 处理 `__C` 占位符 |
| 7 | P2-2 分号强制换行 | `formatter.js` | `postProcess()` 恢复分号换行 |

### 具体修改

#### 1. 修复 `protect()` 字符串解析 (P0-1/P0-3)
```js
function protect(sql) {
    storeV=[]; storeC=[]; storeS=[]; storeO=[]; ciV=0; ciC=0; ciS=0; ciO=0;
    let w = sql;
    w = w.replace(/\$\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, m => { storeV.push(m); return '__V'+(ciV++)+'__'; });
    // 行注释
    w = w.replace(/--[^\n]*\n?/g, m => { storeC.push(m); return '__C'+(ciC++)+'__'; });
    w = w.replace(/\/\*[\s\S]*?\*\//g, m => { storeC.push(m); return '__C'+(ciC++)+'__'; });
    // 字符串: 支持 '' 转义 (SQL 标准)
    w = w.replace(/'([^']|'')*'/g, m => { storeS.push(m); return '__S'+(ciS++)+'__'; });
    return w;
}
```

#### 2. 修复 `formatSQL()` 语句分割 (P0-2)
```js
function formatSQL(sql, options) {
    const opts = Object.assign({}, DEFAULTS, options||{});
    // 先按 ; 分割语句，防止多语句合并
    const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
    const formattedStmts = stmts.map(stmt => {
        let w = protect(stmt);
        w = w.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
        // 还原注释换行
        w = w.replace(/__C(\d+)__/g, (m, num) => { /* ... */ });
        w = uppercase(w);
        w = protectOver(w);
        w = formatTop(w, opts);
        w = restore(w);
        return w;
    });
    let result = formattedStmts.join(';\n\n');
    result = postProcess(result);
    return result;
}
```

#### 3. MAIN_RE 新增 FULL OUTER JOIN (P1-1)
```js
const MAIN_RE = /\b(SELECT|FROM|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|
    INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+OUTER\s+JOIN|FULL\s+JOIN|
    CROSS\s+JOIN|NATURAL\s+JOIN|JOIN|ON|UNION|UNION\s+ALL|INTERSECT|EXCEPT|
    MINUS|DELETE|INSERT|INTO|UPDATE|SET)\b/gi;
```

#### 4. `splitAndOr()` 跳过 BETWEEN 上下文 (P1-2)
```js
function splitAndOr(text) {
    const r=[]; let last=0;
    const re = /\b(AND|OR|BETWEEN)\b/gi;
    let m, inBetween = false;
    while ((m = re.exec(text)) !== null) {
        let d=0;
        for (let i=last; i<m.index; i++) { /* depth check */ }
        if (d !== 0) continue;
        const kw = m[1].toUpperCase();
        if (kw === 'BETWEEN') { inBetween = true; continue; }
        if (inBetween && kw === 'AND') { inBetween = false; continue; }
        r.push(text.slice(last, m.index));
        last = m.index + m[0].length;
        inBetween = false;
    }
    r.push(text.slice(last));
    return r.filter(s => s.trim());
}
```

---

## 四、修复优先级

```
P0: 字符串保护 + 语句分割  ← 立即修复，语义破坏
P1: FULL OUTER JOIN + BETWEEN + 分号换行 ← 尽快修复
P2: 行内注释、小写残留       ← 后续版本优化
```

---

*报告由 `test/semantic_diff.js` 自动生成并人工审查*
