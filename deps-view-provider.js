/**
 * deps-view-provider.js — VS Code 侧面板表依赖树视图
 *
 * 注册为 "sqlTableDeps" view，显示当前 SQL 文件中：
 *   - 物理表（按 schema 分组）
 *   - 临时表定义
 *   - 每张表下的字段列表
 *   - 表间引用关系
 */
'use strict';

const vscode = require('vscode');
const logger = require('./logger');

/**
 * 树节点
 */
class DepNode {
    constructor(label, kind, children) {
        this.label = label;
        this.kind = kind;        // 'schema' | 'table' | 'temp' | 'column' | 'ref'
        this.children = children || [];
        this._tooltip = '';
        this._icon = '';
    }

    get icon() { return this._icon; }
    setIcon(v) { this._icon = v; return this; }

    get tooltip() { return this._tooltip; }
    setTooltip(v) { this._tooltip = v; return this; }
}

/**
 * TreeDataProvider 实现
 */
class DepsTreeProvider {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChange.event;
        this._data = [];
        this._currentUri = null;
    }

    /**
     * 刷新数据
     * @param {{ physical: Map, temp: Map, deps: Array }} scanResult - table-scanner 扫描结果
     * @param {string} workspaceFolder - 工作区路径（用于获取字段）
     * @param {Function} getColumnsFn - 获取字段的函数
     */
    refresh(scanResult, workspaceFolder, getColumnsFn) {
        this._data = buildTree(scanResult, workspaceFolder, getColumnsFn);
        this._onDidChange.fire(undefined);
        logger.debug(`[依赖视图] 刷新: ${this._data.length} 个根节点`);
    }

    clear() {
        this._data = [];
        this._onDidChange.fire(undefined);
    }

    getTreeItem(element) {
        const item = new vscode.TreeItem(element.label);
        item.tooltip = element.tooltip || element.label;

        // 图标
        switch (element.kind) {
            case 'schema':
                item.iconPath = new vscode.ThemeIcon('database');
                item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                break;
            case 'table':
                item.iconPath = new vscode.ThemeIcon('symbol-struct');
                item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                item.contextValue = 'physicalTable';
                break;
            case 'temp':
                item.iconPath = new vscode.ThemeIcon('symbol-method');
                item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                item.contextValue = 'tempTable';
                break;
            case 'column':
                item.iconPath = new vscode.ThemeIcon('symbol-property');
                item.collapsibleState = vscode.TreeItemCollapsibleState.None;
                item.description = element.description || '';
                break;
            case 'ref':
                item.iconPath = new vscode.ThemeIcon('references');
                item.collapsibleState = vscode.TreeItemCollapsibleState.None;
                break;
        }
        return item;
    }

    getChildren(element) {
        if (!element) return this._data;
        return element.children;
    }

    getParent(element) {
        return null; // 暂不支持向上导航
    }
}

/**
 * 构建树结构
 */
function buildTree(scanResult, workspaceFolder, getColumnsFn) {
    const root = [];
    if (!scanResult) return root;

    const { physical, temp, deps } = scanResult;

    // ---- 物理表 ----
    if (physical.size > 0) {
        // 按 schema 分组（schema 从原始表名中解析）
        const schemaGroups = new Map();  // schema → DepNode
        for (const [key, tbl] of physical) {
            const parts = tbl.name.split('.');
            let schema = '(default)';
            let tableName = tbl.name;
            if (parts.length >= 2) {
                schema = parts[parts.length - 2];
                tableName = parts[parts.length - 1];
            }

            if (!schemaGroups.has(schema)) {
                schemaGroups.set(schema, new DepNode(
                    '📁 ' + schema,
                    'schema',
                    []
                ));
            }
            const schemaNode = schemaGroups.get(schema);

            // 查出字段（从 metadata 加载）
            const colChildren = [];
            if (getColumnsFn) {
                const cols = getColumnsFn(key);
                if (cols && cols.length > 0) {
                    for (const col of cols) {
                        const colName = Array.isArray(col) ? col[0] : col.column_name;
                        const colType = Array.isArray(col) ? col[1] : (col.data_type || '');
                        const nullable = Array.isArray(col) ? (col[2] ? 'Y' : 'N') : (col.nullable ? 'Y' : 'N');
                        const colNode = new DepNode(colName, 'column', []);
                        colNode.setTooltip(`${colName}  ${colType}  ${nullable === 'Y' ? '可空' : '不可空'}`);
                        colNode.description = colType;
                        colChildren.push(colNode);
                    }
                }
            }

            // 添加引用关系（作为子节点）
            const refs = deps ? deps.filter(d => d.to.toLowerCase() === key || d.from.toLowerCase() === key) : [];
            for (const ref of refs) {
                const refLabel = ref.from.toLowerCase() === key
                    ? `→ ${ref.to}` : `${ref.from} →`;
                const refNode = new DepNode(refLabel, 'ref', []);
                refNode.setTooltip(`依赖关系: ${ref.from} ${ref.type} ${ref.to}`);
                colChildren.push(refNode);
            }

            const tblNode = new DepNode(tableName, 'table', colChildren);
            tblNode.setTooltip(`${tbl.name} (物理表)`);
            schemaNode.children.push(tblNode);
        }

        for (const [schema, node] of schemaGroups) {
            root.push(node);
        }
    }

    // ---- 临时表 ----
    if (temp.size > 0) {
        const tempRoot = new DepNode('📄 临时表', 'schema', []);
        for (const [key, def] of temp) {
            const colChildren = [];
            if (def.columns && def.columns.length > 0) {
                for (const col of def.columns) {
                    const colNode = new DepNode(col.column_name, 'column', []);
                    colNode.setTooltip(`${col.column_name}  ${col.data_type}  ${col.source === 'inferred' ? '(推断)' : '(显式定义)'}`);
                    colNode.description = col.data_type + (col.source === 'inferred' ? ' *' : '');
                    colChildren.push(colNode);
                }
            } else {
                colChildren.push(new DepNode('(未解析字段)', 'column', []));
            }

            // 引用关系
            for (const ref of deps ? deps.filter(d => d.from.toLowerCase() === key) : []) {
                const refNode = new DepNode(`→ ${ref.to}`, 'ref', []);
                refNode.setTooltip(`数据来源: ${ref.to}`);
                colChildren.push(refNode);
            }

            const tblNode = new DepNode(def.name, 'temp', colChildren);
            tblNode.setTooltip(`${def.name} (${def.isTemp ? '临时表' : '普通表'})`);
            tempRoot.children.push(tblNode);
        }
        root.push(tempRoot);
    }

    // 空状态
    if (root.length === 0) {
        root.push(new DepNode('(当前文件未识别到表引用)', 'ref', []));
    }

    return root;
}

module.exports = { DepsTreeProvider, DepNode, buildTree };
