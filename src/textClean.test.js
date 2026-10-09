const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanTerminalText, summarizeReply } = require('./textClean');

test('strips box-drawing padding characters and trims each line', () => {
  const raw = [
    '  ┃  Say exactly: HELLO_FROM_VERIFY_WORKER                                   █    084Z',
    '     HELLO_FROM_VERIFY_WORKER                                                █    14,614 tokens',
  ].join('\n');
  const result = cleanTerminalText(raw);
  assert.equal(result, 'Say exactly: HELLO_FROM_VERIFY_WORKER\nHELLO_FROM_VERIFY_WORKER');
});

test('drops lines that are pure chrome (only box-drawing/whitespace)', () => {
  const raw = [
    '╹▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    'real content line',
    '                                                                                                                                         █',
  ].join('\n');
  const result = cleanTerminalText(raw);
  assert.equal(result, 'real content line');
});

test('drops the "... (N duplicate lines)" compression marker lines', () => {
  const raw = [
    'first line',
    '  ... (28 duplicate lines)',
    'second line',
  ].join('\n');
  const result = cleanTerminalText(raw);
  assert.equal(result, 'first line\nsecond line');
});

test('returns empty string for empty input', () => {
  assert.equal(cleanTerminalText(''), '');
});

test('collapses runs of blank lines left behind after stripping', () => {
  const raw = ['a', '', '', '', 'b'].join('\n');
  assert.equal(cleanTerminalText(raw), 'a\n\nb');
});

test('summarizeReply drops shell/JSON/noise lines and keeps the final answer', () => {
  const raw = [
    'vào crew-02 hỏi bây giờ là mấy giờ',
    '$ herdr agent prompt "crew-02" "Cho biet bay gio la may gio..." --wait --until idle --timeout 120000',
    '{"id":"cli:agent:prompt","result":{"agent":{"agent_status":"done","name":"crew-02"}}}',
    'LSP',
    'LSPs are disabled',
    'MCP',
    '• 9remote Connected',
    'PS D:\\Source\\bill_cloud\\invoicecore\\.worktrees\\crew-02> & claude',
    'Bây giờ là:',
    '- Giờ hiện tại: 15:34:39',
    '- Ngày tháng: 09/10/2026',
    '- Múi giờ: UTC+07:00',
  ].join('\n');
  const result = summarizeReply(raw);
  assert.ok(!result.includes('herdr agent prompt'), 'must drop echoed shell command');
  assert.ok(!result.includes('"cli:agent:prompt"'), 'must drop raw herdr JSON');
  assert.ok(!result.includes('LSPs are disabled'), 'must drop LSP noise');
  assert.ok(!result.includes('9remote Connected'), 'must drop MCP noise');
  assert.ok(result.includes('15:34:39'), 'must keep the final answer');
});

test('summarizeReply keeps only the trailing lines within the limit', () => {
  const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
  const result = summarizeReply(lines.join('\n'), 10);
  const out = result.split('\n');
  assert.ok(out.length <= 11, `expected <= 11 lines, got ${out.length}`);
  assert.ok(out.join('\n').includes('line 60'), 'must keep the most recent lines');
  assert.ok(!out.join('\n').includes('line 1\n'), 'must drop the oldest lines');
});

test('summarizeReply returns empty string for empty input', () => {
  assert.equal(summarizeReply(''), '');
});
