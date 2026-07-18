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
    w = w.replace(/--[^\n]*/g, m => { storeC.push(m); return '__C'+(ciC++)+'__'; });
    w = w.replace(/\/\*[\s\S]*?\*\//g, m => { storeC.push(m); return '__C'+(ciC++)+'__'; });
    w = w.replace(/'[^']*'/g, m => { storeS.push(m); return '__S'+(ciS++)+'__'; });
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

// ======================== 从句拆分 ========================
const MAIN_RE = /\b(SELECT|FROM|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+JOIN|CROSS\s+JOIN|NATURAL\s+JOIN|JOIN|ON|UNION|UNION\s+ALL|INTERSECT|EXCEPT|MINUS|DELETE|INSERT|INTO|UPDATE|SET)\b/gi;

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
        case 'ON': return formatAndList(CI+'ON', content, CI+'  ', opts);
        case 'GROUP BY': case 'ORDER BY': return formatCommaList(kw, content, opts);
        case 'LIMIT': case 'OFFSET': return kw+' '+content;
        default:
            if (kw.includes('JOIN')) {
                const m = content.match(/^(.*?)\bON\b(.+)$/i);
                if (m) return CI+kw+' '+formatSubqueryContent(m[1].trim(),opts)+'\n'+formatAndList(CI+'ON', m[2].trim(), CI+'  ', opts);
                return CI+kw+' '+formatSubqueryContent(content, opts);
            }
            return kw+' '+content;
    }
}

// ======================== 列表格式化 ========================
function formatCommaList(kw, content, opts) {
    const items = splitComma(content).map(s=>s.trim()).filter(Boolean);
    // 单行尝试：字段+关键字总长 ≤ 150 字符就放一行
    const singleLine = kw + ' ' + items.join(', ');
    if (singleLine.length <= 150) return singleLine;

    // 超出才逗号优先拆分
    const INDENT = ' '.repeat(opts.indentSize);
    const lines = [kw];
    for (let i = 0; i < items.length; i++) {
        lines.push((i === 0 ? INDENT : ' '.repeat(Math.max(0, opts.indentSize - 2)) + ', ') + items[i]);
    }
    return lines.join('\n');
}

function formatAndList(kw, content, andIndent, opts) {
    const parts = splitAndOr(content).map(s=>s.trim()).filter(Boolean);
    if (parts.length<=1) return kw+' '+content;
    if (parts.length===2 && (kw+' '+content).length<=60) return kw+' '+content;
    const lines = [];
    for (let i=0; i<parts.length; i++) lines.push(i===0?(kw+' '+parts[i]):(andIndent+'AND '+parts[i]));
    return lines.join('\n');
}

// ======================== 逗号/AND 分割 ========================
function splitComma(text) { const r=[]; let d=0,cur=''; for (const ch of text) { if (ch==='(') d++; else if (ch===')') d--; if (ch===','&&d===0) { r.push(cur); cur=''; } else cur+=ch; } if (cur.trim()) r.push(cur); return r; }

function splitAndOr(text) { const r=[]; let last=0; const re=/\b(AND|OR)\b/gi; let m; while ((m=re.exec(text))!==null) { let d=0; for (let i=last; i<m.index; i++) { if (text[i]==='(') d++; else if (text[i]===')') d--; } if (d===0) { r.push(text.slice(last, m.index)); last=m.index+m[0].length; } } r.push(text.slice(last)); return r.filter(s=>s.trim()); }

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
            r += '(\n'+formatted.split('\n').map(l=>INDENT+l).join('\n')+'\n)';
        } else { r += '('+inner+')'; }
        i = j+1;
    }
    return r;
}

// ======================== 主入口 + 后处理 ========================
function formatSQL(sql, options) {
    const opts = Object.assign({}, DEFAULTS, options||{});
    let w = protect(sql);
    w = w.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
    w = uppercase(w);
    w = protectOver(w);
    w = formatTop(w, opts);
    w = restore(w);
    w = postProcess(w);
    return w;
}

function postProcess(sql) {
    sql = sql.replace(/\*\/\s+(\S)/g, '*/\n$1');
    sql = sql.replace(/\n\s*;/g, ';');   // 分号提到前行
    sql = sql.replace(/\s+;/g, ';');
    sql = sql.replace(/;(\S)/g, ';\n$1');
    sql = sql.replace(/[ \t]+$/gm, '');
    // 语句间空行
    sql = sql.replace(/;(\s*\n\s*)(?=\S)/g, ';\n\n');
    sql = sql.replace(/\n{3,}/g, '\n\n');
    return sql;
}

module.exports = { formatSQL };
