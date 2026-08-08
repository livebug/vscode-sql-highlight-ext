# Changelog

> `vscode-sql-highlight-ext` — VS Code SQL 扩展插件，支持 GaussDB & TDH 语法

---

## 版本历史

### v0.9.3 (2026-08)
- **feat: SELECT 字段 AS 对齐 + 注释对齐** — ≥2 个含 AS 字段时 AS 列对齐；≥2 个带尾部注释时注释列对齐（按占位符还原后真实长度计算）
- **feat: GROUP BY / ORDER BY / HAVING / LIMIT / OFFSET 各自独立成行** — 不再与 FROM/WHERE 合并
- **feat: UPDATE SET 逐行** — SET 独立成行、赋值列表逗号优先逐行；DELETE 短则保持单行
- **feat: CREATE TABLE 强制多行** — 列定义不区分长度逐行、逗号优先；列内注释归属；尾部 CLUSTERED/SORTED/INTO BUCKETS/STORED 等子句各自换行
- **feat: WITH CTE 逐行** — 每个 CTE 单独换行、逗号优先、内层 SELECT 递归格式化；支持 RECURSIVE
- **feat: WHEN 多条件强制换行 + OR 优先级告警** — 混合 AND/OR（无括号）时自动插入 `-- ⚠ 建议用括号明确优先级` 注释（幂等）
- **feat: MERGE 格式化** — `MERGE INTO` / `USING` / `ON` 各自成行；`WHEN MATCHED/NOT MATCHED THEN` 独立成行、动作（UPDATE SET/INSERT）缩进，SET 不与 WHEN 同行；splitByClauses 对 MERGE 内部不再拆分
- **fix: N03 字段后注释** — `col, -- 注释` 注释挂在字段行尾、逗号保留，不再独立成行
- **fix: CREATE 存储子句 INTO n BUCKETS 不再被 splitByClauses 误切**
- **fix: CTE 正则跨行** — `[\s\S]` 匹配多行查询体
- 测试：场景测试扩至 71 个（新增 S06/DD5），两套测试全绿；`agent.js` 关键字计数忽略注释

### v0.9.2 (2026-08)
- **refactor: 断舍离与精简** — 摘除 4 个模块的 16 个死导出（table-scanner / metadata-loader / completion-data / format-provider），收敛公共 API
- **perf: findKwIn O(n²)→O(n)** — 全局正则迭代 + 光标累积括号深度，优化大 CASE 解析
- **refactor: splitAndOr 复用 splitAndOrWithOps** — 消除 ~20 行重复扫描逻辑，行为永不漂移
- **chore: 删除 test/semantic_diff.js（477 行）** — 功能已并入 agent.js，并将唯一独有的"行内注释断裂"检查移植进 agent.js
- **fix: formatAndList 保留 OR 连接词** — 多条件拆分时 OR 不再被误写成 AND
- **fix: 限定标识符保护** — `t.case` / `t.when` / `t.end` 等撞关键字的列名不再被误判为 CASE 关键字（protectCase / protectNestedCases / findKwIn / splitAndOrWithOps 增加 `.` 前缀守卫）
- **fix: formatCommaList 注释独立行幂等** — 支持 `field\n-- 注释\nfield` 形态拆分，注释独立成行后二次格式化不再漂移
- **feat: 新增 test/scenarios.js 全面场景测试** — 15 类 69 个场景，7 项检查（关键字/字符串/语句数/占位符泄漏/幂等/注释吞后文/括号平衡），报告输出 `testdata/scenario_test_report.md`，`npm run test:scenarios`
- 测试全部通过（语义对比 + 结构问题检测 + 69 场景）

### v0.9.1 (2026-08)
- **新增 CASE WHEN 格式化** — 短 CASE 保持单行；长 CASE 时 `CASE`/`END` 列对齐、`WHEN cond THEN val` 短则一行长则 THEN 列对齐、WHEN 内多条件按 AND/OR 对齐拆行、支持简单 CASE（`CASE expr`）与嵌套 CASE 递归
- **修复 CASE 内行注释吞后文** — `WHEN ... THEN 'x' -- 注释` 场景强制多行，确保 `-- 注释` 落在行尾不再吞掉后续 `WHEN/ELSE/END`
- 通过 `protectCase` 占位符保护，避免 THEN 值中的逗号 / AND 干扰现有逗号优先与 AND 对齐逻辑

### v0.9.0 (2026-07)
- **重构项目结构** — 源码移入 `src/` 目录，按 `core/` `providers/` `views/` 三层架构组织
- **extension.js 模块化拆分** — 从 600+ 行精简至 ~150 行入口文件，拆出 7 个独立 provider
- **新增 alias-parser.js** — 统一别名解析 & CREATE TABLE 定义解析逻辑，消除重复代码
- 更新 `package.json` 入口路径及测试引用，全部测试通过

### v0.8.0 (2025-07)
- **新增文档大纲 (Document Symbols)** — 支持 SQL 文件中的符号导航（表、字段、CTE 等）
- **修复 `${VAR}` 变量解析错误**
- **新增测试套件** — `test-harness/` 目录含 `east-demo`、`format-test`、`hover-jump`、`outline-test`
- 统一日志模块 (`logger.js`) 全局集成调试日志
- README 全功能文档及测试用例完善

### v0.7.1
- **修复**: ON/AND 右对齐 JOIN + `formatAndList` 短行阈值修复

### v0.7.0
- **SELECT 多字段强制展开** + 子查询递归格式化
- 注释换行修复
- 新增 SQL 测试用例及元数据

### v0.6.0
- 行内注释格式化修复
- 集成 Copilot AI Agent

### v0.5.0
- 修复 formatter 核心 bug
- 新增测试 agent

### v0.4.0
- 支持选中语句格式化
- 注释不被格式化

### v0.3.0
- 添加 WHEN ↔ THEN 括号配对高亮支持
- CASE/END 配对高亮 + 下划线引导线

### v0.2.0
- 修复标识符匹配顺序，避免 dblink 语法误匹配

### v0.1.0
- 初始版本 — SQL dialect 高亮 (TDH & GaussDB)

---

## 核心功能

| 功能 | 实现 |
|------|------|
| 语法高亮 | `syntaxes/sql-gaussdb.tmLanguage.json`、`sql-tdh.tmLanguage.json` |
| SQL 格式化 | `formatter.js` — 支持 SELECT 展开、子查询递归、JOIN 对齐、注释保留 |
| 语义高亮 | `extension.js` — 基于 Metadata 的表名/字段名语义着色 |
| 括号配对 | CASE/END、WHEN/THEN、BEGIN/END 配对高亮 + 下划线引导线 |
| 代码补全 | `extension.js` + `completion-data.js` — 智能上下文分析、多层次补全源（Snippet/关键字/函数/CTE/临时表/Metadata） |
| 定义跳转 | `extension.js` — 表名/字段名跳转到 Metadata 定义 |
| 文档大纲 | `extension.js` — Document Symbols 符号导航 |
| 依赖视图 | `deps-view-provider.js` — 依赖树视图面板 |
| 元数据加载 | `metadata-loader.js` — `.metadata/` CSV 加载 |
| 表扫描 | `table-scanner.js` — SQL 文本中 CREATE TABLE 解析 |

## 项目结构

```
.
├── extension.js              # 主入口（激活/补全/跳转/高亮/大纲）
├── formatter.js              # SQL 格式化引擎
├── metadata-loader.js        # 元数据加载器
├── table-scanner.js          # 表结构扫描器
├── deps-view-provider.js     # 依赖树视图 Provider
├── logger.js                 # 统一日志模块
├── completion-data.js        # 补全静态数据（关键字/函数/类型/Snippet）
├── syntaxes/
│   ├── sql-gaussdb.tmLanguage.json
│   └── sql-tdh.tmLanguage.json
├── test/                     # 测试工具
│   ├── agent.js
│   └── semantic_diff.js
├── test-harness/             # 测试用例集
│   └── sql/
│       ├── east-demo.sql
│       ├── format-test.sql
│       ├── hover-jump.sql
│       └── outline-test.sql
└── testdata/                 # 测试数据
    └── sql/
        ├── semantic-test.sql
        ├── semantic-test_formatted.sql
        ├── subquery_test.sql
        └── subquery_test_formatted.sql
```

## 标签版本

| 标签 | 版本 |
|------|------|
| `v0.8.0` | 文档大纲 + `${VAR}` 修复 |
| `v0.7.1` | ON/AND JOIN 对齐修复 |
| `v0.7.0` | SELECT 展开 + 子查询递归格式化 |
| `v0.6.0` | 行内注释 + AI Agent |
| `v0.5.0` | Formatter 核心修复 + 测试 agent |
| `v0.4.0` | 选中格式化 + 注释保留 |
| `v0.3.0` | WHEN/THEN 配对高亮 |
| `v0.2.0` | dblink 误匹配修复 |
| `v0.1.0` | TDH & GaussDB 高亮 |
