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
    // 迭代到无占位符为止：支持任意深度嵌套（块注释内嵌行注释、注释内嵌字符串/变量等），
    // 修复"外层恢复后才暴露内层占位符，但索引已过"导致的占位符泄漏
    for (let pass = 0; pass < 10; pass++) {
        let changed = false;
        const doReplace = (token, val) => {
            if (r.indexOf(token) !== -1) { r = r.split(token).join(val); changed = true; }
        };
        storeC.forEach((v, i) => doReplace('__C' + i + '__', v));
        storeS.forEach((v, i) => doReplace('__S' + i + '__', v));
        storeV.forEach((v, i) => doReplace('__V' + i + '__', v));
        storeO.forEach((v, i) => doReplace('__O' + i + '__', uppercase(v.replace(/^\s*\(/, ' ('))));
        if (!changed) break;
    }
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
        // 限定标识符（如 t.case）不是 CASE 关键字，跳过
        if (sql[caseStart - 1] === '.') { r += sql.slice(i, caseStart + 4); i = caseStart + 4; continue; }
        // 深度配对找匹配的 END（忽略括号，嵌套 CASE 整体包含）
        let caseDepth = 1, j = caseStart + 4, endPos = -1;
        while (j < sql.length) {
            const e = sql.slice(j).match(/\b(CASE|END)\b/);
            if (!e) break;
            const kw = e[0].toUpperCase();
            const idx = j + e.index;
            // t.CASE / t.END 之类的限定标识符，不参与配对
            if (sql[idx - 1] === '.') { j = idx + kw.length; continue; }
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
const MAIN_RE = /\b(SELECT|FROM|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+OUTER\s+JOIN|FULL\s+JOIN|CROSS\s+JOIN|NATURAL\s+JOIN|JOIN|ON|UNION|UNION\s+ALL|INTERSECT|EXCEPT|MINUS|DELETE|INSERT|INTO|UPDATE|SET|WITH|CREATE|MERGE)\b/gi;

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
        // GROUP BY / ORDER BY / HAVING / LIMIT / OFFSET / SET 各自独立成行，不与上一段合并
        const isClauseHead = /^(GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|SET)\b/i.test(part.trim());

        if (isMulti || isSubClause || isUnion || hasComment || isClauseHead) {
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
    let mergeMode = false;   // MERGE 内部不再按从句拆分
    const re = new RegExp(MAIN_RE.source, 'gi');
    while ((m = re.exec(sql)) !== null) {
        if (depthAt(sql, last, m.index) !== 0) continue;
        if (mergeMode) continue;
        const kwUpper = m[1].toUpperCase();
        // CREATE TABLE 存储子句的 "INTO n BUCKETS" 不视为从句
        if (kwUpper === 'INTO' && /\d+\s+BUCKETS?/i.test(sql.slice(m.index + 4, m.index + 40))) continue;
        if (last < m.index && kw) segs.push({kw, content: sql.slice(last, m.index).trim()});
        else if (last < m.index && !kw) { const pre = sql.slice(last, m.index).trim(); if (pre) segs.push({kw:'', content:pre}); }
        kw = kwUpper; last = m.index + m[0].length;
        if (kwUpper === 'MERGE') mergeMode = true;
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
        case 'UPDATE': return 'UPDATE '+formatSubqueryContent(content, opts);
        case 'SET': {
            // UPDATE 的 SET：赋值列表逗号优先逐行，不与 UPDATE 合并
            const items = splitComma(content).map(s=>s.trim()).filter(Boolean);
            if (items.length <= 1) return 'SET '+items[0];
            const lines = ['SET '+formatSubqueryContent(items[0], opts)];
            const pad = ' '.repeat(Math.max(0, opts.indentSize - 2)) + ', ';
            for (let i=1; i<items.length; i++) lines.push(pad+formatSubqueryContent(items[i], opts));
            return lines.join('\n');
        }
        case 'CREATE': return formatCreate(content, opts);
        case 'WITH': return formatWith(content, opts);
        case 'MERGE': return formatMerge(content, opts);
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

    // 注释归属：`field, -- 注释\n next` → 注释挂到前一个字段行尾（N03），不再独立成行
    items = reattachComments(items);

    // 拆分行内注释："__C__ field" / "field\n__C__\nfield2" 拆为注释独立项（幂等）。
    // 关键：仅当存在"注释边界行"（行首是注释占位符）才按行拆；多行表达式
    // （如 SUM(CASE...END)\n) / 100000000 AS x -- 注释，行首不是 __C）保持完整，
    // 避免括号结构被拆散导致括号/运算符丢失。
    const expanded = [];
    for (const item of items) {
        if (!item.includes('__C')) { expanded.push(item); continue; }
        const lines = item.split('\n').map(l => l.trim()).filter(Boolean);
        const hasCommentBoundary = lines.some(l => /^__C\d+__$/.test(l) || /^__C\d+__\s+/.test(l));
        if (!hasCommentBoundary) { expanded.push(item); continue; }
        for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            if (/^__C\d+__$/.test(t)) { expanded.push(t); continue; }
            const m = t.match(/^(__C\d+__)\s+(.+)$/);
            if (m) { expanded.push(m[1]); expanded.push(m[2]); continue; }
            expanded.push(t);
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

    // SELECT 字段：AS 对齐 + 注释对齐
    if (isSelect) items = alignSelectFields(items, opts);

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

/**
 * 计算占位符还原后的真实长度（用于对齐：__S/__C 占位符长度 ≠ 还原后长度）
 */
function effectiveLen(text) {
    return text.replace(/__(S|C)(\d+)__/g, (m, t, n) => (t === 'S' ? storeS : storeC)[+n] || m).length;
}

/**
 * SELECT 字段 AS/注释对齐：
 *   - ≥2 个含 AS 的字段 → AS 关键字列对齐
 *   - ≥2 个含尾部注释的字段 → 注释列对齐
 * 仅处理单行字段；注释项（__C）、多行项（子查询等）跳过。
 */
function alignSelectFields(items, opts) {
    const info = items.map((it, i) => {
        // 注释项、多行项、含子查询项（(SELECT/WITH) 展开后必为多行）不参与对齐，保证幂等
        if (/^__C\d+__$/.test(it) || it.includes('\n') || /\(\s*(SELECT|WITH)\b/i.test(it)) return { i, plain: it };
        let body = it, comment = null;
        // 尾部注释占位符（__C）分离
        const cm = it.match(/^(.*?)[ \t]+(__C\d+__)$/);
        if (cm) { body = cm[1].trim(); comment = cm[2]; }
        // AS 分离：贪婪匹配最后一个 " AS "（表达式内可能有 CAST(... AS STRING) 等，不能取第一个）
        let expr = body, alias = null;
        const am = body.match(/^(.*)[ \t]+AS[ \t]+(.+)$/i);
        if (am) { expr = am[1].trim(); alias = 'AS ' + am[2].trim(); }
        return { i, body, expr, alias, comment, hasComment: comment !== null, hasAlias: alias !== null };
    });

    // 第一遍：AS 对齐（用还原后长度）
    const aliasItems = info.filter(x => x.hasAlias);
    if (aliasItems.length >= 2) {
        const maxExpr = Math.max(...aliasItems.map(x => effectiveLen(x.expr)));
        for (const x of info) {
            if (x.plain !== undefined) continue;
            x.body = x.hasAlias
                ? x.expr + ' '.repeat(Math.max(maxExpr - effectiveLen(x.expr) + 1, 1)) + x.alias
                : x.expr;
        }
    } else {
        for (const x of info) if (x.plain === undefined && x.alias) x.body = x.expr + ' ' + x.alias;
    }

    // 第二遍：注释对齐（用还原后长度）
    const commentItems = info.filter(x => x.hasComment);
    if (commentItems.length >= 2) {
        const maxBody = Math.max(...commentItems.map(x => effectiveLen(x.body)));
        for (const x of info) {
            if (x.plain !== undefined) continue;
            x.body = x.hasComment
                ? x.body + ' '.repeat(Math.max(maxBody - effectiveLen(x.body) + 1, 1)) + x.comment
                : x.body;
        }
    } else {
        for (const x of info) if (x.plain === undefined && x.hasComment) x.body = x.body + ' ' + x.comment;
    }

    const result = items.slice();
    for (const x of info) if (x.plain === undefined) result[x.i] = x.body;
    return result;
}

function formatAndList(kw, content, andIndent, opts) {
    // andAlign=false: 不强制将 AND/OR 条件拆成多行，保持内联
    if (!opts.andAlign) {
        return kw + ' ' + formatSubqueryContent(content, opts);
    }
    const parts = splitAndOrWithOps(content);
    if (parts.length<=1) return kw + ' ' + formatSubqueryContent(content, opts);
    // 短行捷径：仅当内容本身就短（≤30）且无换行时合并单行
    if (parts.length===2 && !content.includes('\n') && (kw+' '+content).length<=30) {
        return kw + ' ' + formatSubqueryContent(content, opts);
    }
    const lines = [];
    for (let i=0; i<parts.length; i++) {
        const partFormatted = formatSubqueryContent(parts[i].text, opts);
        lines.push(i===0 ? (kw+' '+partFormatted) : (andIndent+parts[i].op+' '+partFormatted));
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
            // 限定标识符（t.and / t.or）跳过
            if (text[m.index - 1] === '.') continue;
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

// 注释归属：`field, -- 注释\n next` → 注释挂到前一个字段/列行尾（N03），不再独立成行
function reattachComments(items) {
    const out = [];
    for (const item of items) {
        const m = item.match(/^(__C\d+__)[ \t]*\n[ \t]*(.+)$/);
        if (m && out.length > 0) {
            out[out.length - 1] += ' ' + m[1];
            out.push(m[2].trim());
        } else {
            out.push(item);
        }
    }
    return out;
}

// 从 openIndex（指向 '('）找匹配的 ')' 位置，找不到返回 -1
function findMatchingParen(text, openIndex) {
    let d = 0;
    for (let i = openIndex; i < text.length; i++) {
        if (text[i] === '(') d++;
        else if (text[i] === ')') { d--; if (d === 0) return i; }
    }
    return -1;
}

// 拆分 CREATE TABLE 尾部的存储/分布子句，各独立成行
function splitStorageClauses(tail) {
    const parts = [];
    const re = /\b(CLUSTERED|SORTED|INTO|STORED|LOCATION|TBLPROPERTIES|PARTITIONED|COMMENT|ROW FORMAT|FIELDS TERMINATED|LINES TERMINATED)\b/gi;
    let last = 0, m;
    while ((m = re.exec(tail)) !== null) {
        if (m.index > last && tail.slice(last, m.index).trim()) parts.push(tail.slice(last, m.index).trim());
        last = m.index;
    }
    const rest = tail.slice(last).trim();
    if (rest) parts.push(rest);
    return parts.filter(Boolean);
}

/**
 * CREATE [TEMP|TEMPORARY] TABLE|VIEW 格式化：
 *   - 列定义强制换行（不区分长度），逗号优先
 *   - 尾部子句（CLUSTERED/SORTED/INTO/STORED 等）各自独立成行
 */
function formatCreate(content, opts) {
    // 剥离语句尾分号，格式化后重新附着到最后一行
    let semi = '';
    const sm = content.match(/;[\s;]*$/);
    if (sm) { semi = ';'; content = content.slice(0, sm.index).trim(); }

    const IND = ' '.repeat(opts.indentSize);
    const m = content.match(/^(TEMP\s+|TEMPORARY\s+)?(TABLE|VIEW)\s+([^\s(]+)([\s\S]*)$/i);
    if (!m) return 'CREATE ' + content + semi;
    const kind = ((m[1] || '') + m[2]).toUpperCase();
    const name = m[3];
    const rest = (m[4] || '').trim();

    if (rest.startsWith('(')) {
        const close = findMatchingParen(rest, 0);
        if (close !== -1) {
            const cols = rest.slice(1, close).trim();
            const tail = rest.slice(close + 1).trim();
            const lines = ['CREATE ' + kind + ' ' + name + ' ('];
            // 列定义（含列内注释归属）
            const colItems = reattachComments(splitComma(cols).map(s => s.trim()).filter(Boolean));
            const commaPad = ' '.repeat(Math.max(0, opts.indentSize - 2)) + ', ';
            colItems.forEach((c, i) => {
                lines.push((i === 0 ? IND : commaPad) + formatSubqueryContent(c, opts));
            });
            lines.push(')');
            if (tail) for (const clause of splitStorageClauses(tail)) lines.push(clause);
            lines[lines.length - 1] += semi;
            return lines.join('\n');
        }
    }
    // 无括号列定义（如 CREATE TABLE ... AS SELECT，SELECT 已拆分到下一段）
    if (rest) return 'CREATE ' + kind + ' ' + name + ' ' + rest + semi;
    return 'CREATE ' + kind + ' ' + name + semi;
}

// 单个 CTE：`name [coldefs] AS (query)`，query 内 SELECT 递归格式化
// baseIndent 为该 CTE 所在行的缩进（单 CTE 为 ''，多 CTE 为 IND），用于内层查询叠加缩进
function formatCteItem(cte, opts, baseIndent) {
    const IND = ' '.repeat(opts.indentSize);
    let rec = '';
    if (/^RECURSIVE\s+/i.test(cte)) { rec = 'RECURSIVE '; cte = cte.replace(/^RECURSIVE\s+/i, ''); }
    const m = cte.match(/^([^\s(]+)(\s*\([^)]*\))?\s+AS\s+([\s\S]+)$/i);
    if (!m) return rec + cte;
    const name = m[1];
    const coldefs = m[2] || '';
    const query = m[3].trim();
    const prefix = rec + name + coldefs + ' AS ';
    let block;
    if (query.startsWith('(')) {
        block = formatSubqueryContent(query, opts);
    } else {
        // 裸 SELECT（WITH ... AS SELECT ...）
        block = '(\n' + indentBlock(formatTop(query, opts), IND) + '\n)';
    }
    // 多 CTE 场景：块除首行外叠加 baseIndent
    if (baseIndent) {
        block = block.split('\n').map((l, i) => (i === 0 ? l : baseIndent + l)).join('\n');
    }
    return prefix + block;
}

// MERGE 格式化：INTO/USING/ON 各自一行；WHEN ... THEN 独立成行，动作缩进（SET 不与 WHEN 同行）
function formatMerge(content, opts) {
    let semi = '';
    const sm = content.match(/;[\s;]*$/);
    if (sm) { semi = ';'; content = content.slice(0, sm.index).trim(); }
    const IND = ' '.repeat(opts.indentSize);
    // lookahead 保留首个 WHEN，使分支从 WHEN 开始
    const m = content.match(/^INTO\s+([^\s(]+)(?:\s+([^\s(]+))?\s+USING\s+([^\s(]+)(?:\s+([^\s(]+))?\s+ON\s+(.*?)(?=\s+WHEN\b)([\s\S]*)$/i);
    if (!m) return 'MERGE ' + content + semi;
    const lines = ['MERGE INTO ' + m[1] + (m[2] ? ' ' + m[2] : '')];
    lines.push('USING ' + m[3] + (m[4] ? ' ' + m[4] : ''));
    lines.push('ON ' + m[5].replace(/^\((.*)\)$/s, '$1').trim());
    // 处理 WHEN MATCHED / WHEN NOT MATCHED THEN 分支
    const branches = m[6];
    const whenRe = /WHEN\s+(MATCHED|NOT\s+MATCHED)\s+THEN/gi;
    let w;
    while ((w = whenRe.exec(branches)) !== null) {
        const label = 'WHEN ' + w[1].toUpperCase().replace(/\s+/g, ' ') + ' THEN';
        const after = branches.slice(w.index + w[0].length);
        const nextIdx = after.search(/\bWHEN\s+(?:MATCHED|NOT\s+MATCHED)\b/i);
        const action = (nextIdx === -1 ? after : after.slice(0, nextIdx)).trim();
        lines.push(label);
        lines.push(IND + action);
    }
    lines[lines.length - 1] += semi;
    return lines.join('\n');
}

// WITH CTE 格式化：每个 CTE 单独换行，逗号优先；内层 SELECT 递归格式化
function formatWith(content, opts) {
    const IND = ' '.repeat(opts.indentSize);
    const ctes = splitComma(content).map(s => s.trim()).filter(Boolean);
    if (ctes.length === 0) return 'WITH ' + content;
    if (ctes.length === 1) return 'WITH ' + formatCteItem(ctes[0], opts, '');
    const commaPad = ' '.repeat(Math.max(0, opts.indentSize - 2)) + ', ';
    const lines = ['WITH'];
    ctes.forEach((cte, i) => {
        lines.push((i === 0 ? IND : commaPad) + formatCteItem(cte, opts, IND));
    });
    return lines.join('\n');
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

    // 恢复注释和字符串（迭代到无占位符：块注释内可嵌套行注释/字符串，需多轮）
    for (let pass = 0; pass < 10; pass++) {
        let changed = false;
        pcStore.forEach((v, i) => {
            const tok = '__PC' + i + '__';
            if (sql.indexOf(tok) !== -1) { sql = sql.split(tok).join(v); changed = true; }
        });
        pcStrings.forEach((v, i) => {
            const tok = '__PS' + i + '__';
            if (sql.indexOf(tok) !== -1) { sql = sql.split(tok).join(v); changed = true; }
        });
        if (!changed) break;
    }
    return sql;
}

// ======================== CASE WHEN 格式化 ========================
// formatCaseBlock 返回 { inline: string }（单行）或 { first: string, rest: string[] }（多行）。
// rest 中的行是相对 "CASE 起始列" 的缩进行（END 相对缩进 0，与 CASE 对齐）。

// 检测 CASE 内是否已含 OR 优先级告警注释（保证幂等）
function caseHasWarning(caseText) {
    const re = /__C(\d+)__/g;
    let m;
    while ((m = re.exec(caseText)) !== null) {
        if ((storeC[+m[1]] || '').includes('建议用括号')) return true;
    }
    return false;
}

function formatCaseBlock(caseText, opts) {
    const IND = ' '.repeat(opts.indentSize || 4);
    // 1) 内层嵌套 CASE 保护为 __L
    const { text: t, store: nested } = protectNestedCases(caseText);
    // 2) 解析分支
    const { expr, branches, elseVal } = splitCaseBranches(t);
    // expr 可能只是注释占位符（二次格式化时告警注释回到此处）→ 独立成行
    let exprLine = null;
    let header = 'CASE';
    if (expr) {
        if (/^__C\d+__$/.test(expr)) exprLine = IND + expr;
        else header = 'CASE ' + expr;
    }

    // 3) 单行判断：无嵌套、无子查询、无行注释、WHEN 无多条件、分支 ≤2、总长 ≤80 → 一行
    const hasNested = nested.length > 0;
    const hasSubquery = /\(\s*(SELECT|WITH)\b/i.test(caseText);
    const hasLineComment = /__C\d+__/.test(caseText);   // 行注释必须落到行尾，强制多行
    const anyMultiCond = branches.some(b => splitAndOr(b.cond).length > 1);
    const inlineLen = header + ' ' +
        branches.map(b => 'WHEN ' + b.cond + ' THEN ' + b.val).join(' ') +
        (elseVal !== null ? ' ELSE ' + (elseVal || 'NULL') : '') + ' END';
    const inlineLimit = Math.min(80, opts.maxWidth || 80);
    if (!hasNested && !hasSubquery && !hasLineComment && !anyMultiCond && branches.length <= 2 && inlineLen.length <= inlineLimit) {
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

    // 混合 AND/OR（无括号）→ 加优先级告警注释（幂等：已有则不重复加）
    const mixedOr = branches.some(b => {
        const p = splitAndOrWithOps(b.cond);
        return p.some(x => x.op === 'OR') && p.some(x => x.op === 'AND');
    });

    const lines = [header];
    if (exprLine) lines.push(exprLine);
    if (mixedOr && !caseHasWarning(caseText)) {
        lines.push(IND + '-- ⚠ 混合 AND/OR，建议用括号明确优先级');
    }
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
        // 限定标识符（t.CASE / t.END）跳过
        if (text[idx - 1] === '.') { r += text.slice(i, idx + kw.length); i = idx + kw.length; continue; }
        if (kw === 'CASE') {
            // 找到该内层 CASE 的匹配 END
            const innerStart = idx;
            let d2 = 1, j2 = idx + 4, end2 = -1;
            while (j2 < text.length) {
                const e = text.slice(j2).match(/\b(CASE|END)\b/);
                if (!e) break;
                const k2 = e[0].toUpperCase(); const i2 = j2 + e.index;
                if (text[i2 - 1] === '.') { j2 = i2 + k2.length; continue; }
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
        // 限定标识符（t.WHEN 等）跳过
        if (depth === 0 && t[m.index - 1] !== '.') return { kw: m[0].toUpperCase(), index: m.index };
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
