// Canvas Companion — syllabus-parser.js
//
// Heuristic, regex-based extraction of a grading scale and assignment-weight
// summary from a course's Canvas syllabus_body (HTML). No network calls, no
// API key — runs entirely client-side against text Canvas already returns.
//
// parseSyllabus(html) -> { summary: string|null, gradingScale: Array|null }
//   gradingScale entries: { l, min, max, pts } — same shape as GPA_SCALE_DEFAULT
//   in panel.js, sorted by min descending. null when no confident custom scale
//   was found (i.e. the course uses, or appears to use, the standard scale).
//
// buildSyllabusResult(text) — the same extraction against already-plain text
//   (used for text pulled out of an uploaded PDF/DOCX syllabus file).
//
// findSyllabusFileLink(html) -> { fileId } | null — detects when the syllabus
//   body is essentially just a pointer to an uploaded Canvas file.

'use strict';

const LETTER_POINTS = {
  'A+': 4.33, 'A': 4.0, 'A-': 3.67,
  'B+': 3.33, 'B': 3.0,  'B-': 2.67,
  'C+': 2.33, 'C': 2.0,  'C-': 1.67,
  'D+': 1.33, 'D': 1.0,  'D-': 0.67,
  'F': 0.0,   'E': 0.0,
};

function stripHTML(html) {
  return (html || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|p|div|li|tr|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&(ndash|#8211);/gi, '–')
    .replace(/&(mdash|#8212);/gi, '—')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// ── Table extraction (regex-based, no DOM — stays Node-testable) ─────────────
// Returns Array<table>, each table an Array<row>, each row an Array<string>
// (cell text via stripHTML). Real <td>/<th> boundaries let the extractors
// below tell a value column from a prose column — impossible once the HTML
// is flattened to text. Nested tables aren't specially handled (the regex
// stops at the first </table>), which is fine for syllabus-grade markup.
function extractTables(html) {
  const tables = [];
  if (!html) return tables;
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const rowRe   = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe  = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let tm;
  while ((tm = tableRe.exec(html))) {
    const rows = [];
    let rm;
    rowRe.lastIndex = 0;
    while ((rm = rowRe.exec(tm[1]))) {
      const cells = [];
      let cm;
      cellRe.lastIndex = 0;
      while ((cm = cellRe.exec(rm[1]))) cells.push(stripHTML(cm[1]));
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}

// Parses one table cell as a grade range: "93-100", "93%–100%", "225–250",
// "Below 135", "97 and above", "225+". Whole-cell anchored so a prose cell
// never matches. Returns { min, max (null = open top), isPercent } or null.
function parseRangeCell(cell) {
  const t = (cell || '').trim();
  if (!t) return null;
  let m = t.match(/^(\d{1,4}(?:\.\d+)?)\s*%?\s*(?:-|–|—|to|through)\s*(\d{1,4}(?:\.\d+)?)\s*(?:%|points?|pts\.?)?$/i);
  if (m) {
    const a = parseFloat(m[1]), b = parseFloat(m[2]);
    return { min: Math.min(a, b), max: Math.max(a, b), isPercent: /%/.test(t) };
  }
  m = t.match(/^(?:below|under|less than|<)\s*(\d{1,4}(?:\.\d+)?)\s*%?$/i);
  if (m) return { min: 0, max: parseFloat(m[1]), isPercent: /%/.test(t) };
  m = t.match(/^(\d{1,4}(?:\.\d+)?)\s*%?\s*(?:\+|and above|and up|or (?:above|higher|greater))$/i);
  if (m) return { min: parseFloat(m[1]), max: null, isPercent: /%/.test(t) };
  return null;
}

const ASU_DEFAULT_MINS = {
  'A+': 97, 'A': 94, 'A-': 90, 'B+': 87, 'B': 84, 'B-': 80,
  'C+': 77, 'C': 70, 'D': 60, 'E': 0, 'F': 0,
};
// Only treat a scale as "custom" if it meaningfully diverges from the ASU
// default (different letters present, or thresholds shifted by >0.5).
function divergesFromDefault(scale) {
  return scale.some(({ l, min }) => {
    const def = ASU_DEFAULT_MINS[l];
    return def === undefined || Math.abs(def - min) > 0.5;
  });
}

// Shared tail for the text- and table-sourced scale extractors. Decides
// percent- vs point-based from the entries themselves: an explicit % (or all
// values already ≤100) means percentage — handled exactly as always. Only a
// %-free scale with values over 100 (e.g. a 250-point course) is treated as
// point-based, normalized against the top of the scale. The two kinds simply
// coexist; nothing switches modes globally.
function finalizeScale(entries) {
  if (entries.length < 3) return null; // not enough signal to trust
  const anyPercent = entries.some((e) => e.isPercent);
  const biggest = Math.max(...entries.map((e) => Math.max(e.max == null ? 0 : e.max, e.min)));

  if (!anyPercent && biggest > 100) {
    // Point-based: the top of the scale is the course's point total.
    const total = Math.max(...entries.map((e) => (e.max == null ? 0 : e.max)));
    if (!(total > 100)) return null; // top row open-ended — no confident total
    entries = entries.map((e) => ({
      l: e.l,
      min: Math.round((e.min / total) * 1000) / 10,
      max: Math.round(((e.max == null ? total : e.max) / total) * 1000) / 10,
    }));
  } else {
    entries = entries
      .filter((e) => e.min >= 0 && e.min <= 100 && (e.max == null || e.max <= 100))
      .map((e) => ({ l: e.l, min: e.min, max: e.max == null ? 100 : e.max }));
    if (entries.length < 3) return null;
  }

  const scale = entries
    .map((e) => ({ l: e.l, min: e.min, max: e.max, pts: LETTER_POINTS[e.l] }))
    .sort((a, b) => b.min - a.min);
  return divergesFromDefault(scale) ? scale : null;
}

// Grading scale from real table rows: first cell is the letter, the next
// range-shaped cell is the range ("Letter | Point Range" tables, FIN 300
// style — point- or percent-based, decided per table by finalizeScale).
function extractGradingScaleFromTables(tables) {
  for (const rows of tables) {
    const entries = [];
    const seen = new Set();
    for (const row of rows) {
      if (row.length < 2) continue;
      const lm = row[0].match(/^([A-Fa-f])\s?([+-])?$/);
      if (!lm) continue;
      const letter = lm[1].toUpperCase() + (lm[2] || '');
      if (LETTER_POINTS[letter] === undefined || seen.has(letter)) continue;
      let range = null;
      for (let i = 1; i < row.length && !range; i++) range = parseRangeCell(row[i]);
      if (!range) continue;
      seen.add(letter);
      entries.push({ l: letter, min: range.min, max: range.max, isPercent: range.isPercent });
    }
    const scale = finalizeScale(entries);
    if (scale) return scale;
  }
  return null;
}

// Assignment weights from table rows: the LAST cell must be, in its entirety,
// "NN%" or "NN points" — a middle column of prose like "7 at 10 pts. (3 at 5)
// each" can never match, which is exactly what makes tables more reliable
// than flattened text. A "Total | ... | 250 points" row supplies the divisor
// for point-based tables; percent tables are validated to sum ≈100 as always.
function extractWeightsFromTables(tables) {
  const skipWords = /^(grade|grading|scale|overview|course|note|letter|requirement)s?$/i;
  for (const rows of tables) {
    const items = [];
    let statedTotal = null;
    for (const row of rows) {
      if (row.length < 2) continue;
      const name = row[0].replace(/[*†‡]+\s*$/, '').trim();
      const vm = row[row.length - 1].trim().match(/^(\d{1,4}(?:\.\d+)?)\s*(%|points?|pts\.?)$/i);
      if (!vm) continue;
      const value = parseFloat(vm[1]);
      const isPercent = vm[2] === '%';
      if (/^total$/i.test(name)) { statedTotal = { value, isPercent }; continue; }
      if (name.length < 2 || name.length > 40 || skipWords.test(name)) continue;
      if (/^[A-F][+-]?$/.test(name)) continue; // grading-scale row, not a category
      if (value <= 0) continue;
      items.push({ name, value, isPercent });
    }
    if (items.length < 2) continue;
    if (items.some((i) => i.isPercent) !== items.every((i) => i.isPercent)) continue; // mixed units — misread
    const sum = items.reduce((s, i) => s + i.value, 0);
    if (items[0].isPercent) {
      if (sum < 90 || sum > 110) continue; // doesn't look like a complete weight table
      return items.map((i) => ({ name: i.name, pct: Math.round(i.value) }));
    }
    // Point-based: divide by the stated total (preferred) or the row sum.
    const total = statedTotal ? statedTotal.value : sum;
    if (!(total > 0)) continue;
    if (statedTotal && Math.abs(sum - total) / total > 0.1) continue; // rows ≠ stated total — misread
    return items.map((i) => ({ name: i.name, pct: Math.round((i.value / total) * 100) }));
  }
  return null;
}

// Pulls {l, min, max, pts} pairs out of free text. Conservative: only keeps
// entries whose letter resolves to a known GPA point value. Point-based
// ranges ("A: 225-250") are collected too and normalized by finalizeScale.
function extractGradingScale(text) {
  const found = new Map(); // letter -> {l, min, max, isPercent}
  const re = /\b([A-Fa-f])\s?([+-])?\s*[:=]?\s*(\d{1,4}(?:\.\d+)?)\s*(%|points?|pts\.?)?\s*(?:-|–|—|to|through)\s*(\d{1,4}(?:\.\d+)?)\s*(%|points?|pts\.?)?/g;
  let m;
  while ((m = re.exec(text))) {
    const letter = (m[1].toUpperCase() + (m[2] || ''));
    if (LETTER_POINTS[letter] === undefined) continue;
    const a = parseFloat(m[3]), b = parseFloat(m[5]);
    if (isNaN(a) || isNaN(b)) continue;
    if (!found.has(letter)) {
      found.set(letter, {
        l: letter, min: Math.min(a, b), max: Math.max(a, b),
        isPercent: m[4] === '%' || m[6] === '%',
      });
    }
  }

  // "97% and above" / "93+" style top-of-scale entries
  const aboveRe = /\b([A-Fa-f])\s?([+-])?\s*[:=]?\s*(\d{1,4}(?:\.\d+)?)\s*(%)?\s*(?:and above|or (?:above|higher|greater)|\+)\b/g;
  while ((m = aboveRe.exec(text))) {
    const letter = (m[1].toUpperCase() + (m[2] || ''));
    if (LETTER_POINTS[letter] === undefined || found.has(letter)) continue;
    const min = parseFloat(m[3]);
    if (isNaN(min)) continue;
    found.set(letter, { l: letter, min, max: null, isPercent: m[4] === '%' });
  }

  // "E: Below 135" style bottom-of-scale entries
  const belowRe = /\b([A-Fa-f])\s?([+-])?\s*[:=]?\s*(?:below|under|less than)\s*(\d{1,4}(?:\.\d+)?)\s*(%)?/gi;
  while ((m = belowRe.exec(text))) {
    const letter = (m[1].toUpperCase() + (m[2] || ''));
    if (LETTER_POINTS[letter] === undefined || found.has(letter)) continue;
    const max = parseFloat(m[3]);
    if (isNaN(max)) continue;
    found.set(letter, { l: letter, min: 0, max, isPercent: m[4] === '%' });
  }

  return finalizeScale([...found.values()]);
}

// Pulls "Category: NN%" pairs that plausibly sum to ~100, falling back to
// point-based "Category: NNN points" pairs when the text has no percent
// weights at all (only trusted when the text also states the point total —
// without one, raw point values can't be normalized and are discarded).
function extractWeights(text) {
  const re = /\b([A-Za-z][A-Za-z &/'-]{2,30}?)\s*[:\-]\s*(\d{1,3})\s*%/g;
  const skipWords = /^(grade|grading|scale|total|overview|course|note)s?$/i;
  const items = [];
  let m;
  while ((m = re.exec(text))) {
    const name = m[1].trim();
    const pct = parseInt(m[2], 10);
    if (pct <= 0 || pct > 100) continue;
    if (skipWords.test(name)) continue;
    if (/^[A-F][+-]?$/.test(name)) continue; // grading-scale line, not a category
    items.push({ name, pct });
  }
  if (items.length) {
    const sum = items.reduce((s, i) => s + i.pct, 0);
    return (sum < 90 || sum > 110) ? null : items; // partial % table — don't reinterpret
  }

  // Point-based fallback ("Homework: 100 points ... Total: 250 points")
  const ptItems = [];
  const ptRe = /\b([A-Za-z][A-Za-z &/'-]{1,30}?)\s*[:\-]\s*(\d{1,4}(?:\.\d+)?)\s*(?:points?|pts\.?)\b/gi;
  while ((m = ptRe.exec(text))) {
    const name = m[1].trim();
    const value = parseFloat(m[2]);
    if (value <= 0 || skipWords.test(name) || /^[A-F][+-]?$/i.test(name)) continue;
    ptItems.push({ name, value });
  }
  if (ptItems.length < 2) return null;
  const totalM = text.match(/\btotal\s*[:\-]?\s*(?:of\s*)?(\d{2,4}(?:\.\d+)?)\s*(?:points?|pts\.?)\b/i)
    || text.match(/\(\s*(\d{2,4}(?:\.\d+)?)\s*points?\s*total\s*\)/i)
    || text.match(/\b(\d{2,4}(?:\.\d+)?)\s*(?:points?|pts\.?)\s*(?:total|possible)\b/i);
  if (!totalM) return null;
  const total = parseFloat(totalM[1]);
  const sum = ptItems.reduce((s, i) => s + i.value, 0);
  if (!(total > 0) || Math.abs(sum - total) / total > 0.1) return null; // items ≠ stated total — misread
  return ptItems.map((i) => ({ name: i.name, pct: Math.round((i.value / total) * 100) }));
}

// Recognizes drop-policy sentences in several phrasings:
//   "the lowest two quiz grades are dropped"            (explicit count)
//   "the lowest regular exam score will be replaced by a zero score"
//   "your lowest quiz score is not counted"
function extractDroppedWork(text) {
  const m = text.match(
    /lowest\s+((?:one|two|three|four|five|six|\d+)\s+)?([a-z][a-z /-]{0,24}?)\s+(grades?|scores?|assignments?|quizzes|homeworks?|exams?)(?:\s+(?:grades?|scores?))?\s*(?:is|are|will be)?\s*(?:dropped|omitted|excluded|not counted|replaced\s+(?:by|with)\s+a\s+zero(?:\s+score)?)/i
  );
  if (!m) return null;
  const count = (m[1] || '').trim();
  const what = `${m[2].trim()} ${m[3].trim()}`;
  return count ? `Lowest ${count} ${what} dropped` : `Lowest ${what} dropped`;
}

// Many instructors don't paste their grading policy into the Syllabus page —
// they upload a PDF/Word file and link (or embed a preview of) it. Detects
// that case so the caller can fetch the file and run buildSyllabusResult on
// its extracted text. Only fires when the stripped body text is "thin"
// (below THIN_BODY_CHARS): a substantial pasted syllabus that merely also
// links a file should keep using the pasted text.
const THIN_BODY_CHARS = 150;
function findSyllabusFileLink(html) {
  if (!html) return null;
  const text = stripHTML(html);
  if (text.length >= THIN_BODY_CHARS) return null;

  // Canvas file URLs inside href/src/data attributes:
  //   /courses/123/files/456,  /courses/123/files/456/download,  /files/456/download
  // (attribute-quoted so a file id mentioned in prose doesn't match)
  const m = html.match(/(?:href|src|data-api-endpoint)\s*=\s*["'][^"']*\/files\/(\d+)/i);
  return m ? { fileId: m[1] } : null;
}

function parseSyllabus(html) {
  const text = stripHTML(html);
  if (!text || text.length < 20) return { summary: null, gradingScale: null, droppedNote: null };
  // Table-aware pass first — real <td> boundaries beat flattened text. Any
  // piece the tables didn't yield falls back to the text heuristics inside
  // assembleResult, so table-less syllabi behave exactly as before.
  const tables = extractTables(html);
  return assembleResult(
    text,
    extractGradingScaleFromTables(tables),
    extractWeightsFromTables(tables)
  );
}

// Core extraction over plain text — the uploaded-file path for PDFs, whose
// extracted text has no table markup to lean on (known limitation: complex
// point tables inside PDFs parse less reliably than pasted/DOCX ones).
function buildSyllabusResult(text) {
  if (!text || text.length < 20) return { summary: null, gradingScale: null, droppedNote: null };
  return assembleResult(text, null, null);
}

function assembleResult(text, tableScale, tableWeights) {
  const gradingScale = tableScale || extractGradingScale(text);
  const weights = tableWeights || extractWeights(text);
  const droppedNote = extractDroppedWork(text);

  if (!gradingScale && !weights && !droppedNote) {
    return { summary: null, gradingScale: null, droppedNote: null };
  }

  const sections = [];
  if (gradingScale) {
    sections.push('Grading Scale:\n' + gradingScale
      .map(g => `${g.l}: ${g.min}-${g.max}`)
      .join('\n'));
  }
  if (weights) {
    sections.push('Assignment Weights:\n' + weights
      .map(w => `${w.name}: ${w.pct}%`)
      .join('\n'));
  }
  if (droppedNote) {
    sections.push('Dropped Work:\n' + droppedNote);
  }

  return { summary: sections.join('\n\n'), gradingScale, droppedNote };
}

// Node-only export for the test suite (test/syllabus-parser.test.js). `module`
// doesn't exist in the browser, so this is a no-op when loaded via <script>.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseSyllabus, buildSyllabusResult, findSyllabusFileLink,
    extractTables, extractGradingScaleFromTables, extractWeightsFromTables,
    extractGradingScale, extractWeights, extractDroppedWork,
    stripHTML, LETTER_POINTS,
  };
}
