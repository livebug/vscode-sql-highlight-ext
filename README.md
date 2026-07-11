# SQL Dialect Highlight (TDH & GaussDB)

为 VS Code 提供 **TDH（星环/Transwarp）** 和 **GaussDB（高斯）** 数据库的 SQL 语法高亮支持。

## 支持的语言

| 语言 ID       | 别名                            | 文件扩展名            |
| ------------- | ------------------------------- | --------------------- |
| `sql-tdh`     | SQL (TDH), tdh-sql, Transwarp SQL | `.tdhsql`, `.tdh.sql` |
| `sql-gaussdb` | SQL (GaussDB), gaussdb-sql      | `.gaussql`, `.gauss.sql` |

## 项目结构

```
.
├── package.json                        # 扩展清单（语言注册、语法文件关联）
├── language-configuration.json         # 语言配置（注释、括号匹配等）
├── syntaxes/
│   ├── sql-tdh.tmLanguage.json         # TDH 语法高亮定义
│   └── sql-gaussdb.tmLanguage.json     # GaussDB 语法高亮定义
└── README.md
```

## 语法文件结构

语法文件使用 TextMate 语法格式（`.tmLanguage.json`），结构如下：

```jsonc
{
  "scopeName": "source.sql.xxx",   // 顶级作用域
  "patterns": [                     // 顶层匹配规则（顺序敏感）
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
    { "include": "#identifiers" }   // 标识符（放在最后，兜底匹配）
  ],
  "repository": { /* 上面引用的所有规则定义 */ }
}
```

> **注意**：`patterns` 中的顺序很重要，越靠前的规则优先级越高。标识符（identifiers）放在最后作为兜底匹配。

### 命名约定

- 方言相关 Token 使用 `.tdh.` 或 `.gaussdb.` 命名空间，如 `keyword.control.tdh.sql`
- 通用 SQL Token 不加方言前缀，如 `keyword.control.sql`、`support.function.sql`
- 变量使用 `variable.other.sql`

---

## 维护指南

### 添加新的方言关键字/函数/类型

1. 打开对应语法文件（如 `syntaxes/sql-tdh.tmLanguage.json`）
2. 在 `repository` 中找到对应的规则块：
   - `xxx-keywords` → 关键字（如 `SELECT`、`CREATE TABLE`）
   - `xxx-functions` → 内置函数（如 `COLLECT_LIST`、`NVL`）
   - `xxx-types` → 数据类型（如 `TINYINT`、`VARCHAR`）
3. 在 `match` 正则的 `\b(...)\b` 中用 `|` 分隔添加新词条
4. 多词关键字（如 `LEFT OUTER JOIN`）需要用 `\\s+` 连接

```jsonc
// 示例：在 TDH 关键字中添加新关键字 MY_NEW_KEYWORD
{
  "name": "keyword.control.tdh.sql",
  "match": "(?i)\\b(LATERAL\\s+VIEW|...|MY_NEW_KEYWORD|ANOTHER_NEW_ONE)\\b"
}
```

### 添加新的语法特性（如 `${VAR}` 变量）

1. 在 `repository` 中创建新的规则块（如 `#variables`）
2. 在需要的地方通过 `{ "include": "#variables" }` 引入：
   - 顶层 `patterns` 中（在 SQL 语句任意位置生效）
   - 字符串的 `patterns` 中（在 `'...'` 或 `"..."` 内部生效）

```jsonc
// 定义变量规则
"variables": {
  "patterns": [
    {
      "name": "variable.other.sql",
      "match": "\\$\\{[a-zA-Z_][a-zA-Z0-9_]*\\}"
    }
  ]
}
```

### 修改语言配置

`language-configuration.json` 控制：
- 注释快捷键（`Ctrl+/` 添加 `--`）
- 括号自动闭合
- 自动包围配对

---

## 打包

### 安装打包工具

```bash
npm install -g @vscode/vsce
```

### 打包为 .vsix 文件

```bash
cd vscode-sql-highlight-ext
vsce package
```

成功后会生成 `sql-dialect-highlight-0.1.0.vsix` 文件。

### 打包前检查

确保 `package.json` 中的版本号已更新，且无语法错误：

```bash
# 验证 JSON 格式
cat syntaxes/sql-tdh.tmLanguage.json | python3 -m json.tool > /dev/null && echo "OK"
cat syntaxes/sql-gaussdb.tmLanguage.json | python3 -m json.tool > /dev/null && echo "OK"
cat package.json | python3 -m json.tool > /dev/null && echo "OK"
```

---

## 测试

### 方式一：F5 调试（推荐开发时使用）

> 需要 `.vscode/launch.json`（已提供），配置使用 `extensionHost` 类型启动。

1. 在 VS Code 中打开本项目文件夹
2. 按 `F5` 启动扩展开发主机（Extension Development Host）
3. 在新窗口中创建测试文件（`.tdhsql` 或 `.gaussql`）
4. 写入各种 SQL 语句，观察语法高亮是否正确

### 方式二：安装 .vsix 本地测试

```bash
# 先打包
vsce package

# 安装到 VS Code
code --install-extension sql-dialect-highlight-0.1.0.vsix
```

安装后打开对应扩展名的文件即可测试。重新加载窗口：`Ctrl+Shift+P` → `Developer: Reload Window`。

### 方式三：符号链接（快速迭代）

将项目文件夹链接到 VS Code 扩展目录，修改即时生效：

```bash
ln -s /home/livebug/vscode-sql-highlight-ext ~/.vscode/extensions/sql-dialect-highlight
```

重新加载 VS Code 窗口后生效。修改语法文件后再次重新加载即可看到效果。

### 测试用例建议

创建 `test/sample.tdhsql` 和 `test/sample.gaussql` 文件，覆盖以下场景：

- 基本 DML：`SELECT`、`INSERT`、`UPDATE`、`DELETE`
- 基本 DDL：`CREATE TABLE`、`ALTER TABLE`、`DROP TABLE`
- 多表 JOIN：`INNER JOIN`、`LEFT JOIN`、`CROSS JOIN`
- 子查询和 CTE：`WITH ... AS (...)`
- 字符串中的变量：`'SELECT * FROM ${TABLE_NAME}'`
- SQL 中的变量：`SELECT * FROM ${DB_NAME}.${TABLE_NAME}`
- 内置函数调用
- 注释（单行 `--` 和块 `/* */`）
- 数字和操作符
- 方言特有语法

---

## 发布到 VS Code Marketplace

```bash
# 创建发布者（仅首次）
vsce create-publisher <publisher-name>

# 登录
vsce login <publisher-name>

# 发布
vsce publish

# 发布并指定版本
vsce publish minor  # 0.1.0 → 0.2.0
vsce publish patch  # 0.1.0 → 0.1.1
```

---

## 常见问题

### 高亮不生效？

1. 确认文件扩展名正确（`.tdhsql`、`.tdh.sql`、`.gaussql`、`.gauss.sql`）
2. 手动切换语言模式：`Ctrl+K M` → 选择对应语言
3. 检查语法文件 JSON 是否合法
4. 重新加载 VS Code 窗口

### 如何添加新的 SQL 方言？

1. 在 `syntaxes/` 下创建新的 `.tmLanguage.json` 文件
2. 在 `package.json` 的 `contributes.languages` 和 `contributes.grammars` 中注册

### 正则表达式调试技巧

在 VS Code 中按 `Ctrl+Shift+P` → `Developer: Inspect Editor Tokens and Scopes`，点击任意文本即可查看它匹配到的 Token 作用域，方便调试正则是否正确。
