const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {
  ClashlyUtils: {
    escapeHtml: (s) => String(s),
    formatRelativeTime: () => '1m',
    stripTrailingHashtags: (s) => s,
    toTakeUrl: (id) => 'take.html?id=' + id,
    getUserVote: () => null,
    normalizeVoteDistribution: () => ({ agreeCount: 0, disagreeCount: 0, agreePercent: 0, disagreePercent: 0 }),
  },
};

require('../js/take-renderer.js');

test('profile grid renders single image correctly', () => {
  const r = window.ClashlyTakeRenderer;
  const container = { innerHTML: '' };
  r.renderTakeGrid(container, [{ id: '1', content: 'test', image_urls: ['img1.jpg'] }]);
  assert.ok(container.innerHTML.includes('img1.jpg'));
  assert.ok(!container.innerHTML.includes('profile-grid-take__media-wrap--split'));
});

test('profile grid renders 2 images split side-by-side', () => {
  const r = window.ClashlyTakeRenderer;
  const container = { innerHTML: '' };
  r.renderTakeGrid(container, [{ id: '2', content: 'test take', image_urls: ['img1.jpg', 'img2.jpg'] }]);
  assert.ok(container.innerHTML.includes('profile-grid-take__media-wrap--split'));
  assert.ok(container.innerHTML.includes('img1.jpg'));
  assert.ok(container.innerHTML.includes('img2.jpg'));
  assert.equal(container.innerHTML.split('profile-grid-take__media-slot').length, 3);
  assert.ok(container.innerHTML.includes('data-action="comments"'));
});
