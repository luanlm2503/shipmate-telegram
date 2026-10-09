const test = require('node:test');
const assert = require('node:assert/strict');
const { HerdrError } = require('./herdr');
const { ensureFirstMate, promptFirstMate, FIRST_MATE_NAME } = require('./firstMate');

function fakeState() {
  const store = {};
  return {
    load: () => ({ ...store }),
    save: (s) => Object.assign(store, s),
  };
}

test('ensureFirstMate reuses the pane when herdr agent get succeeds', async () => {
  const calls = [];
  const fakeRunHerdr = async (args) => {
    calls.push(args);
    if (args[0] === 'agent' && args[1] === 'get') {
      return { agent: { name: FIRST_MATE_NAME, agent_status: 'idle', pane_id: 'w1:p1', workspace_id: 'w1' } };
    }
    throw new Error(`unexpected call: ${args.join(' ')}`);
  };
  const state = fakeState();
  await ensureFirstMate({ runHerdr: fakeRunHerdr, state, agentKind: 'opencode' });
  assert.deepEqual(calls, [['agent', 'get', FIRST_MATE_NAME]]);
});

test('ensureFirstMate creates a new workspace and starts the agent when not found', async () => {
  const calls = [];
  const fakeRunHerdr = async (args) => {
    calls.push(args);
    if (args[0] === 'agent' && args[1] === 'get') {
      throw new HerdrError('agent_not_found', 'agent target first-mate not found');
    }
    if (args[0] === 'workspace' && args[1] === 'create') {
      return { workspace: { workspace_id: 'w9' }, root_pane: { pane_id: 'w9:p1' } };
    }
    if (args[0] === 'agent' && args[1] === 'start') {
      return { agent: { name: FIRST_MATE_NAME, agent_status: 'idle', pane_id: 'w9:p1', workspace_id: 'w9' } };
    }
    throw new Error(`unexpected call: ${args.join(' ')}`);
  };
  const state = fakeState();
  const info = await ensureFirstMate({ runHerdr: fakeRunHerdr, state, agentKind: 'opencode' });
  assert.equal(info.pane_id, 'w9:p1');
  assert.deepEqual(state.load(), { firstMateWorkspaceId: 'w9', firstMatePaneId: 'w9:p1' });
  const kinds = calls.map((c) => c.join(' '));
  assert.ok(kinds.some((k) => k.startsWith('workspace create')));
  assert.ok(kinds.some((k) => k.startsWith('agent start first-mate')));
});

test('promptFirstMate returns the cleaned reply on a normal --wait success', async () => {
  const fakeRunHerdr = async (args) => {
    if (args[0] === 'agent' && args[1] === 'prompt') {
      return { agent: { agent_status: 'idle' } };
    }
    if (args[0] === 'agent' && args[1] === 'read') {
      return 'raw terminal text with the reply';
    }
    throw new Error(`unexpected call: ${args.join(' ')}`);
  };
  const reply = await promptFirstMate({ runHerdr: fakeRunHerdr, text: 'hello' });
  assert.equal(typeof reply, 'string');
});

test('promptFirstMate recovers from agent_prompt_stalled by checking agent get', async () => {
  let promptCalled = false;
  const fakeRunHerdr = async (args) => {
    if (args[0] === 'agent' && args[1] === 'prompt') {
      promptCalled = true;
      throw new HerdrError('agent_prompt_stalled', 'agent prompt produced no observed working or blocked state within 5000 ms; current status is idle');
    }
    if (args[0] === 'agent' && args[1] === 'get') {
      return { agent: { agent_status: 'idle' } };
    }
    if (args[0] === 'agent' && args[1] === 'read') {
      return 'raw terminal text';
    }
    throw new Error(`unexpected call: ${args.join(' ')}`);
  };
  const reply = await promptFirstMate({ runHerdr: fakeRunHerdr, text: 'hello' });
  assert.ok(promptCalled);
  assert.equal(typeof reply, 'string');
});

test('promptFirstMate recovers from timeout the same way as agent_prompt_stalled', async () => {
  const fakeRunHerdr = async (args) => {
    if (args[0] === 'agent' && args[1] === 'prompt') {
      throw new HerdrError('timeout', 'timed out waiting for agent status');
    }
    if (args[0] === 'agent' && args[1] === 'get') {
      return { agent: { agent_status: 'done' } };
    }
    if (args[0] === 'agent' && args[1] === 'read') {
      return 'raw terminal text';
    }
    throw new Error(`unexpected call: ${args.join(' ')}`);
  };
  const reply = await promptFirstMate({ runHerdr: fakeRunHerdr, text: 'hello' });
  assert.equal(typeof reply, 'string');
});

test('promptFirstMate rethrows if agent get after a stall also shows a stuck state', async () => {
  const fakeRunHerdr = async (args) => {
    if (args[0] === 'agent' && args[1] === 'prompt') {
      throw new HerdrError('timeout', 'timed out waiting for agent status');
    }
    if (args[0] === 'agent' && args[1] === 'get') {
      return { agent: { agent_status: 'working' } };
    }
    throw new Error(`unexpected call: ${args.join(' ')}`);
  };
  await assert.rejects(
    () => promptFirstMate({ runHerdr: fakeRunHerdr, text: 'hello' }),
    (err) => err instanceof HerdrError && err.code === 'timeout'
  );
});
