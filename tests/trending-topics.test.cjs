const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('search.js renders trending icon beside each trending topic', () => {
  const code = fs.readFileSync('js/pages/search.js', 'utf8');
  assert.ok(code.includes('fa-arrow-trend-up'), 'search.js contains fa-arrow-trend-up icon');
  assert.ok(code.includes('trend-item__trend-icon'), 'search.js contains trend-item__trend-icon class');
});

test('search.css contains styling for trend-item__trend-icon', () => {
  const css = fs.readFileSync('css/search.css', 'utf8');
  assert.ok(css.includes('.trend-item__trend-icon'), 'search.css styles .trend-item__trend-icon');
  assert.ok(css.includes('.trend-item__keyword'), 'search.css styles .trend-item__keyword');
});
