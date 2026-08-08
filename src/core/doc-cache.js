/**
 * doc-cache.js — 文档级解析结果缓存
 *
 * 背景: hover / 定义跳转 / 补全 / 依赖视图 都会对同一文档做全量解析
 * （别名、CREATE TABLE、表引用、CTE 等），且每次请求都会重新计算，大文件下
 * 造成重复扫描。
 *
 * 本模块按 document.uri + document.version 缓存解析结果：
 *   - 文档未变化（version 相同）时直接命中缓存，避免重复扫描
 *   - 文档一旦编辑，version 递增，缓存自动失效重算
 *   - 限制缓存条目数，超出后淘汰最早条目，防止内存无限增长
 */
'use strict';

const MAX_ENTRIES = 50;

/** @type {Map<string, {version: number, value: *}>} */
const cache = new Map();

/**
 * 获取文档解析结果（按 uri + version 缓存）
 *
 * @param {vscode.TextDocument} document
 * @param {Function} compute - (document) => 解析结果
 * @returns {*} 解析结果
 */
function getCached(document, compute) {
    const key = document.uri.toString();
    const entry = cache.get(key);
    if (entry && entry.version === document.version) {
        return entry.value;
    }
    const value = compute(document);
    cache.set(key, { version: document.version, value });

    // 超出上限时淘汰最早的条目（Map 保持插入顺序）
    if (cache.size > MAX_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
    }
    return value;
}

/**
 * 清空缓存（扩展停用时调用）
 */
function clear() {
    cache.clear();
}

module.exports = { getCached, clear };
