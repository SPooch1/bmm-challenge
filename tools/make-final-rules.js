#!/usr/bin/env node
// Builds firestore.rules.final from firestore.rules (the transitional rules):
// drops every block between "// >>> TRANSITIONAL" and "// <<< TRANSITIONAL" and
// turns each "// [FINAL] " line into a live line. Run: node tools/make-final-rules.js
// (add --check to only verify the committed file is current).
const fs = require('fs');
const path = require('path');

function buildFinal(src) {
  const out = [];
  let skipping = false;
  src.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t === '// >>> TRANSITIONAL') {
      if (skipping) throw new Error('nested TRANSITIONAL block at line ' + (i + 1));
      skipping = true;
      return;
    }
    if (t === '// <<< TRANSITIONAL') {
      if (!skipping) throw new Error('unmatched TRANSITIONAL end at line ' + (i + 1));
      skipping = false;
      return;
    }
    if (skipping) return;
    const m = line.match(/^(\s*)\/\/ \[FINAL\] (.*)$/);
    if (m) { out.push(m[2]); return; }
    out.push(line);
  });
  if (skipping) throw new Error('unterminated TRANSITIONAL block');
  let text = out.join('\n');
  text = text.replace(
    /\/\/ THIS FILE = the TRANSITIONAL rules[\s\S]*?CLAUDE\.md\.\n/,
    '// THIS FILE = the FINAL rules (deploy step 5), generated from firestore.rules by\n// tools/make-final-rules.js. Do not edit by hand.\n'
  );
  if (/isMigrator|TRANSITIONAL|\[FINAL\]/.test(text)) throw new Error('final rules still mention migration/transitional markers');
  return text;
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  const final = buildFinal(src);
  const target = path.join(root, 'firestore.rules.final');
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (cur !== final) { console.error('firestore.rules.final is stale: run node tools/make-final-rules.js'); process.exit(1); }
    console.log('firestore.rules.final is current');
  } else {
    fs.writeFileSync(target, final);
    console.log('wrote firestore.rules.final');
  }
}
module.exports = { buildFinal };
