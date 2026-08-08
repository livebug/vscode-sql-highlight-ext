/**
 * SQL 格式化器 v2
 * 
 * 风格: 逗号优先、AND 对齐、关键字大写、子查询递归格式化、OVER() 保护
 */
'use strict';

const DEFAULTS = { indentSize: 4, maxWidth: 200, commaFirst: true, andAlign: true, keywordCase: 'upper' };

// ======================== 保护/恢复 ========================
let storeV=[], storeC=[], storeS=[], storeO=[], ciV=0, ciC=0, ciS=0, ciO=0;
let storeK=[], ciK=0;   // CASE WHEN 保护存储

function protect(sql) {
    storeV=[]; storeC=[]; storeS=[]; storeO=[]; ciV=0; ciC=0; ciS=0; ciO=0;
    let w = sql;
    w = w.replace(/\$\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, m => { storeV.push(m); return '__V'+(ciV++)+'__'; });
    // 字符串: 支持 SQL 标准 '' 转义，不跨行
    w = w.replace(/'([^'\n]|'')*'/g, m => { storeS.push(m); return '__S'+(ciS++)+'__'; });
    // 行注释: 不捕获尾部 \n（\n 保留在原位，方便后续 standalone 检测和换行处理）
    w = w.replace(/--[^\n]*/g, m => { storeC.push(m); return '__C'+(ciC++)+'__'; });
    w = w.replace(/\/\*[\s\S]*?\*\//g, m => { storeC.push(m); return '__C'+(ciC++)+'__'; });
    return w;
}

function restore(sql) {
    let r = sql;
    storeO.forEach((v,i) => { r = r.replace('__O'+i+'__', uppercase(v.replace(/^\s*\(/, ' ('))); });
    storeS.forEach((v,i) => { r = r.replace('__S'+i+'__', v); });
    storeC.forEach((v,i) => { r = r.replace('__C'+i+'__', v); });
    storeV.forEach((v,i) => { r = r.replace('__V'+i+'__', v); });
    return r;
}

// ======================== OVER 保护 ========================
function protectOver(sql) {
    let r='', i=0;
    while (i < sql.length) {
        const m = sql.slice(i).match(/\bOVER\s*\(/i);
        if (!m) { r += sql.slice(i); break; }
        const parenStart = i + m.index + m[0].indexOf('(');
        r += sql.slice(i, parenStart).replace(/\s+$/, '');
        let d=0, j=parenStart, ok=false;
        for (; j < sql.length; j++) {
            if (sql[j]==='(') d++;
            else if (sql[j]===')') { d--; if (d===0) { ok=true; break; } }
        }
        if (ok) { storeO.push(sql.slice(parenStart, j+1)); r += '__O'+(ciO++)+'__'; i=j+1; }
        else { r += sql.slice(parenStart); break; }
    }
    return r;
}

// ======================== CASE WHEN 保护 ========================
// 把 CASE...END（含嵌套，深度配对）整体替换为 __K 占位符。
// 前提：字符串/注释已保护为占位符，文本已大写。
function protectCase(sql) {
    storeK=[]; ciK=0;
    let r='', i=0;
    while (i < sql.length) {
        const m = sql.slice(i).match(/\bCASE\b/);
        if (!m) { r += sql.slice(i); break; }
        const caseStart = i + m.index;
        // 深度配对找匹配的 END（忽略括号，嵌套 CASE 整体包含）
        let caseDepth = 1, j = caseStart + 4, endPos = -1;
        while (j < sql.length) {
            const e = sql.slice(j).match(/\b(CASE|END)\b/);
            if (!e) break;
            const kw = e[0].toUpperCase();
            const idx = j + e.index;
            if (kw === 'CASE') caseDepth++;
            else { caseDepth--; if (caseDepth === 0) { endPos = idx; break; } }
            j = idx + kw.length;
        }
        if (endPos === -1) { r += sql.slice(caseStart); break; }
        r += sql.slice(i, caseStart);
        storeK.push(sql.slice(caseStart, endPos + 3));   // 含 END
        r += '__K' + (ciK++) + '__';
        i = endPos + 3;
    }
    return r;
}

// ======================== 关键字 ========================
const KEYWORDS = require('./keywords');

function uppercase(sql) {
    return sql.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (m) => {
        if (/^__[VCSO]\d+__$/.test(m)) return m;
        const u = m.toUpperCase(); return KEYWORDS.has(u) ? u : m;
    });
}

// ======================== JOIN 对齐追踪 ========================
let lastJoinEndCol = 0;  // 上一个 JOIN 关键字结束列号（用于 ON/AND 右对齐）

// ======================== 从句拆分 ========================
const MAIN_RE = /\b(SELECT|FROM|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+OUTER\s+JOIN|FULL\s+JOIN|CROSS\s+JOIN|NATURAL\s+JOIN|JOIN|ON|UNION|UNION\s+ALL|INTERSECT|EXCEPT|MINUS|DELETE|INSERT|INTO|UPDATE|SET)\b/gi;

function formatTop(sql, opts) {
    const segs = splitByClauses(sql);
    if (segs.length === 0) return sql;
    const parts = segs.map(s => formatSegment(s, opts)).filter(Boolean);

    // 统一规则合并：连续的单行、非缩进、非 UNION、非注释段 → 合并到 ≤ maxWidth 字符
    const mergeLimit = opts.maxWidth || 150;
    const lines = [];
    let cur = '';

    for (const part of parts) {
        const isMulti = part.includes('\n');
        const isSubClause = /^\s/.test(part);         // 缩进子句（JOIN/ON等）
        const isUnion = /^(UNION|INTERSECT|EXCEPT|MINUS)\b/i.test(part.trim());
        const hasComment = part.includes('__C') || part.includes('__K');  // 注释/CASE 占位符不可合并

        if (isMulti || isSubClause || isUnion || hasComment) {
            if (cur) { lines.push(cur); cur = ''; }
            lines.push(part);
            continue;
        }

        const candidate = cur ? cur + ' ' + part : part;
        if (candidate.length <= mergeLimit) {
            cur = candidate;
        } else {
            if (cur) lines.push(cur);
            cur = part;
        }
    }
    if (cur) lines.push(cur);
    return lines.join('\n');
}

function splitByClauses(sql) {
    const segs = []; let last=0, kw='', m;
    const re = new RegExp(MAIN_RE.source, 'gi');
    while ((m = re.exec(sql)) !== null) {
        if (depthAt(sql, last, m.index) !== 0) continue;
        if (last < m.index && kw) segs.push({kw, content: sql.slice(last, m.index).trim()});
        else if (last < m.index && !kw) { const pre = sql.slice(last, m.index).trim(); if (pre) segs.push({kw:'', content:pre}); }
        kw = m[1].toUpperCase(); last = m.index + m[0].length;
    }
    if (last < sql.length && kw) segs.push({kw, content: sql.slice(last).trim()});
    // 合并 INSERT INTO / DELETE FROM
    for (let i=0; i<segs.length-1; i++) {
        if ((segs[i].kw==='INSERT' && segs[i+1].kw==='INTO') || (segs[i].kw==='DELETE' && segs[i+1].kw==='FROM')) {
            segs[i].content = (segs[i].content+' '+segs[i+1].kw+' '+segs[i+1].content).trim(); segs.splice(i+1,1);
        }
    }
    return segs;
}

function depthAt(sql, from, to) { let d=0; for (let i=from; i<to; i++) { if (sql[i]==='(') d++; else if (sql[i]===')') d--; } return d; }

function formatSegment(seg, opts) {
    const {kw, content} = seg; if (!kw) return content;
    if ((kw==='INSERT'||kw==='DELETE') && /^(INTO|FROM)\b/i.test(content)) return kw+' '+content;
    const CI = ' '.repeat(opts.indentSize);
    switch (kw) {
        case 'SELECT': return formatCommaList('SELECT', content, opts);
        case 'FROM': return 'FROM '+formatSubqueryContent(content, opts);
        case 'WHERE': case 'HAVING': return formatAndList(kw, content, CI, opts);
        case 'ON': {
            // ON/AND 右对齐到前一个 JOIN 关键字的末尾列
            const endCol = lastJoinEndCol || (CI.length + 4);  // 默认右对齐到 "JOIN"
            const onPad  = ' '.repeat(endCol - 2);   // "ON" 占 2 字符
            const andPad = ' '.repeat(endCol - 3);   // "AND" 占 3 字符
            return formatAndList(onPad + 'ON', content, andPad, opts);
        }
        case 'GROUP BY': case 'ORDER BY': return formatCommaList(kw, content, opts);
        case 'LIMIT': case 'OFFSET': return kw+' '+content;
        default:
            if (kw.includes('JOIN')) {
                lastJoinEndCol = CI.length + kw.length;  // 记录 JOIN 结束列，供 ON 对齐
                const m = content.match(/^(.*?)\bON\b(.+)$/i);
                if (m) return CI+kw+' '+formatSubqueryContent(m[1].trim(),opts)+'\n'+formatAndList(CI+'ON', m[2].trim(), CI+'  ', opts);
                return CI+kw+' '+formatSubqueryContent(content, opts);
            }
            return kw+' '+content;
    }
}

// ======================== 列表格式化 ========================
function formatCommaList(kw, content, opts) {
    let items = splitComma(content).map(s=>s.trim()).filter(Boolean);

    // 拆分 "__C__ field" 为 [__C__, field]，注释独立成行
    const expanded = [];
    for (const item of items) {
        const m = item.match(/^(__C\d+__)\s+(.+)$/);
        if (m) {
            expanded.push(m[1]);  // 注释占位符（restore 后变 -- comment\n）
            expanded.push(m[2]);  // 字段
        } else {
            expanded.push(item);
        }
    }
    items = expanded;

    const hasComment = items.some(s => /^__C\d+__$/.test(s));
    const isSelect = kw === 'SELECT';
    // 短列表单行阈值：默认 ≤80，但受 maxWidth 上限约束
    const singleLineLimit = Math.min(80, opts.maxWidth || 80);

    // 单行判断：
    //   SELECT: 仅 1 个字段且无注释 → 可单行；否则强制多行
    //   ORDER BY / GROUP BY: ≤3 个字段且总长 ≤singleLineLimit → 单行
    if (!hasComment) {
        if (!isSelect) {
            const singleLine = kw + ' ' + items.join(', ');
            if (items.length <= 3 && singleLine.length <= singleLineLimit) return singleLine;
        } else if (items.length <= 1) {
            return kw + ' ' + items.join(', ');
        }
    }

    // 逗号拆分（commaFirst=true 逗号在行首；false 逗号在行尾）
    const INDENT = ' '.repeat(opts.indentSize);
    const lines = [kw];
    let firstField = true;
    for (const item of items) {
        if (/^__C\d+__$/.test(item)) {
            // 纯注释行：独立换行
            lines.push(item);
            firstField = true; // 注释后下一个字段用一级缩进
        } else {
            // 递归展开字段中的子查询
            const formatted = formatSubqueryContent(item, opts);
            if (opts.commaFirst) {
                const prefix = firstField ? INDENT : ' '.repeat(Math.max(0, opts.indentSize - 2)) + ', ';
                lines.push(prefix + formatted);
            } else {
                // 逗号在行尾：给上一行末尾补逗号（字段行之间）
                if (!firstField) {
                    const lastIdx = lines.length - 1;
                    if (!/,\s*$/.test(lines[lastIdx])) lines[lastIdx] += ',';
                }
                lines.push(INDENT + formatted);
            }
            firstField = false;
        }
    }
    return lines.join('\n');
}

function formatAndList(kw, content, andIndent, opts) {
    // andAlign=false: 不强制将 AND/OR 条件拆成多行，保持内联
    if (!opts.andAlign) {
        return kw + ' ' + formatSubqueryContent(content, opts);
    }
    const parts = splitAndOr(content).map(s=>s.trim()).filter(Boolean);
    if (parts.length<=1) return kw + ' ' + formatSubqueryContent(content, opts);
    // 短行捷径：仅当内容本身就短（≤30）且无换行时合并单行
    if (parts.length===2 && !content.includes('\n') && (kw+' '+content).length<=30) {
        return kw + ' ' + formatSubqueryContent(content, opts);
    }
    const lines = [];
    for (let i=0; i<parts.length; i++) {
        const partFormatted = formatSubqueryContent(parts[i], opts);
        lines.push(i===0 ? (kw+' '+partFormatted) : (andIndent+'AND '+partFormatted));
    }
    return lines.join('\n');
}

// ======================== 逗号/AND 分割 ========================
function splitComma(text) { const r=[]; let d=0,cur=''; for (const ch of text) { if (ch==='(') d++; else if (ch===')') d--; if (ch===','&&d===0) { r.push(cur); cur=''; } else cur+=ch; } if (cur.trim()) r.push(cur); return r; }

function splitAndOr(text) { return splitAndOrWithOps(text).map(p => p.text); }

// 拆分 AND/OR 并保留连接词（连接词属于其后一段；BETWEEN 的 AND 不拆分）
function splitAndOrWithOps(text) {
    const parts = []; let last = 0; const re = /\b(AND|OR|BETWEEN)\b/gi; let m, inBetween = false;
    let pendingOp = '';
    while ((m = re.exec(text)) !== null) {
        let d = 0; for (let i = last; i < m.index; i++) { if (text[i] === '(') d++; else if (text[i] === ')') d--; }
        if (d === 0) {
            const kw = m[1].toUpperCase();
            if (kw === 'BETWEEN') { inBetween = true; continue; }
            if (inBetween && kw === 'AND') { inBetween = false; continue; }
            const seg = text.slice(last, m.index).trim();
            if (seg) parts.push({ text: seg, op: pendingOp });
            pendingOp = kw;
            last = m.index + m[0].length; inBetween = false;
        }
    }
    const seg = text.slice(last).trim();
    if (seg) parts.push({ text: seg, op: pendingOp });
    return parts;
}

// 给多行文本的每一行加缩进前缀
function indentBlock(text, pad) {
    return text.split('\n').map(l => pad + l).join('\n');
}

// ======================== 子查询递归 ========================
function formatSubqueryContent(content, opts) {
    let r='', i=0;
    const INDENT = ' '.repeat(opts.indentSize);
    while (i < content.length) {
        const oi = content.indexOf('(', i);
        if (oi===-1) { r+=content.slice(i); break; }
        r += content.slice(i, oi);
        let d=0, j=oi, ok=false;
        for (; j<content.length; j++) { if (content[j]==='(') d++; else if (content[j]===')') { d--; if (d===0) { ok=true; break; } } }
        if (!ok) { r+=content.slice(oi); break; }
        const inner = content.slice(oi+1, j);
        if (/^\s*(SELECT|WITH)\b/i.test(inner)) {
            const formatted = formatTop(inner, opts);
            r += '(\n' + formatted.split('\n').map(l => INDENT + l).join('\n') + '\n)';
        } else {
            r += '(' + formatInParenContent(inner, opts) + ')';
        }
        i = j+1;
    }
    return r;
}

/**
 * 对括号内的非子查询内容递归展开子查询（用于 WHERE/SELECT/HAVING 中）
 */
function formatInParenContent(content, opts) {
    // 递归处理内容中可能出现的内嵌子查询
    let r = '', i = 0;
    const INDENT = ' '.repeat(opts.indentSize);
    while (i < content.length) {
        const oi = content.indexOf('(', i);
        if (oi === -1) { r += content.slice(i); break; }
        r += content.slice(i, oi);
        let d = 0, j = oi, ok = false;
        for (; j < content.length; j++) {
            if (content[j] === '(') d++;
            else if (content[j] === ')') { d--; if (d === 0) { ok = true; break; } }
        }
        if (!ok) { r += content.slice(oi); break; }
        const inner = content.slice(oi + 1, j);
        if (/^\s*(SELECT|WITH)\b/i.test(inner)) {
            const formatted = formatTop(inner, opts);
            r += '(\n' + formatted.split('\n').map(l => INDENT + l).join('\n') + '\n)';
        } else {
            r += '(' + formatInParenContent(inner, opts) + ')';
        }
        i = j + 1;
    }
    return r;
}

// ======================== 主入口 + 后处理 ========================
function formatSQL(sql, options) {
    const opts = Object.assign({}, DEFAULTS, options||{});
    // 按 ; 分割语句，逐条格式化，防止多语句合并
    const stmts = splitSQLStatements(sql);
    if (stmts.length <= 1) {
        return formatSingleSQL(sql, opts);
    }
    const formattedStmts = stmts.map(stmt => formatSingleSQL(stmt, opts)).filter(Boolean);
    let result = formattedStmts.join(';\n\n');
    result = postProcess(result);
    return result;
}

/**
 * 按 ; 分割多条 SQL 语句，保留分号前的注释归属
 */
function splitSQLStatements(sql) {
    // 使用保护机制来正确分割
    const p = protect(sql);
    // 在 ; 处分隔
    const parts = p.split(/;/);
    const stmts = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part) continue;
        stmts.push(restore(part));
    }
    return stmts;
}

function formatSingleSQL(sql, options) {
    const opts = Object.assign({}, DEFAULTS, options||{});
    let w = protect(sql);
    // 独行注释占位符补回尾部 \n（注释保护时被吞掉）
    w = w.replace(/__C(\d+)__/g, (match, num) => {
        const c = storeC[parseInt(num)];
        return (c && c.endsWith('\n')) ? match + '\n' : match;
    });
    // 横向空白压缩，但保留换行（注释边界需要）
    w = w.replace(/[ \t]+/g, ' ').trim();
    w = uppercase(w);
    w = protectOver(w);
    w = protectCase(w);          // CASE...END → __K 占位符
    w = formatTop(w, opts);
    w = restore(w);
    w = expandAllCases(w, opts); // __K → 格式化好的多行 CASE 块
    w = restore(w);              // 恢复块内残留的字符串/注释/OVER 占位符
    return w;
}

function postProcess(sql) {
    // 先保护注释，防止 postProcess 的正则误伤注释中的分号
    const pcStore = [], pcStrings = [];
    let pci = 0, psi = 0;
    // 保护字符串
    sql = sql.replace(/'([^'\n]|'')*'/g, m => { pcStrings.push(m); return '__PS'+(psi++)+'__'; });
    // 保护行注释和块注释
    sql = sql.replace(/--[^\n]*/g, m => { pcStore.push(m); return '__PC'+(pci++)+'__'; });
    sql = sql.replace(/\/\*[\s\S]*?\*\//g, m => { pcStore.push(m); return '__PC'+(pci++)+'__'; });

    sql = sql.replace(/\*\/\s+(\S)/g, '*/\n$1');
    sql = sql.replace(/\n\s*;/g, ';');   // 分号提到前行
    sql = sql.replace(/\s+;/g, ';');
    sql = sql.replace(/;(\S)/g, ';\n$1');
    sql = sql.replace(/[ \t]+$/gm, '');
    // 语句间空行
    sql = sql.replace(/;(\s*\n\s*)(?=\S)/g, ';\n\n');
    sql = sql.replace(/\n{3,}/g, '\n\n');

    // 恢复注释和字符串
    pcStore.forEach((v, i) => { sql = sql.replace('__PC'+i+'__', v); });
    pcStrings.forEach((v, i) => { sql = sql.replace('__PS'+i+'__', v); });
    return sql;
}

// ======================== CASE WHEN 格式化 ========================
// formatCaseBlock 返回 { inline: string }（单行）或 { first: string, rest: string[] }（多行）。
// rest 中的行是相对 "CASE 起始列" 的缩进行（END 相对缩进 0，与 CASE 对齐）。

function formatCaseBlock(caseText, opts) {
    const IND = ' '.repeat(opts.indentSize || 4);
    // 1) 内层嵌套 CASE 保护为 __L
    const { text: t, store: nested } = protectNestedCases(caseText);
    // 2) 解析分支
    const { expr, branches, elseVal } = splitCaseBranches(t);
    const header = expr ? 'CASE ' + expr : 'CASE';

    // 3) 单行判断：无嵌套、无子查询、无行注释（防注释吞后文）、分支 ≤2、总长 ≤80 → 一行
    const hasNested = nested.length > 0;
    const hasSubquery = /\(\s*(SELECT|WITH)\b/i.test(caseText);
    const hasLineComment = /__C\d+__/.test(caseText);   // 行注释必须落到行尾，强制多行
    const inlineLen = header + ' ' +
        branches.map(b => 'WHEN ' + b.cond + ' THEN ' + b.val).join(' ') +
        (elseVal !== null ? ' ELSE ' + (elseVal || 'NULL') : '') + ' END';
    const inlineLimit = Math.min(80, opts.maxWidth || 80);
    if (!hasNested && !hasSubquery && !hasLineComment && branches.length <= 2 && inlineLen.length <= inlineLimit) {
        return { inline: inlineLen };
    }

    // 4) 多行：先对 cond/val 做子查询展开（__L 由 expandBlockLine 统一恢复）
    const sub = (s) => s ? formatSubqueryContent(s, opts) : s;
    const branchInfos = branches.map(b => {
        const cond = sub(b.cond);
        const val = sub(b.val);
        const multiCond = splitAndOr(cond).length > 1;
        const single = 'WHEN ' + cond + ' THEN ' + val;
        const singleOK = !multiCond && single.length <= 120 && !val.includes('\n') && !cond.includes('\n');
        return { cond, val, multiCond, single, singleOK, width: ('WHEN ' + cond).length };
    });

    const lines = [header];
    const allSingle = branchInfos.every(x => x.singleOK);
    if (allSingle) {
        // 全部分支单行 → THEN 列对齐
        const condMax = Math.max(...branchInfos.map(x => x.width));
        for (const b of branchInfos) {
            const pad = Math.max(condMax - b.width + 1, 1);
            lines.push(IND + 'WHEN ' + b.cond + ' '.repeat(pad) + 'THEN ' + b.val);
        }
    } else {
        for (const b of branchInfos) {
            if (b.singleOK) {
                lines.push(IND + b.single);
                continue;
            }
            if (b.multiCond) {
                // WHEN 内多条件：AND/OR 与 WHEN 对齐拆行
                const parts = splitAndOrWithOps(b.cond);
                lines.push(IND + 'WHEN ' + parts[0].text);
                for (let k = 1; k < parts.length; k++) lines.push(IND + parts[k].op + ' ' + parts[k].text);
                if (b.val.includes('\n')) {
                    lines.push(IND + 'THEN');
                    lines.push(indentBlock(b.val, IND + IND));
                } else {
                    lines.push(IND + 'THEN ' + b.val);
                }
                continue;
            }
            // THEN 后值太长（可能含子查询多行）→ 换行缩进
            lines.push(IND + 'WHEN ' + b.cond + ' THEN');
            lines.push(indentBlock(b.val, IND + IND));
        }
    }
    if (elseVal !== null) {
        lines.push(IND + 'ELSE ' + sub(elseVal || 'NULL'));
    }
    lines.push('END');

    // 5) 展开内层嵌套 CASE（__L）
    const finalLines = [];
    for (const l of lines) {
        finalLines.push(...expandBlockLine(l, nested, /__L(\d+)__/g, opts).split('\n'));
    }
    if (finalLines.length === 1) return { inline: finalLines[0] };
    return { first: finalLines[0], rest: finalLines.slice(1) };
}

// 保护内层嵌套 CASE：text 以 CASE 开头，把内部嵌套的 CASE...END 保护为 __Ln__
function protectNestedCases(text) {
    const store = [];
    let r = 'CASE', i = 4, caseDepth = 1;
    while (i < text.length) {
        const m = text.slice(i).match(/\b(CASE|END)\b/);
        if (!m) { r += text.slice(i); break; }
        const kw = m[0].toUpperCase();
        const idx = i + m.index;
        if (kw === 'CASE') {
            // 找到该内层 CASE 的匹配 END
            const innerStart = idx;
            let d2 = 1, j2 = idx + 4, end2 = -1;
            while (j2 < text.length) {
                const e = text.slice(j2).match(/\b(CASE|END)\b/);
                if (!e) break;
                const k2 = e[0].toUpperCase(); const i2 = j2 + e.index;
                if (k2 === 'CASE') d2++;
                else { d2--; if (d2 === 0) { end2 = i2; break; } }
                j2 = i2 + k2.length;
            }
            if (end2 !== -1) {
                r += text.slice(i, innerStart);   // 保留内层 CASE 之前的内容
                r += '__L' + store.length + '__';
                store.push(text.slice(innerStart, end2 + 3));
                i = end2 + 3;
            } else {
                r += text.slice(idx, idx + 4);
                i = idx + 4;
            }
            continue;
        }
        // END（自身链上的 END）
        r += text.slice(i, idx + 3);
        i = idx + 3;
        caseDepth--;
        if (caseDepth === 0) break;
    }
    return { text: r, store };
}

// 查找目标关键字（跳过括号内），返回 {kw, index}
// 用全局正则迭代候选位置 + 光标累积括号深度，避免逐字符 slice+match（O(n²) → O(n)）
function findKwIn(t, from, re) {
    let flags = re.flags;
    if (flags.indexOf('g') < 0) flags += 'g';
    const gre = new RegExp(re.source, flags);
    gre.lastIndex = from;
    let depth = 0, cursor = from, m;
    while ((m = gre.exec(t)) !== null) {
        // 累积从 cursor 到匹配位置的括号深度（每字符只访问一次）
        for (let i = cursor; i < m.index; i++) {
            if (t[i] === '(') depth++;
            else if (t[i] === ')') depth = Math.max(0, depth - 1);
        }
        cursor = m.index + m[0].length;
        if (depth === 0) return { kw: m[0].toUpperCase(), index: m.index };
        gre.lastIndex = cursor;
    }
    return null;
}

// 解析 CASE 分支（内层 CASE 已保护为 __L）：返回 {expr, branches, elseVal}
function splitCaseBranches(t) {
    const firstWhen = findKwIn(t, 4, /\bWHEN\b/);
    if (!firstWhen) return { expr: '', branches: [], elseVal: null };
    const expr = t.slice(4, firstWhen.index).trim();
    const branches = [];
    let pos = firstWhen.index, elseVal = null;
    for (;;) {
        const then = findKwIn(t, pos + 4, /\bTHEN\b/);
        if (!then) break;
        const cond = t.slice(pos + 4, then.index).trim();
        const nxt = findKwIn(t, then.index + 4, /\b(WHEN|ELSE|END)\b/);
        if (!nxt) break;
        const val = t.slice(then.index + 4, nxt.index).trim();
        branches.push({ cond, val });
        if (nxt.kw === 'WHEN') { pos = nxt.index; continue; }
        if (nxt.kw === 'ELSE') {
            const endAt = findKwIn(t, nxt.index + 4, /\bEND\b/);
            elseVal = endAt ? t.slice(nxt.index + 4, endAt.index).trim() : null;
            break;
        }
        break; // END
    }
    return { expr, branches, elseVal };
}

// 把一行中的占位符展开为 CASE 块；多行时后续行按占位符所在列缩进
function expandBlockLine(line, store, re, opts) {
    re.lastIndex = 0;
    if (!re.test(line)) return line;
    re.lastIndex = 0;
    let out = '', last = 0, m;
    while ((m = re.exec(line)) !== null) {
        out += line.slice(last, m.index);
        const block = formatCaseBlock(store[+m[1]], opts);
        if (block.inline) {
            out += block.inline;
        } else {
            out += block.first;
            for (const l of block.rest) out += '\n' + ' '.repeat(m.index) + l;
        }
        last = m.index + m[0].length;
    }
    out += line.slice(last);
    return out;
}

// 对最终 SQL 逐行展开 __K 占位符
function expandAllCases(sql, opts) {
    if (!sql.includes('__K')) return sql;
    return sql.split('\n')
        .map(l => expandBlockLine(l, storeK, /__K(\d+)__/g, opts))
        .join('\n');
}

module.exports = { formatSQL };
