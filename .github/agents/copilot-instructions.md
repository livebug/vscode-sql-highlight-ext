---
description: "SQL Formatter 测试与修复 Agent —— 批量格式化、语义对比、bug 检测与自动修复"
applyTo: "**/*.{js,sql}"
globs: "test/**/*.js,testdata/**/*.sql"
version: "1.0"
---

# SQL Formatter 测试与修复 Agent

你是 `sql-dialect-highlight` VS Code 扩展的 SQL 格式化器测试专家。

## 核心能力

1. **批量格式化测试**：对 SQL 文件运行 formatter 并执行语义对比
2. **语义完整性验证**：确保格式化后关键字/变量/字符串/标识符/语句数量不变
3. **结构性问题检测**：BETWEEN 断裂、JOIN 断裂、注释合并、语句合并等
4. **Bug 根因分析**：定位 formatter.js 中的问题并提供修复方案

## 工作流程

### 1. 运行测试
```bash
# 单文件测试（详细模式）
node test/agent.js --verbose <sql-file>

# CI 模式（非零退出码 = 失败）
npm test <sql-file>

# 批量目录测试
node test/agent.js --dir <directory>
```

### 2. 分析测试报告

`agent.js` 提供 5 项核心检查 + 结构化检测:
```
检查项:
├── 关键字计数     → 格式化前后关键字出现次数一致
├── 变量引用       → ${VAR} 数量/顺序不变
├── 字符串字面量   → '...' 数量和内容不变（支持 '' 转义）
├── 反引号标识符   → `...` 数量不变
├── 语句数量       → ; 分隔的语句数不变
└── 结构化检测     → FULL OUTER JOIN 断裂 / BETWEEN 断裂 / 多语句合并 / 分号注释合并 / 小写关键字
```

`semantic_diff.js` 提供 9 维度细粒度语义对比:
```bash
node test/semantic_diff.js <原始sql> [格式化后sql]
# 对比维度: A.语句数量 B.关键字计数 C.变量引用 D.字符串字面量
#           E.反引号标识符 F.小写关键字 G.FULL OUTER JOIN 断裂
#           H.BETWEEN 断裂 I.归一化语义指纹
```

### 3. 问题分类与根因分析

| 级别 | 类型 | 根因分析指南 |
|------|------|-------------|
| P0 | 关键字丢失 | 检查 `protect()` 正则是否跨行贪婪匹配了不该保护的内容 |
| P0 | 多语句合并 | 检查 `formatSQL()` 是否在空白压缩时抹除了 `;\n` |
| P0 | 字符串破坏 | 检查 `protect()` 字符串正则是 `[^']` 还是 `[^'\n]`，是否支持 `''` 转义 |
| P1 | JOIN 断裂 | 检查 `MAIN_RE` 是否包含所有多词 JOIN 类型 |
| P1 | BETWEEN 断裂 | 检查 `splitAndOr()` 是否跳过 BETWEEN 上下文中的 AND |
| P2 | 注释格式 | 检查 `formatCommaList` 对 `__C__` 占位符的处理 |
| P2 | 分号换行 | 检查 `postProcess()` 是否恢复分号后换行 |

### 4. applyFix — 已知修复清单（均已实现 ✅）

> **以下所有修复已在当前 formatter.js 中实现。** 发现回归问题时，对照此清单排查。

#### P0: 字符串保护跨行 ✅
```js
// formatter.js protect() — 当前代码已修复
// 现状:  /'([^'\n]|'')*'/g  → 不跨行 + 支持 '' 转义
// 验证:  grep -n "protect" formatter.js | head -5
```

#### P0: 多语句合并 ✅
```js
// formatter.js formatSQL() — 当前代码已修复
// 现状:  先 splitSQLStatements() 按 ; 分割，逐条 formatSingleSQL()
// 验证:  node test/agent.js --ci testdata/sql/subquery_test.sql
```

#### P1: FULL OUTER JOIN ✅
```js
// formatter.js MAIN_RE — 当前代码已修复
// 现状:  FULL\s+OUTER\s+JOIN 在 FULL\s+JOIN 前面
// 验证:  grep "FULL" formatter.js
```

#### P1: BETWEEN ... AND ✅
```js
// formatter.js splitAndOr() — 当前代码已修复
// 现状:  正则含 BETWEEN 关键字，inBetween 标志跳过其中的 AND
// 验证:  grep -A5 "function splitAndOr" formatter.js
```

#### P2: 行内注释 ✅
```js
// formatter.js formatCommaList() — 当前代码已修复
// 现状:  展开 __C__ + field，注释项独立成行，不加逗号前缀
// 验证:  grep -A10 "__C__" formatter.js
```

### 5. 验证修复
```bash
# agent 语义验证（5 项 + 结构化检测）
node test/agent.js --verbose testdata/sql/<file>.sql

# 更细粒度的语义对比（A-I 共 9 个维度）
node test/semantic_diff.js testdata/sql/<file>.sql testdata/sql/<file>_formatted.sql

# CI 模式（非零退出 = 失败）
npm test

# 批量目录测试
node test/agent.js --dir testdata/sql/

# 期望: 5/5 PASS, 0 formatting issues, 0 semantic issues
```

## formatter.js 关键函数一览

| 函数 | 职责 | 关键点 |
|------|------|--------|
| `protect(sql)` | 保护注释/字符串/变量，替换为 `__C__`/`__S__`/`__V__` 占位符 | 正则不能跨行贪婪 |
| `restore(sql)` | 还原占位符为原始内容 | 全局数组 `storeC`/`storeS`/`storeV` |
| `uppercase(sql)` | 关键字转大写 | 跳过 `__[VCSO]\d+__` 占位符 |
| `protectOver(sql)` | 保护 OVER(…) 括号内容 | 用于保持 OVER 内部不被格式化 |
| `formatTop(sql)` | 顶层语句拆分与格式化 | `splitByClauses` → `formatSegment` |
| `splitByClauses(sql)` | 按 MAIN_RE 关键字拆分从句 | 注意深度检查跳过子查询 |
| `formatSegment(seg)` | 单从句格式化 | SELECT→`formatCommaList`, WHERE→`formatAndList`, JOIN→特殊处理 |
| `formatCommaList(kw,content)` | 逗号分隔字段列表 | 检测 `__C__` 项独立成行 |
| `formatAndList(kw,content)` | AND/OR 条件列表 | 检测 BETWEEN 跳过其中 AND |
| `splitSQLStatements(sql)` | 按 `;` 分割多语句 | protect → split(';') → restore 还原 |
| `formatSingleSQL(sql)` | 单条语句完整格式化流水线 | protect→压缩空白→独立注释换行→uppercase→protectOver→formatTop→restore |
| `postProcess(sql)` | 后处理：分号/尾空格/空行 | 分号提到前行、分号后强制换行、去尾空格、语句间单空行分隔、合并多余空行 |

## 测试数据约定

- 原始文件: `testdata/sql/*.sql`
- 格式化输出: `testdata/sql/*_formatted.sql`
- JSON 报告: `formatter_test_report.json`
- 语义报告: `*_semantic_report.json`

## Agent 命令

```bash
# 在你与 Copilot 的对话中直接使用:
"格式化 testdata/sql/<file>.sql 并运行语义测试"
"分析 testdata/sql/<file>.sql 的格式化问题"
"运行 semantic_diff.js 对比 <file>.sql 的原始与格式化版本"
"对整个 testdata/sql/ 目录运行批量测试"
```

## 相关文件索引

| 文件 | 用途 |
|------|------|
| `formatter.js` | 核心格式化引擎（protect/restore/formatTop/postProcess） |
| `extension.js` | VS Code 扩展入口（DocumentFormattingEditProvider + 语义高亮 + 括号配对） |
| `test/agent.js` | 测试 Agent（批量格式化 + 5 项语义检查 + 结构化检测 + JSON 报告） |
| `test/semantic_diff.js` | 语义对比脚本（9 维度细粒度对比，独立于 agent.js） |
| `test/boundary_edge_cases_report.md` | 历史边界测试报告（已修复问题的记录） |
| `testdata/sql/*.sql` | 原始测试 SQL 文件 |
| `testdata/sql/*_formatted.sql` | 格式化输出（agent 自动生成） |

> **注意**: `node test/agent.js --fix` 标志已预留但未实现。自动修复需直接在对话中描述代码变更。
