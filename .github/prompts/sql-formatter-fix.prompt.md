---
description: "SQL Formatter Bug Fix —— 检测并修复 formatter.js 中的格式化缺陷"
applyTo: "formatter.js"
globs: "formatter.js"
---

# SQL Formatter Bug 修复提示

当修改 `formatter.js` 时，始终遵循以下规则：

## 保护函数 protect() 规则
1. 字符串正则必须使用 `[^'\n]` 禁止跨行
2. 支持 SQL 标准 `''` 转义语法：`/'([^'\n]|'')*'/g`
3. 保护顺序：变量 → 字符串 → 行注释 → 块注释（字符串必须在注释之前保护）

## 关键字正则规则
1. `MAIN_RE` 中多词关键字必须放在单词关键字之前（如 `FULL\s+OUTER\s+JOIN` 在 `FULL\s+JOIN` 前）
2. `splitAndOr()` 的 `BETWEEN` 检测必须先于 `AND`/`OR` 匹配

## 注释处理规则
1. 行注释保护时捕获尾部 `\n?`（用于独立注释检测）
2. `formatCommaList` 中 `__C__` 占位符项不加 `, ` 前缀
3. `formatSingleSQL` 的独立注释检测必须在空白压缩之前

## 验证流程
修改后立即运行：
```bash
npm test testdata/sql/boundary_edge_cases.sql
```
期望：5/5 PASS
