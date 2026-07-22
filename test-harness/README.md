# Test Harness — SQL Dialect Highlight 测试套件

本目录用于手动测试 SQL Dialect Highlight 扩展的各项功能。

---

## 快速开始

1. 用 VS Code 打开本目录的**父目录**（即 `vscode-sql-highlight-ext`）作为工作区根目录
2. 按 `F5` 启动扩展开发主机（Extension Development Host）
3. 在新窗口中打开 `test-harness/sql/` 目录下的任意 SQL 文件
4. 语言模式选择 `SQL (TDH)` 或 `SQL (GaussDB)`

---

## 测试文件说明

| 文件 | 测试重点 |
|------|----------|
| `east-demo.sql` | 基础功能：补全、Hover、跳转、变量表名 `${VAR}.table` |
| `outline-test.sql` | 大纲视图：CREATE TABLE/VIEW、WITH CTE、嵌套子查询 |
| `format-test.sql` | 格式化：逗号优先、AND对齐、子查询递归、多语句 |
| `hover-jump.sql` | 悬浮与跳转：别名、CREATE TABLE、CTE、嵌套别名 |

---

## 功能测试清单

### ✅ 语法高亮
- [ ] TDH 关键字着色正确（如 `LATERAL VIEW`、`EXPLODE`）
- [ ] GaussDB 关键字着色正确
- [ ] 字符串 `'...'` 内变量 `${VAR}` 着色
- [ ] 注释 `--` 和 `/* */` 正确着色
- [ ] 数字、操作符着色

### ✅ SQL 格式化（`Shift+Alt+F`）
- [ ] 全文格式化：`east-demo.sql` 格式化后结构清晰
- [ ] 选区格式化：选中部分 SQL → `Ctrl+K Ctrl+F`
- [ ] 逗号优先：逗号在行首
- [ ] AND 对齐：多条件 AND 缩进对齐
- [ ] 子查询递归：`(SELECT ...)` 内嵌格式化
- [ ] 多语句：`;` 分割的语句各自独立格式化
- [ ] 窗口函数 `OVER()` 不被破坏

### ✅ 语义高亮
- [ ] 表名（FROM/JOIN 后）着色为 class
- [ ] 字段名（`table.column`）着色为 property
- [ ] 别名定义着色为 variable declaration

### ✅ 括号配对高亮
- [ ] 光标在 `CASE` 上 → `END` 高亮
- [ ] 光标在 `BEGIN` 上 → `END` 高亮
- [ ] 光标在 `WHEN` 上 → `THEN` 高亮
- [ ] 嵌套 CASE...END 正确配对（不跨层）
- [ ] 变量 `${VAR}` 不影响配对

### ✅ 悬浮提示 (Hover)
- [ ] 悬浮在别名上 → 显示原表名
- [ ] 悬浮在别名定义处 → 显示"表别名定义"
- [ ] 悬浮在 CREATE TABLE 定义的表名上 → 显示完整定义

### ✅ 定义跳转 (F12 / Ctrl+Click)
- [ ] 别名使用处 → 跳转到别名定义
- [ ] 别名定义处 → 跳转到表名
- [ ] 表名 → 跳转到 CREATE TABLE 语句
- [ ] **变量前缀 `${VAR}.table` 跳转正常**（关键测试）

### ✅ 代码补全
- [ ] `FROM ` 之后 → 补全表名列表
- [ ] `别名.` 之后 → 补全该表字段
- [ ] `SELECT ` 之后 → 补全全局字段
- [ ] 补全项包含字段类型和描述

### ✅ 文档大纲
- [ ] `Ctrl+Shift+O` 或面包屑导航 → 显示 CREATE TABLE/VIEW
- [ ] WITH CTE 出现在大纲中
- [ ] 点击大纲项跳转到对应位置

### ✅ 日志面板
- [ ] `Ctrl+Shift+P` → `SQL Dialect Highlight: 显示日志`
- [ ] 格式化时日志输出
- [ ] 跳转时日志输出
- [ ] 补全时日志输出

---

## 配置项测试

在 `.vscode/settings.json` 中修改配置，验证效果：

```json
{
  "sqlDialectHighlight.format.indentSize": 2,
  "sqlDialectHighlight.format.commaFirst": false,
  "sqlDialectHighlight.format.keywordCase": "lower",
  "sqlDialectHighlight.logLevel": "debug"
}
```

---

## 元数据（.metadata）

本目录已包含 `.metadata/tables.csv` 和 `.metadata/columns.csv`，用于测试代码补全功能。

如需修改：
- `tables.csv`: 添加/删除表定义
- `columns.csv`: 添加/删除字段定义

修改后无需重载，补全会自动读取最新数据。

---

## 已知测试要点

1. **变量表名**: `FROM ${DB}.table t` 中，`t` 别名应跳转到 `table`，hove 应显示 `table`
2. **CREATE 变量**: `CREATE TABLE ${DB}.tmp_x` 应出现在大纲中
3. **CTE 变量**: `WITH ${PREFIX}_cte AS (...)` 应正常高亮
4. **嵌套 CTE**: 多层 WITH AS 应在大纲中各自展示
5. **格式化变量**: `'${DATE}'` 字符串中变量不被格式化破坏
