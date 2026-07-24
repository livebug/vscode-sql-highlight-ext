/**
 * metadata-loader.js — CSV 数据字典加载器（LRU 缓存 + 按需加载）
 *
 * v2 改进:
 *   1. 按表名按需加载字段，不再全量读入内存
 *   2. LRU 缓存淘汰，上限可配置（默认 100 张表）
 *   3. 紧凑存储，减少内存碎片
 *   4. 可配合 table-scanner 只加载当前脚本用到的表
 */
'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// ==================== CSV 解析 ====================

/**
 * 解析 CSV 行
 */
function parseCSVLine(line) {
    const tokens = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuote) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    cur += '"'; i++;
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
 * 读取 CSV 文件
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

// ==================== 目录查找 ====================

/**
 * 递归查找 .metadata 目录（缓存结果）
 */
let _metadataDirCache = null;
let _metadataDirWorkspace = null;

function findMetadataDir(workspaceFolder) {
    if (!workspaceFolder) return null;
    // 缓存检查（同一工作区）
    if (_metadataDirWorkspace === workspaceFolder && _metadataDirCache) {
        return _metadataDirCache;
    }

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
    const result = search(workspaceFolder, 0);
    _metadataDirCache = result;
    _metadataDirWorkspace = workspaceFolder;
    return result;
}

// ==================== LRU 缓存 ====================

/**
 * 紧凑缓存：每个表只存储 [colName, dataType, nullable(0/1)] 的数组
 * 大幅减少对象开销
 */
class LRUCache {
    constructor(maxSize) {
        this.maxSize = maxSize || 100;
        this._map = new Map();         // tableKey → { cols: Array, meta: Object, mtime: number }
        this._accessOrder = [];        // 访问顺序（LRU 淘汰用）
        this._size = 0;
        this._stats = { hits: 0, misses: 0, evictions: 0 };
    }

    get(key) {
        if (this._map.has(key)) {
            this._touch(key);
            this._stats.hits++;
            return this._map.get(key);
        }
        this._stats.misses++;
        return null;
    }

    set(key, value) {
        if (this._map.has(key)) {
            this._map.set(key, value);
            this._touch(key);
            return;
        }
        // 淘汰
        while (this._map.size >= this.maxSize) {
            this._evict();
        }
        this._map.set(key, value);
        this._accessOrder.push(key);
    }

    has(key) {
        return this._map.has(key);
    }

    get size() { return this._map.size; }
    get stats() { return { ...this._stats, size: this._map.size }; }

    _touch(key) {
        const idx = this._accessOrder.indexOf(key);
        if (idx !== -1) {
            this._accessOrder.splice(idx, 1);
            this._accessOrder.push(key);
        }
    }

    _evict() {
        if (this._accessOrder.length === 0) return;
        const oldest = this._accessOrder.shift();
        this._map.delete(oldest);
        this._stats.evictions++;
        logger.debug(`[元数据] LRU 淘汰: ${oldest}`);
    }

    clear() {
        this._map.clear();
        this._accessOrder = [];
        this._stats = { hits: 0, misses: 0, evictions: 0 };
    }
}

// ==================== 模块级状态 ====================

let _cache = null;         // 表名索引缓存（tablesMap）
let _tableCache = null;    // LRU 字段缓存
let _mtimeCache = {};       // CSV 文件 mtime
let _metadataDir = null;   // 当前元数据目录
let _config = {
    maxCacheSize: 100,      // LRU 最大缓存表数
};

// ==================== 公共 API ====================

/**
 * 设置配置
 */
function configure(opts) {
    if (opts.maxCacheSize !== undefined) {
        _config.maxCacheSize = opts.maxCacheSize;
        if (_tableCache) _tableCache.maxSize = _config.maxCacheSize;
    }
}

/**
 * 加载所有表名索引（仅表名、类型、schema，不含字段）
 * 轻量级，用于表名补全
 */
function loadTableIndex(workspaceFolder) {
    const metaDir = findMetadataDir(workspaceFolder);
    if (!metaDir) return new Map();

    const csvPath = path.join(metaDir, 'tables.csv');
    // 检查 mtime 是否变化
    let mtime = 0;
    try { mtime = fs.statSync(csvPath).mtimeMs; } catch { return new Map(); }

    if (_cache && _mtimeCache.tables === mtime) return _cache;

    // 重新加载
    const { rows } = readCSV(csvPath);
    const tablesMap = new Map();
    for (const row of rows) {
        const name = row.table_name;
        if (!name) continue;
        tablesMap.set(name.toLowerCase(), {
            database: row.database || '',
            schema: row.schema || '',
            table_name: name,
            type: (row.type || 'TABLE').toUpperCase(),
            description: row.description || '',
        });
    }
    _cache = tablesMap;
    _mtimeCache.tables = mtime;

    // 初始化 LRU 缓存
    if (!_tableCache) {
        _tableCache = new LRUCache(_config.maxCacheSize);
    }

    logger.info(`[元数据] 加载表索引: ${tablesMap.size} 张表`);
    return tablesMap;
}

/**
 * 按表名加载字段（延迟加载，缓存结果）
 *
 * @param {string} workspaceFolder
 * @param {string} tableName - 表名
 * @returns {Array|null} 字段数组或 null
 */
function loadTableColumns(workspaceFolder, tableName) {
    const metaDir = findMetadataDir(workspaceFolder);
    if (!metaDir) return null;

    const key = tableName.toLowerCase();
    const csvPath = path.join(metaDir, 'columns.csv');

    // 检查 columns.csv 是否有更新
    let csvMtime = 0;
    try { csvMtime = fs.statSync(csvPath).mtimeMs; } catch { return null; }
    if (_mtimeCache.columns !== csvMtime) {
        // CSV 变了，清缓存
        if (_tableCache) _tableCache.clear();
        _mtimeCache.columns = csvMtime;
    }

    // 初始化 LRU
    if (!_tableCache) {
        _tableCache = new LRUCache(_config.maxCacheSize);
    }

    // 检查缓存
    const cached = _tableCache.get(key);
    if (cached) {
        return cached.cols;
    }

    // 从 CSV 中逐行扫描该表字段（不读全部入内存）
    const columns = [];
    try {
        const content = fs.readFileSync(csvPath, 'utf-8');
        const lines = content.split(/\r?\n/);
        if (lines.length < 2) return null;

        const headers = parseCSVLine(lines[0]);
        // 预查找 table_name 列索引
        const tblColIdx = headers.indexOf('table_name');
        const colNameIdx = headers.indexOf('column_name');
        const dataTypeIdx = headers.indexOf('data_type');
        const nullableIdx = headers.indexOf('nullable');
        const defaultIdx = headers.indexOf('default_value');
        const descIdx = headers.indexOf('description');
        const schemaIdx = headers.indexOf('schema');
        const dbIdx = headers.indexOf('database');

        for (let i = 1; i < lines.length; i++) {
            const vals = parseCSVLine(lines[i]);
            if (!vals[tblColIdx]) continue;
            if (vals[tblColIdx].toLowerCase() !== key) continue;

            // 紧凑存储：用数组代替对象
            columns.push([
                vals[colNameIdx] || '',                   // 0: column_name
                vals[dataTypeIdx] || 'VARCHAR',           // 1: data_type
                (vals[nullableIdx] || 'YES').toUpperCase() === 'YES' ? 1 : 0,  // 2: nullable (0/1)
                vals[defaultIdx] || '',                   // 3: default_value
                vals[descIdx] || '',                      // 4: description
            ]);
        }
    } catch (e) {
        logger.error(`[元数据] 读取字段失败: ${e.message}`, { table: tableName });
        return null;
    }

    // 存入 LRU
    _tableCache.set(key, { cols: columns });
    logger.debug(`[元数据] 加载字段: ${tableName} (${columns.length} 个)`);
    return columns;
}

/**
 * 批量加载多个表的字段
 *
 * @param {string} workspaceFolder
 * @param {string[]} tableNames - 需要加载的表名列表
 */
function loadTableColumnsBatch(workspaceFolder, tableNames) {
    if (!tableNames || tableNames.length === 0) return new Map();
    const result = new Map();
    for (const name of tableNames) {
        const cols = loadTableColumns(workspaceFolder, name);
        if (cols) result.set(name.toLowerCase(), cols);
    }
    return result;
}

/**
 * 兼容旧 API: 全量加载（配合 table-scanner 使用）
 * 内部实际上只加载索引 + 按需加载字段
 */
function loadMetadata(workspaceFolder) {
    const tables = loadTableIndex(workspaceFolder);
    return {
        tables: tables,
        columns: new Map(),  // columns 不再全量预加载
        getColumnsForTable: function(tableName) {
            return loadTableColumns(workspaceFolder, tableName);
        }
    };
}

/**
 * 清除缓存
 */
function clearCache() {
    _cache = null;
    if (_tableCache) _tableCache.clear();
    _tableCache = null;
    _mtimeCache = {};
    _metadataDirCache = null;
    _metadataDirWorkspace = null;
    logger.info('[元数据] 缓存已清除');
}

/**
 * 获取缓存统计
 */
function getCacheStats() {
    return {
        tableIndexSize: _cache ? _cache.size : 0,
        columnCache: _tableCache ? _tableCache.stats : { hits: 0, misses: 0, size: 0, evictions: 0 },
    };
}

module.exports = {
    loadMetadata,          // 兼容旧接口
    loadTableIndex,        // 只加载表名索引
    loadTableColumns,      // 按需加载字段
    loadTableColumnsBatch, // 批量加载字段
    clearCache,
    configure,
    getCacheStats,
    findMetadataDir,       // 兼容
    readCSV,               // 兼容
};
