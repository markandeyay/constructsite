#!/usr/bin/env node
/**
 * qa/copylint.mjs
 * WP-16. Copy lint, spec section 16.5 plus BUILD_CONTRACT overrides A1 and A4.
 *
 * Pass 1: src/content/copy.ts against the ten literal rules in section 16.5,
 *         plus the eleventh lookaround rule (every "100%" must be followed
 *         within 60 characters by "curated").
 * Pass 2: all of src/ plus index.html for the hard gates: em dash U+2014,
 *         emoji, the banned product/company strings, and email addresses.
 *
 * Usage:  node qa/copylint.mjs
 * Exit:   0 on clean, non-zero on any hit or on a missing required file.
 *
 * This file takes no base URL: it is a static source scan. It accepts and
 * ignores a first argument so it can be invoked uniformly with the other
 * four QA scripts.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const COPY_FILE = join(ROOT, 'src', 'content', 'copy.ts');
const SRC_DIR = join(ROOT, 'src');
const INDEX_HTML = join(ROOT, 'index.html');

/* ------------------------------------------------------------------ */
/* Section 16.5 rules, verbatim.                                      */
/* ------------------------------------------------------------------ */

const RULES = [
  [/\u2014/, 'em dash (section 2.3.5)'],
  [/\s\u2013\s/, 'en dash used as a connector (section 2.3.5)'],
  [/\p{Extended_Pictographic}/u, 'emoji (section 2.4)'],
  [/\b\d+\s*x faster\b/i, 'unsourced speed multiplier (Appendix B)'],
  [/backed by addgene/i, 'overstated Addgene relationship (Appendix B)'],
  [/addgene.{0,20}(investor|licen[sc])/i, 'unverified Addgene claim (Appendix B)'],
  [/100%\s*accurate/i, 'accuracy claim missing its qualifier (Appendix B)'],
  [/\bfda[- ]?(cleared|approved)\b/i, 'clinical claim (Appendix B)'],
  [/\bin production at\b/i, 'unverified deployment claim (Appendix B)'],
  [/\b\d+\s*(researchers|labs|users)\b/i, 'invented user count (Appendix B)'],
];

/* Rule 11: the qualifier rule. Needs a lookaround, so it is not a flat match. */
const HUNDRED_PERCENT = /100\s*%/g;
const QUALIFIER = 'curated';
const QUALIFIER_WINDOW = 60;

/* ------------------------------------------------------------------ */
/* Pass 2 needles.                                                    */
/*                                                                    */
/* The banned brand strings are assembled from character codes so that */
/* this linter does not itself contain the literals it is hunting for. */
/* ------------------------------------------------------------------ */

const fc = (...codes) => String.fromCharCode(...codes);

/* "PMR" */
const BRAND_A = fc(80, 77, 82);
/* "PlasmidAI" */
const BRAND_B = fc(80, 108, 97, 115, 109, 105, 100, 65, 73);
/* "plasmidai" */
const BRAND_C = fc(112, 108, 97, 115, 109, 105, 100, 97, 105);

const GLOBAL_RULES = [
  [new RegExp('\\u2014', 'g'), 'em dash U+2014 (section 2.3.5, BUILD_CONTRACT gate B)'],
  [/\p{Extended_Pictographic}/gu, 'emoji (section 2.4)'],
  [new RegExp('\\b' + BRAND_A + '\\b', 'g'), 'banned company string (override A1)'],
  [new RegExp(BRAND_B, 'g'), 'banned product string (override A1)'],
  [new RegExp(BRAND_C, 'g'), 'banned product string, lowercase form (override A1)'],
  [
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    'email address (override A4: no visible email anywhere in shipped source)',
  ],
];

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.json',
  '.svg',
  '.txt',
  '.md',
]);

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function lineTextOf(text, index) {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  let end = text.indexOf('\n', index);
  if (end === -1) end = text.length;
  return text.slice(start, end).trim();
}

function rel(p) {
  return relative(ROOT, p).split('\\').join('/');
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'shots') {
      continue;
    }
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out);
    } else if (TEXT_EXTENSIONS.has(extname(name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

const failures = [];

function record(file, index, text, rule, extra) {
  failures.push({
    file: rel(file),
    line: lineOf(text, index),
    rule,
    snippet: lineTextOf(text, index).slice(0, 140),
    extra: extra || '',
  });
}

/* ------------------------------------------------------------------ */
/* Pass 1: copy.ts                                                    */
/* ------------------------------------------------------------------ */

function passOne() {
  if (!existsSync(COPY_FILE)) {
    console.log('');
    console.log('  NOT READY: ' + rel(COPY_FILE) + ' does not exist yet.');
    console.log('  WP-04 owns that file. Re-run this lint once it has landed.');
    console.log('');
    return false;
  }

  const text = readFileSync(COPY_FILE, 'utf8');
  let checked = 0;

  for (const [re, label] of RULES) {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = global.exec(text)) !== null) {
      record(COPY_FILE, m.index, text, label, 'matched: ' + JSON.stringify(m[0]));
      if (m[0].length === 0) global.lastIndex += 1;
    }
    checked += 1;
  }

  /* Rule 11: every 100% must sit within 60 characters of "curated". */
  HUNDRED_PERCENT.lastIndex = 0;
  let hit;
  while ((hit = HUNDRED_PERCENT.exec(text)) !== null) {
    const after = text.slice(hit.index + hit[0].length, hit.index + hit[0].length + QUALIFIER_WINDOW);
    if (!after.toLowerCase().includes(QUALIFIER)) {
      record(
        COPY_FILE,
        hit.index,
        text,
        'accuracy figure without its "' + QUALIFIER + '" qualifier within ' + QUALIFIER_WINDOW + ' characters (Appendix B)',
        'matched: ' + JSON.stringify(hit[0])
      );
    }
  }
  checked += 1;

  console.log('  pass 1: ' + rel(COPY_FILE) + ', ' + checked + ' rules applied.');
  return true;
}

/* ------------------------------------------------------------------ */
/* Pass 2: all of src/ plus index.html                                */
/* ------------------------------------------------------------------ */

function passTwo() {
  const files = [];
  if (existsSync(SRC_DIR)) walk(SRC_DIR, files);
  if (existsSync(INDEX_HTML)) files.push(INDEX_HTML);

  if (files.length === 0) {
    console.log('');
    console.log('  NOT READY: neither src/ nor index.html exists yet. Nothing to scan.');
    console.log('');
    return false;
  }

  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const [re, label] of GLOBAL_RULES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        record(file, m.index, text, label, 'matched: ' + JSON.stringify(m[0]));
        if (m[0].length === 0) re.lastIndex += 1;
      }
    }
  }

  console.log('  pass 2: ' + files.length + ' source files scanned for the hard gates.');
  return true;
}

/* ------------------------------------------------------------------ */
/* Main                                                               */
/* ------------------------------------------------------------------ */

console.log('');
console.log('COPY LINT (spec section 16.5, overrides A1 and A4)');
console.log('repository root: ' + ROOT);
console.log('');

const okOne = passOne();
const okTwo = passTwo();

console.log('');

if (failures.length > 0) {
  console.log('FAIL: ' + failures.length + ' violation(s).');
  console.log('');
  for (const f of failures) {
    console.log('  ' + f.file + ':' + f.line);
    console.log('    rule:    ' + f.rule);
    if (f.extra) console.log('    ' + f.extra);
    console.log('    line:    ' + f.snippet);
    console.log('');
  }
  process.exit(1);
}

if (!okOne || !okTwo) {
  console.log('BLOCKED: the lint could not run against everything it needs.');
  console.log('This is not a pass. Re-run once the missing files land.');
  process.exit(2);
}

console.log('PASS: zero violations.');
process.exit(0);
