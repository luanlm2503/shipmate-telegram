const test = require('node:test');
const assert = require('node:assert/strict');
const { diffAgentStatuses, FIRST_MATE_NAME } = require('./notifier');

test('detects a transition into blocked', () => {
  const previous = { crewA: 'working' };
  const current = [{ name: 'crewA', agent_status: 'blocked', workspace_id: 'w1' }];
  const events = diffAgentStatuses(previous, current);
  assert.deepEqual(events, [{ name: 'crewA', workspaceId: 'w1', kind: 'blocked' }]);
});

test('detects a transition into done from working', () => {
  const previous = { crewA: 'working' };
  const current = [{ name: 'crewA', agent_status: 'done', workspace_id: 'w1' }];
  const events = diffAgentStatuses(previous, current);
  assert.deepEqual(events, [{ name: 'crewA', workspaceId: 'w1', kind: 'finished' }]);
});

test('detects a transition into idle from working as finished', () => {
  const previous = { crewA: 'working' };
  const current = [{ name: 'crewA', agent_status: 'idle', workspace_id: 'w1' }];
  const events = diffAgentStatuses(previous, current);
  assert.deepEqual(events, [{ name: 'crewA', workspaceId: 'w1', kind: 'finished' }]);
});

test('does not notify when an agent that was already idle stays idle', () => {
  const previous = { crewA: 'idle' };
  const current = [{ name: 'crewA', agent_status: 'idle', workspace_id: 'w1' }];
  const events = diffAgentStatuses(previous, current);
  assert.deepEqual(events, []);
});

test('does not notify about the first-mate agent itself', () => {
  const previous = { [FIRST_MATE_NAME]: 'working' };
  const current = [{ name: FIRST_MATE_NAME, agent_status: 'blocked', workspace_id: 'w1' }];
  const events = diffAgentStatuses(previous, current);
  assert.deepEqual(events, []);
});

test('does not notify for a brand-new agent not seen before (no prior baseline)', () => {
  const previous = {};
  const current = [{ name: 'crewA', agent_status: 'blocked', workspace_id: 'w1' }];
  const events = diffAgentStatuses(previous, current);
  assert.deepEqual(events, []);
});

test('returns multiple events when several agents transition at once', () => {
  const previous = { crewA: 'working', crewB: 'working' };
  const current = [
    { name: 'crewA', agent_status: 'blocked', workspace_id: 'w1' },
    { name: 'crewB', agent_status: 'done', workspace_id: 'w2' },
  ];
  const events = diffAgentStatuses(previous, current);
  assert.deepEqual(events, [
    { name: 'crewA', workspaceId: 'w1', kind: 'blocked' },
    { name: 'crewB', workspaceId: 'w2', kind: 'finished' },
  ]);
});

test('detects a transition into finished from blocked', () => {
  const previous = { crewA: 'blocked' };
  const current = [{ name: 'crewA', agent_status: 'idle', workspace_id: 'w1' }];
  const events = diffAgentStatuses(previous, current);
  assert.deepEqual(events, [{ name: 'crewA', workspaceId: 'w1', kind: 'finished' }]);
});

test('handles invalid or empty inputs defensively', () => {
  assert.deepEqual(diffAgentStatuses(null, null), []);
  assert.deepEqual(diffAgentStatuses({}, null), []);
  assert.deepEqual(diffAgentStatuses(undefined, undefined), []);
});
