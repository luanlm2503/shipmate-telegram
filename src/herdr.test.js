const test = require('node:test');
const assert = require('node:assert/strict');
const { HerdrError, parseHerdrOutput } = require('./herdr');

test('parseHerdrOutput returns result.agent for a successful agent_info response', () => {
  const stdout = JSON.stringify({
    id: 'cli:agent:get',
    result: { type: 'agent_info', agent: { name: 'first-mate', agent_status: 'idle' } },
  });
  const parsed = parseHerdrOutput(stdout);
  assert.equal(parsed.result.agent.agent_status, 'idle');
});

test('parseHerdrOutput throws HerdrError with the error code on an error response', () => {
  const stdout = JSON.stringify({
    id: 'cli:agent:get',
    error: { code: 'agent_not_found', message: 'agent target x not found' },
  });
  assert.throws(
    () => parseHerdrOutput(stdout),
    (err) => err instanceof HerdrError && err.code === 'agent_not_found'
  );
});

test('parseHerdrOutput throws HerdrError with code "invalid_json" on unparseable stdout', () => {
  assert.throws(
    () => parseHerdrOutput('not json at all'),
    (err) => err instanceof HerdrError && err.code === 'invalid_json'
  );
});

test('HerdrError carries the message from the error response', () => {
  const stdout = JSON.stringify({ id: 'x', error: { code: 'timeout', message: 'timed out waiting for agent status' } });
  try {
    parseHerdrOutput(stdout);
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.message, 'timed out waiting for agent status');
  }
});
