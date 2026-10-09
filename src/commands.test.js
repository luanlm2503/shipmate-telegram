const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCommand, formatStatusMessage, handleStopCommand, resolveBlockedKeys } = require('./commands');

test('parseCommand recognizes /status with no arguments', () => {
  assert.deepEqual(parseCommand('/status'), { type: 'status' });
});

test('parseCommand recognizes /stop with a name argument', () => {
  assert.deepEqual(parseCommand('/stop crewA'), { type: 'stop', name: 'crewA' });
});

test('parseCommand returns type "stop" with name undefined when no argument given', () => {
  assert.deepEqual(parseCommand('/stop'), { type: 'stop', name: undefined });
});

test('parseCommand returns type "text" for anything else, preserving the text', () => {
  assert.deepEqual(parseCommand('fix the login bug'), { type: 'text', text: 'fix the login bug' });
});

test('formatStatusMessage lists each agent with name, status, and workspace', () => {
  const agents = [
    { name: 'first-mate', agent_status: 'idle', workspace_id: 'w1' },
    { name: 'crewA', agent_status: 'working', workspace_id: 'w2' },
  ];
  const message = formatStatusMessage(agents);
  assert.match(message, /first-mate/);
  assert.match(message, /idle/);
  assert.match(message, /crewA/);
  assert.match(message, /working/);
  assert.match(message, /w2/);
});

test('formatStatusMessage handles agents without custom name gracefully', () => {
  const agents = [
    { agent: 'claude', pane_id: 'w2:p2', terminal_title_stripped: 'My Task', agent_status: 'idle', workspace_id: 'w2' },
    { agent: 'claude', pane_id: 'w2:p4', agent_status: 'working', workspace_id: 'w2' },
  ];
  const message = formatStatusMessage(agents);
  assert.match(message, /My Task/);
  assert.match(message, /claude \[w2:p4\]/);
  assert.doesNotMatch(message, /undefined/);
});

test('formatStatusMessage reports a clear message when there are no agents', () => {
  const message = formatStatusMessage([]);
  assert.match(message, /no agents/i);
});

test('handleStopCommand returns an error result when the name does not resolve', async () => {
  const fakeRunHerdr = async () => {
    throw new Error('should not be called');
  };
  const result = await handleStopCommand({ runHerdr: fakeRunHerdr, name: undefined, agents: [] });
  assert.equal(result.ok, false);
  assert.match(result.message, /usage/i);
});

test('handleStopCommand returns an error result when the named agent is not found', async () => {
  const fakeRunHerdr = async () => {
    throw new Error('should not be called');
  };
  const result = await handleStopCommand({
    runHerdr: fakeRunHerdr,
    name: 'does-not-exist',
    agents: [{ name: 'crewA', workspace_id: 'w1' }],
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /not found/i);
});

test('handleStopCommand calls herdr worktree remove for a found agent and reports success', async () => {
  const calls = [];
  const fakeRunHerdr = async (args) => {
    calls.push(args);
    return {};
  };
  const result = await handleStopCommand({
    runHerdr: fakeRunHerdr,
    name: 'crewA',
    agents: [{ name: 'crewA', workspace_id: 'w1' }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['worktree', 'remove', '--workspace', 'w1', '--force']]);
});

test('handleStopCommand refuses to stop first-mate', async () => {
  const result = await handleStopCommand({
    runHerdr: async () => {},
    name: 'first-mate',
    agents: [{ name: 'first-mate', workspace_id: 'w0' }],
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /cannot stop first-mate/i);
});

test('parseCommand handles case-insensitivity and bot handle mentions', () => {
  assert.deepEqual(parseCommand('/Status'), { type: 'status' });
  assert.deepEqual(parseCommand('/status@my_bot'), { type: 'status' });
  assert.deepEqual(parseCommand('/STOP@my_bot crewA'), { type: 'stop', name: 'crewA' });
});

test('resolveBlockedKeys maps ok/allow variants to enter', () => {
  for (const word of ['ok', 'allow', 'yes', 'y', 'dong y', 'đồng ý', 'enter', 'ok please']) {
    assert.deepEqual(resolveBlockedKeys(word), { keys: ['enter'], label: 'Đồng ý (Enter)' });
  }
});

test('resolveBlockedKeys maps reject variants to esc', () => {
  for (const word of ['reject', 'no', 'deny', 'từ chối', 'tu choi', 'esc']) {
    assert.deepEqual(resolveBlockedKeys(word), { keys: ['esc'], label: 'Từ chối (Esc)' });
  }
});

test('resolveBlockedKeys maps a bare option number to arrow-down navigation plus enter', () => {
  assert.deepEqual(resolveBlockedKeys('1'), { keys: ['enter'], label: 'option 1 (Enter)' });
  assert.deepEqual(resolveBlockedKeys('2'), { keys: ['down', 'enter'], label: 'option 2 (↓ + Enter)' });
  assert.deepEqual(resolveBlockedKeys('3'), { keys: ['down', 'down', 'enter'], label: 'option 3 (↓↓ + Enter)' });
});

test('resolveBlockedKeys prefers an embedded option number over surrounding words', () => {
  assert.deepEqual(resolveBlockedKeys('ok 1'), { keys: ['enter'], label: 'option 1 (Enter)' });
  assert.deepEqual(resolveBlockedKeys('chọn 2'), { keys: ['down', 'enter'], label: 'option 2 (↓ + Enter)' });
});

test('resolveBlockedKeys returns null for anything else', () => {
  assert.equal(resolveBlockedKeys('hello'), null);
  assert.equal(resolveBlockedKeys(''), null);
  assert.equal(resolveBlockedKeys('oklahoma'), null);
});

test('parseCommand recognizes /firstmate with no arguments', () => {
  assert.deepEqual(parseCommand('/firstmate'), { type: 'firstmate' });
});

test('parseCommand handles /firstmate case-insensitivity and bot handle mentions', () => {
  assert.deepEqual(parseCommand('/FirstMate'), { type: 'firstmate' });
  assert.deepEqual(parseCommand('/firstmate@my_bot'), { type: 'firstmate' });
});
