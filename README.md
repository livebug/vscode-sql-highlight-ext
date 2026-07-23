# SQL Dialect Highlight (TDH & GaussDB)

为 VS Code 提供 **TDH（星环/Transwarp）** 和 **GaussDB（高斯）** 数据库的 SQL 语法高亮、格式化、语义分析与智能补全支持。

---

## 功能概览

| 功能 | 说明 |
|------|------|
| 🎨 **语法高亮** | TextMate 语法定义，支持 TDH 和 GaussDB 特有函数、关键字、类型 |
| 📐 **SQL 格式化** | 逗号优先、AND 对齐、关键字大写、子查询递归格式化、OVER() 保护 |
| 🔤 **语义高亮** | 表名 (class)、字段名 (property)、别名 (variable) 自动着色 |
| 🔗 **括号配对** | CASE↔END、BEGIN↔END、WHEN↔THEN 高亮匹配 |
| 💡 **悬浮提示** | 别名 → 原表名；表名 → CREATE TABLE 定义摘要 |
| 🔍 **定义跳转** | F12 / Ctrl+Click 跳转到别名定义或 CREATE TABLE 语句 |
| ✍️ **代码补全** | 基于 `.metadata/*.csv` 数据字典的表名 & 字段名智能补全 |
| 📋 **日志面板** | 统一日志输出，便于排查问题 |

---

## 支持的语言

| 语言 ID       | 别名                               | 文件扩展名              |
| ------------- | ---------------------------------- | ----------------------- |
| `sql-tdh`     | SQL (TDH), tdh-sql, Transwarp SQL | `.tdhsql`, `.tdh.sql`   |
| `sql-gaussdb` | SQL (GaussDB), gaussdb-sql         | `.gaussql`, `.gauss.sql` |

---

## 项目结构

```
.
├── package.json                        # 扩展清单（语言注册、配置项、命令）
├── extension.js                        # 扩展入口（格式化/语义/补全/悬停/跳转）
├── formatter.js                        # SQL 格式化引擎
├── metadata-loader.js                  # .metadata CSV 数据字典加载器
├── logger.js                           # 统一日志输出模块
├── language-configuration.json         # 语言配置（注释、括号匹配）
├── syntaxes/
│   ├── sql-tdh.tmLanguage.json         # TDH 语法高亮定义
│   └── sql-gaussdb.tmLanguage.json     # GaussDB 语法高亮定义
├── test/
│   ├── agent.js                        # 测试运行器
│   ├── semantic_diff.js                # 语义差异测试
│   └── boundary_edge_cases_report.md   # 边界测试报告
└── testdata/
    └── sql/                            # 测试 SQL 文件
```

---

## 各功能详解

### 1. 语法高亮

基于 TextMate 语法（`.tmLanguage.json`），`patterns` 中的顺序决定优先级：

```jsonc
{
  "scopeName": "source.sql.xxx",
  "patterns": [
    { "include": "#comments" },     // 注释
    { "include": "#strings" },      // 字符串
    { "include": "#numbers" },      // 数字
    { "include": "#operators" },    // 操作符
    { "include": "#xxx-keywords" }, // 方言关键字
    { "include": "#sql-keywords" }, // 通用 SQL 关键字
    { "include": "#xxx-functions" },// 方言函数
    { "include": "#sql-functions" },// 通用 SQL 函数
    { "include": "#xxx-types" },    // 方言类型
    { "include": "#sql-types" },    // 通用 SQL 类型
    { "include": "#identifiers" }   // 标识符（兜底）
  ],
  "repository": { /* ... */ }
}
```

> 条数越靠前优先级越高，标识符放在最后作为兜底。

### 2. SQL 格式化

支持 **全文格式化**（`Shift+Alt+F`）和 **选区格式化**（`Ctrl+K Ctrl+F`）。

**格式化风格：**
- **逗号优先**: 逗号放在行首
  ```sql
  SELECT
      col1
      , col2
      , col3
  ```
- **AND 对齐**: 多条件 AND 在行首对齐
  ```sql
  WHERE a = 1
    AND b = 2
    AND c = 3
  ```
- **JOIN/ON 对齐**: ON 与 JOIN 关键字对齐
- **子查询递归**: `(SELECT ...)` 自动缩进格式化
- **OVER() 保护**: 窗口函数 `OVER(PARTITION BY ...)` 内容不被错误格式化
- **多语句支持**: 按 `;` 分割，逐条格式化

**配置项**（`settings.json`）:

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `sqlDialectHighlight.format.indentSize` | number | 4 | 缩进空格数 |
| `sqlDialectHighlight.format.maxWidth` | number | 200 | 单行最大字符数 |
| `sqlDialectHighlight.format.commaFirst` | boolean | true | 逗号优先（逗号在行首） |
| `sqlDialectHighlight.format.andAlign` | boolean | true | AND 行首对齐 |
| `sqlDialectHighlight.format.keywordCase` | string | "upper" | 关键字大小写 (upper/lower/preserve) |

### 3. 语义高亮

自动识别并着色：

| 语义类型 | 着色 | 识别规则 |
|----------|------|----------|
| **表名** | `class` (类) | `FROM`/`JOIN`/`INTO`/`UPDATE` 后的标识符 |
| **字段名** | `property` (属性) | `table.column` 中 `.` 后的标识符 |
| **别名** | `variable` (变量) | `AS alias` 或表名后的短标识符 |

> 可在 `editor.tokenColorCustomizations` 中自定义语义 token 颜色。

### 4. 括号配对高亮

当光标位于以下关键字上时，自动高亮匹配对：

| 正向 | ↔ | 反向 |
|------|---|------|
| `CASE` | ↔ | `END` |
| `BEGIN` | ↔ | `END` |
| `WHEN` | ↔ | `THEN` |

> 支持嵌套结构，正确跳过内层 `CASE...END` 块。

### 5. 悬浮提示 (Hover)

- **表别名**: 悬浮显示原表名，Ctrl+Click 可跳转
- **CREATE TABLE 定义**: 悬浮表名显示 SQL 定义摘要
- **别名定义处**: 显示"表别名定义"标记

### 6. 定义跳转 (F12 / Ctrl+Click)

- **别名 → 原表**: 在别名使用处 F12 跳转到别名定义处
- **别名定义 → 表名**: 在别名定义处 F12 跳转到表名
- **表名 → CREATE**: 在表名上 F12 跳转到 `CREATE TABLE` 语句

### 7. 代码补全

在项目根目录或任意子目录下创建 `.metadata/` 文件夹，放置 CSV 数据字典：

**`.metadata/tables.csv`**:
```csv
database,schema,table_name,type,description
mydb,public,users,TABLE,用户表
mydb,public,orders,TABLE,订单表
```

**`.metadata/columns.csv`**:
```csv
database,schema,table_name,column_name,data_type,nullable,default_value,description
mydb,public,users,id,BIGINT,NO,,用户ID
mydb,public,users,name,VARCHAR,YES,,用户名
mydb,public,orders,user_id,BIGINT,YES,,关联用户ID
```

**补全上下文:**
- `FROM`/`JOIN` 之后 → 补全**表名**
- `alias.` 之后 → 补全该表的**字段名**
- `SELECT` 之后 → 补全全局**字段名**

### 8. 日志面板

所有交互操作（格式化、悬浮、跳转、补全、配对高亮等）都会输出日志。

打开方式：`Ctrl+Shift+P` → `SQL Dialect Highlight: 显示日志`

日志级别可在 `settings.json` 中设置：
```json
{
  "sqlDialectHighlight.logLevel": "debug"  // debug | info | warn | error
}
```

---

## 语法文件维护

### 添加新关键字/函数/类型

1. 打开对应语法文件（如 `syntaxes/sql-tdh.tmLanguage.json`）
2. 在 `repository` 中找到对应规则：
   - `xxx-keywords` → 关键字
   - `xxx-functions` → 内置函数
   - `xxx-types` → 数据类型
3. 在 `match` 正则的 `\b(...)\b` 中用 `|` 分隔添加新词条
4. 多词关键字（如 `LEFT OUTER JOIN`）用 `\\s+` 连接

```jsonc
{
  "name": "keyword.control.tdh.sql",
  "match": "(?i)\\b(LATERAL\\s+VIEW|...|NEW_KEYWORD)\\b"
}
```

### Token 命名约定

- 方言相关: `.tdh.` 或 `.gaussdb.` 命名空间，如 `keyword.control.tdh.sql`
- 通用 SQL: 不加方言前缀，如 `keyword.control.sql`、`support.function.sql`
- 变量: `variable.other.sql`

---

## 打包与发布

### 打包

```bash
npm install -g @vscode/vsce
cd vscode-sql-highlight-ext
vsce package
# 生成 sql-dialect-highlight-x.x.x.vsix
```

### 安装本地包

```bash
code --install-extension sql-dialect-highlight-x.x.x.vsix
```

### 发布到 Marketplace

```bash
vsce create-publisher <publisher-name>  # 首次
vsce login <publisher-name>
vsce publish                           # 发布
vsce publish patch                     # 0.7.1 → 0.7.2
vsce publish minor                     # 0.7.1 → 0.8.0
```

---

## 测试

```bash
npm test              # CI 模式测试
npm run test:verbose  # 详细输出
npm run test:dir      # 目录模式
npm run test:format   # 仅格式化测试
```

### F5 调试

1. 在 VS Code 中打开本项目
2. 按 `F5` 启动扩展开发主机
3. 在新窗口创建 `.tdhsql` 或 `.gaussql` 文件测试

### 符号链接（快速迭代）

```bash
ln -s /home/livebug/vscode-sql-highlight-ext ~/.vscode/extensions/sql-dialect-highlight
```

修改后重新加载 VS Code 窗口即可生效。

---

## 测试用例建议

覆盖以下场景：
- 基本 DML: `SELECT`、`INSERT`、`UPDATE`、`DELETE`
- 基本 DDL: `CREATE TABLE`、`ALTER TABLE`、`DROP TABLE`
- 多表 JOIN: `INNER JOIN`、`LEFT JOIN`、`CROSS JOIN`
- 子查询和 CTE: `WITH ... AS (...)`
- 字符串变量: `'SELECT * FROM ${TABLE_NAME}'`
- SQL 变量: `SELECT * FROM ${DB_NAME}.${TABLE_NAME}`
- 内置函数调用
- 注释（`--` 和 `/* */`）
- 数字和操作符
- 方言特有语法（`LATERAL VIEW`、`EXPLODE` 等）

---

## License

MIT
