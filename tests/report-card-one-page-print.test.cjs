const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('<style id="cornhill-report-card-print-fit">');
const end = html.indexOf('</style>', start);
assert.notEqual(start, -1, 'targeted report-card print stylesheet exists');
assert.notEqual(end, -1, 'targeted report-card print stylesheet closes');
const css = html.slice(start, end + '</style>'.length);

test('official learner report card keeps an A4 fallback page rule', () => {
  assert.match(css, /@page cornhillReportCard\s*\{\s*size:\s*A4 portrait/i);
  assert.match(css, /body\.print-official-report #reportCardPreview\s*\{\s*page:\s*cornhillReportCard/i);
  assert.match(css, /\.cornhill-report-card\s*\{[^}]*page:\s*cornhillReportCard/i);
});

test('single report card is compacted without hiding academic content', () => {
  for (const selector of ['.report-school-head', '.report-identity', '.report-marks',
    '.report-summary', '.report-comments', '.report-footer']) {
    assert.ok(css.includes(selector), selector + ' has a print layout rule');
  }
  assert.match(css, /\.report-marks\s*\{[^}]*min-width:\s*0/i);
  assert.match(css, /\.table-wrap\s*\{[^}]*overflow:\s*visible/i);
  assert.match(css, /\.report-comments\s*\{[^}]*line-height:\s*1\.15/i);
  assert.match(css, /\.report-footer\s*\{[^}]*break-inside:\s*avoid/i);
  assert.doesNotMatch(css, /display:\s*none\s*!important[^}]*report-(?:marks|summary|comments)/i);
});

test('stamps, signatures, learner identity, totals and positions remain printable', () => {
  for (const selector of ['.report-stamp img', '.report-teacher-signline',
    '.report-headteacher-signoff', '.report-comment-value']) {
    assert.ok(css.includes(selector), selector + ' is retained in print layout');
  }
  assert.match(html, /PUPIL’S NAME:/);
  assert.match(html, /LEARNER’S IDENTIFICATION NUMBER \(LIN\):/);
  assert.match(html, /class="report-total"/);
  assert.match(html, /class="report-comments"/);
  assert.match(html, /HEADTEACHER’S SIGNATURE:/);
});

test('print-fit rules are isolated to official report-card printing', () => {
  assert.match(css, /@media print/);
  assert.match(css, /body\.print-official-report #reportCardPreview/);
  assert.doesNotMatch(css, /body\.print-(?:expenses|daily-collection|financial-overview)/);
  assert.doesNotMatch(css, /#reports\s*\{/);
});

test('batch report cards keep their one-learner-per-page separation rule', () => {
  assert.match(html, /\.batch-report-card\{break-after:page;page-break-after:always\}/);
  assert.match(html, /\.batch-report-card:last-child\{break-after:auto;page-break-after:auto\}/);
});

test('each report receives a content-measured custom-height page', () => {
  assert.match(html, /async function printCornhillReportCards\(/);
  assert.match(html, /cornhill-report-measure-host/);
  assert.match(html, /getBoundingClientRect\(\)\.height/);
  assert.match(html, /px\*25\.4\/96/);
  assert.match(html, /pageRules\.push\('@page '\+pageName\+'\{size:210mm '\+pageHeight\+'mm;margin:4mm;\}'\)/);
  assert.match(html, /page:'\+pageName\+'!important;zoom:/);
});

test('the printed report card has a visible frame and sensible inner spacing', () => {
  assert.match(html, /border:1\.4pt solid #245b48!important/);
  assert.match(html, /padding:4mm!important/);
  assert.match(html, /cornhill-dynamic-report-page-/);
});

test('individual and batch print actions use the same measured page layout', () => {
  assert.match(html, /printCornhillReportCards\(preview,'print-official-report','\.cornhill-report-card'\)/);
  assert.match(html, /printCornhillReportCards\(\$\('reportBatchPrint'\),'print-report-batch','\.batch-report-card'\)/);
  assert.match(html, /Print \/ save all as PDF/);
});
