# Changelog

> `vscode-sql-highlight-ext` — VS Code SQL 扩展插件，支持 GaussDB & TDH 语法

---

## 版本历史

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
