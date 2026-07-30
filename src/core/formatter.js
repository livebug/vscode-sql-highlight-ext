/**
 * SQL 格式化器 v2
 * 
 * 风格: 逗号优先、AND 对齐、关键字大写、子查询递归格式化、OVER() 保护
 */
'use strict';

const DEFAULTS = { indentSize: 4, maxWidth: 200, commaFirst: true, andAlign: true, keywordCase: 'upper' };

// ======================== 保护/恢复 ========================
let storeV=[], storeC=[], storeS=[], storeO=[], ciV=0, ciC=0, ciS=0, ciO=0;

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

// ======================== 关键字 ========================
const KEYWORDS = new Set([
    'SELECT','FROM','WHERE','AND','OR','NOT','IN','EXISTS','BETWEEN','LIKE','RLIKE','REGEXP','IS','NULL','TRUE','FALSE',
    'AS','ON','JOIN','INNER','LEFT','RIGHT','FULL','CROSS','NATURAL','OUTER','SEMI','ANTI','UNION','ALL','INTERSECT','EXCEPT','MINUS',
    'INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','ALTER','DROP','TRUNCATE','REPLACE','MERGE',
    'GRANT','REVOKE','ORDER','GROUP','HAVING','LIMIT','OFFSET','FETCH','FOR','ASC','DESC','NULLS','FIRST','LAST','BY',
    'CASE','WHEN','THEN','ELSE','END','DISTINCT','WITH','RECURSIVE','WINDOW','OVER','PARTITION',
    'ROWS','RANGE','UNBOUNDED','PRECEDING','FOLLOWING','CURRENT','ROW','LATERAL','VIEW','TABLE','SCHEMA','DATABASE',
    'TEMP','TEMPORARY','IF','EXISTS','BEGIN','CALL','COMMIT','ROLLBACK',
    'PRIMARY','KEY','FOREIGN','REFERENCES','INDEX','CONSTRAINT','CHECK','UNIQUE','ADD','COLUMN','DEFAULT','CASCADE','RESTRICT',
    'EXPLODE','POSEXPLODE','INLINE','STACK','PARTITIONED','CLUSTERED','DISTRIBUTE','SORT','BUCKET','BUCKETS',
    'STORED','FORMAT','SERDE','TBLPROPERTIES','LOCATION','OVERWRITE','PURGE','REFRESH','COMPACT','TRANSACTIONAL',
    'MSCK','REPAIR','INVALIDATE','METADATA','COMPUTE','STATISTICS','BROADCAST','MAPJOIN','STREAMTABLE',
]);

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

    // 统一规则合并：连续的单行、非缩进、非 UNION、非注释段 → 合并到 ≤150 字符
    const MERGE_LIMIT = 150;
    const lines = [];
    let cur = '';

    for (const part of parts) {
        const isMulti = part.includes('\n');
        const isSubClause = /^\s/.test(part);         // 缩进子句（JOIN/ON等）
        const isUnion = /^(UNION|INTERSECT|EXCEPT|MINUS)\b/i.test(part.trim());
        const hasComment = part.includes('__C');

        if (isMulti || isSubClause || isUnion || hasComment) {
            if (cur) { lines.push(cur); cur = ''; }
            lines.push(part);
            continue;
        }

        const candidate = cur ? cur + ' ' + part : part;
        if (candidate.length <= MERGE_LIMIT) {
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

    // 单行判断：
    //   SELECT: 仅 1 个字段且无注释 → 可单行；否则强制多行
    //   ORDER BY / GROUP BY: ≤3 个字段且总长 ≤80 → 单行
    if (!hasComment) {
        if (!isSelect) {
            const singleLine = kw + ' ' + items.join(', ');
            if (items.length <= 3 && singleLine.length <= 80) return singleLine;
        } else if (items.length <= 1) {
            return kw + ' ' + items.join(', ');
        }
    }

    // 逗号优先拆分
    const INDENT = ' '.repeat(opts.indentSize);
    const lines = [kw];
    let firstField = true;
    for (const item of items) {
        if (/^__C\d+__$/.test(item)) {
            // 纯注释行：不加逗号前缀，独立换行
            lines.push(item);
            firstField = true; // 注释后下一个字段用一级缩进
        } else {
            // 递归展开字段中的子查询
            const formatted = formatSubqueryContent(item, opts);
            const prefix = firstField ? INDENT : ' '.repeat(Math.max(0, opts.indentSize - 2)) + ', ';
            lines.push(prefix + formatted);
            firstField = false;
        }
    }
    return lines.join('\n');
}

function formatAndList(kw, content, andIndent, opts) {
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

function splitAndOr(text) { const r=[]; let last=0; const re=/\b(AND|OR|BETWEEN)\b/gi; let m, inBetween=false; while ((m=re.exec(text))!==null) { let d=0; for (let i=last; i<m.index; i++) { if (text[i]==='(') d++; else if (text[i]===')') d--; } if (d===0) { const kw=m[1].toUpperCase(); if (kw==='BETWEEN') { inBetween=true; continue; } if (inBetween && kw==='AND') { inBetween=false; continue; } r.push(text.slice(last, m.index)); last=m.index+m[0].length; inBetween=false; } } r.push(text.slice(last)); return r.filter(s=>s.trim()); }

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
    w = formatTop(w, opts);
    w = restore(w);
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

module.exports = { formatSQL };
