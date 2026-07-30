/**
 * 统一日志输出模块
 *
 * 使用 VS Code OutputChannel 输出日志，方便用户查看扩展运行状态。
 * 通过命令面板 "SQL Dialect Highlight: 显示日志" 可打开日志面板。
 */
'use strict';

const vscode = require('vscode');

/** @type {vscode.OutputChannel} */
let _channel = null;

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
let _level = LEVELS.INFO;

/**
 * 初始化日志通道
 */
function init(context) {
    if (!_channel) {
        _channel = vscode.window.createOutputChannel('SQL Dialect Highlight', { log: true });
        context.subscriptions.push(_channel);

        // 读取配置中的日志级别
        const config = vscode.workspace.getConfiguration('sqlDialectHighlight');
        const configLevel = config.get('logLevel', 'info');
        setLevel(configLevel);

        // 监听配置变更
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('sqlDialectHighlight.logLevel')) {
                    const newLevel = vscode.workspace.getConfiguration('sqlDialectHighlight').get('logLevel', 'info');
                    setLevel(newLevel);
                    info(`日志级别已更新为: ${newLevel}`);
                }
            })
        );

        // 注册"显示日志"命令
        context.subscriptions.push(
            vscode.commands.registerCommand('sqlDialectHighlight.showLog', () => {
                _channel.show(true);
            })
        );
    }
}

/**
 * 设置日志级别
 */
function setLevel(level) {
    if (typeof level === 'string') {
        _level = LEVELS[level.toUpperCase()] ?? LEVELS.INFO;
    } else {
        _level = level;
    }
}

function timestamp() {
    return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function formatMsg(level, msg, data) {
    const ts = timestamp();
    const prefix = `[${ts}] [${level}]`;
    if (data !== undefined) {
        if (typeof data === 'object') {
            try { return `${prefix} ${msg} ${JSON.stringify(data)}`; } catch { }
        }
        return `${prefix} ${msg} ${data}`;
    }
    return `${prefix} ${msg}`;
}

function log(level, msg, data) {
    if (_level > LEVELS[level]) return;
    if (!_channel) {
        console.log(formatMsg(level, msg, data));
        return;
    }
    _channel.appendLine(formatMsg(level, msg, data));
}

function debug(msg, data) { log('DEBUG', msg, data); }
function info(msg, data) { log('INFO', msg, data); }
function warn(msg, data) { log('WARN', msg, data); }
function error(msg, data) { log('ERROR', msg, data); }

module.exports = { init, setLevel, debug, info, warn, error, LEVELS };
