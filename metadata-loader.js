/**
 * .metadata CSV 数据字典加载器
 *
 * 支持的 CSV 文件（在 .metadata/ 目录下）：
 *   tables.csv   — database,schema,table_name,type,description
 *   columns.csv  — database,schema,table_name,column_name,data_type,nullable,default_value,description
 *
 * type 字段可选值: TABLE, VIEW, TEMP TABLE 等
 * 所有字段均按 CSV 标准解析（支持引号包裹、引号转义、换行等）
 */
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 解析 CSV 行为 token 数组
 * 支持: 引号包裹字段、双引号转义 ""、字段内含逗号/换行
 */
function parseCSVLine(line) {
    const tokens = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuote) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    cur += '"'; i++;  // 转义双引号
                } else {
                    inQuote = false;
                }
            } else {
                cur += ch;
            }
        } else {
            if (ch === '"') {
                inQuote = true;
            } else if (ch === ',') {
                tokens.push(cur.trim());
                cur = '';
            } else {
                cur += ch;
            }
        }
    }
    tokens.push(cur.trim());
    return tokens;
}

/**
 * 读取 CSV 文件，返回 { headers: string[], rows: object[] }
 */
function readCSV(filePath) {
    if (!fs.existsSync(filePath)) return { headers: [], rows: [] };
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = parseCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const vals = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] !== undefined ? vals[idx] : ''; });
        rows.push(row);
    }
    return { headers, rows };
}

/**
 * 递归查找工作区中的 .metadata 目录
 * 返回找到的第一个目录路径，或 null
 */
function findMetadataDir(workspaceFolder) {
    if (!workspaceFolder) return null;

    function search(dir, depth) {
        if (depth > 3) return null;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
        for (const e of entries) {
            if (e.name === '.metadata' && e.isDirectory()) {
                return path.join(dir, '.metadata');
            }
        }
        for (const e of entries) {
            if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
                const found = search(path.join(dir, e.name), depth + 1);
                if (found) return found;
            }
        }
        return null;
    }
    return search(workspaceFolder, 0);
}

/**
 * 检测 CSV 是否有更新（基于文件 mtime 缓存）
 */
let _cache = null;
let _cacheMtime = {};
function isCacheStale(metadataDir) {
    const files = ['tables.csv', 'columns.csv'];
    for (const f of files) {
        const fp = path.join(metadataDir, f);
        let mtime = 0;
        try { mtime = fs.statSync(fp).mtimeMs; } catch { mtime = -1; }
        if (_cacheMtime[f] !== mtime) return true;
    }
    return false;
}

/**
 * 加载数据字典并缓存
 * 返回 { tables: Map<key, info>, columns: Map<tableKey, column[]> }
 */
function loadMetadata(workspaceFolder) {
    const metadataDir = findMetadataDir(workspaceFolder);
    if (!metadataDir) return { tables: new Map(), columns: new Map() };

    // 缓存检查
    if (_cache && !isCacheStale(metadataDir)) return _cache;

    const tablesMap = new Map();
    const columnsMap = new Map();

    // 读取 tables.csv
    const { rows: tableRows } = readCSV(path.join(metadataDir, 'tables.csv'));
    for (const row of tableRows) {
        const key = row.table_name ? row.table_name.toLowerCase() : '';
        if (!key) continue;
        tablesMap.set(key, {
            database: row.database || '',
            schema: row.schema || '',
            table_name: row.table_name,
            type: (row.type || 'TABLE').toUpperCase(),
            description: row.description || '',
        });
        // 初始化 columnsMap 条目
        if (!columnsMap.has(key)) columnsMap.set(key, []);
    }

    // 读取 columns.csv
    const { rows: colRows } = readCSV(path.join(metadataDir, 'columns.csv'));
    for (const row of colRows) {
        const tableKey = row.table_name ? row.table_name.toLowerCase() : '';
        if (!tableKey) continue;
        if (!columnsMap.has(tableKey)) columnsMap.set(tableKey, []);
        columnsMap.get(tableKey).push({
            column_name: row.column_name || '',
            data_type: row.data_type || '',
            nullable: (row.nullable || 'YES').toUpperCase() === 'YES',
            default_value: row.default_value || '',
            description: row.description || '',
            table_name: row.table_name,
            schema: row.schema || '',
            database: row.database || '',
        });
    }

    // 更新缓存
    _cache = { tables: tablesMap, columns: columnsMap, metadataDir };
    const files = ['tables.csv', 'columns.csv'];
    for (const f of files) {
        const fp = path.join(metadataDir, f);
        try { _cacheMtime[f] = fs.statSync(fp).mtimeMs; } catch { _cacheMtime[f] = -1; }
    }
    return _cache;
}

/**
 * 失活时清除缓存
 */
function clearCache() {
    _cache = null;
    _cacheMtime = {};
}

module.exports = { loadMetadata, clearCache, findMetadataDir, readCSV };
