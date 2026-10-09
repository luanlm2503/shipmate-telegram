const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanTerminalText } = require('./textClean');

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
