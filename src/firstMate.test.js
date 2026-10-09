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

test('promptFirstMate summarizes long replies down to the trailing lines', async () => {
  const long = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');
  const fakeRunHerdr = async (args) => {
    if (args[0] === 'agent' && args[1] === 'prompt') {
      return { agent: { agent_status: 'idle' } };
    }
    if (args[0] === 'agent' && args[1] === 'get') {
      return { agent: { agent_status: 'idle' } };
    }
    if (args[0] === 'agent' && args[1] === 'read') {
      return long;
    }
    throw new Error(`unexpected call: ${args.join(' ')}`);
  };
  const reply = await promptFirstMate({ runHerdr: fakeRunHerdr, text: 'hello', replyMaxLines: 5 });
  assert.ok(reply.split('\n').length <= 6, `expected <= 6 lines, got ${reply.split('\n').length}`);
  assert.ok(reply.includes('line 50'), 'must keep the most recent lines');
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

test('promptFirstMate recovers from stall/timeout when status is blocked', async () => {
  const fakeRunHerdr = async (args) => {
    if (args[0] === 'agent' && args[1] === 'prompt') {
      throw new HerdrError('timeout', 'timed out waiting for agent status');
    }
    if (args[0] === 'agent' && args[1] === 'get') {
      return { agent: { agent_status: 'blocked' } };
    }
    if (args[0] === 'agent' && args[1] === 'read') {
      return 'approval needed: approve?';
    }
    throw new Error(`unexpected call: ${args.join(' ')}`);
  };
  const reply = await promptFirstMate({ runHerdr: fakeRunHerdr, text: 'delete file' });
  assert.match(reply, /approval needed: approve\?/);
  assert.match(reply, /chờ duyệt/);
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

test('ensureFirstMate cleans up created workspace if agent start fails', async () => {
  const calls = [];
  const fakeRunHerdr = async (args) => {
    calls.push(args);
    if (args[0] === 'agent' && args[1] === 'get') {
      throw new HerdrError('agent_not_found', 'agent target first-mate not found');
    }
    if (args[0] === 'workspace' && args[1] === 'create') {
      return { workspace: { workspace_id: 'wTemp' }, root_pane: { pane_id: 'wTemp:p1' } };
    }
    if (args[0] === 'agent' && args[1] === 'start') {
      throw new Error('agent binary crashed');
    }
    if (args[0] === 'workspace' && args[1] === 'close') {
      return { ok: true };
    }
    throw new Error(`unexpected call: ${args.join(' ')}`);
  };
  await assert.rejects(
    () => ensureFirstMate({ runHerdr: fakeRunHerdr, state: fakeState(), agentKind: 'opencode' }),
    /agent binary crashed/
  );
  assert.ok(calls.some((c) => c[0] === 'workspace' && c[1] === 'close' && c[2] === 'wTemp'));
});

test('promptFirstMate prepends the Telegram non-interactive directive to forwarded text', async () => {
  const { TELEGRAM_DIRECTIVE } = require('./firstMate');
  let captured = null;
  const fakeRunHerdr = async (args) => {
    if (args[0] === 'agent' && args[1] === 'prompt') {
      captured = args[3];
      return { agent: { agent_status: 'idle' } };
    }
    if (args[0] === 'agent' && args[1] === 'get') {
      return { agent: { agent_status: 'idle' } };
    }
    if (args[0] === 'agent' && args[1] === 'read') {
      return 'ready';
    }
    throw new Error(`unexpected call: ${args.join(' ')}`);
  };
  const reply = await promptFirstMate({ runHerdr: fakeRunHerdr, text: 'open a crew' });
  assert.ok(typeof TELEGRAM_DIRECTIVE === 'string' && TELEGRAM_DIRECTIVE.length > 0, 'directive constant must exist');
  assert.ok(captured.includes('open a crew'), 'user text must be preserved');
  assert.ok(captured.includes(TELEGRAM_DIRECTIVE), 'directive must be prepended');
  assert.equal(typeof reply, 'string');
});

test('Telegram directive defaults to the shipmate workflow', async () => {
  const { TELEGRAM_DIRECTIVE } = require('./firstMate');
  assert.match(TELEGRAM_DIRECTIVE, /shipmate/, 'directive must name the shipmate skill');
  assert.match(TELEGRAM_DIRECTIVE, /trust-all|dangerously-skip-permissions|--auto/i, 'directive must cover trust-all crew startup');
  assert.match(TELEGRAM_DIRECTIVE, /worktree|crew/i, 'directive must cover the worktree crew default');
});

test('readFirstMateViewport returns status header plus cleaned viewport', async () => {
  const { readFirstMateViewport } = require('./firstMate');
  const fakeRunHerdr = async (args, options) => {
    if (args[0] === 'agent' && args[1] === 'get') {
      return { agent: { name: 'first-mate', agent_status: 'working', workspace_id: 'wK' } };
    }
    if (args[0] === 'agent' && args[1] === 'read') {
      assert.deepEqual(args.slice(0, 3), ['agent', 'read', 'first-mate']);
      assert.ok(args.includes('visible'), 'must read the visible viewport source');
      assert.deepEqual(options, { raw: true });
      return '┃ doing stuff   █ 12:00';
    }
    throw new Error(`unexpected call: ${args.join(' ')}`);
  };
  const reply = await readFirstMateViewport({ runHerdr: fakeRunHerdr });
  assert.match(reply, /first-mate/);
  assert.match(reply, /working/);
  assert.match(reply, /wK/);
  assert.match(reply, /doing stuff/);
  assert.doesNotMatch(reply, /┃/);
});

test('readFirstMateViewport reports clearly when first-mate is not running', async () => {
  const { readFirstMateViewport } = require('./firstMate');
  const fakeRunHerdr = async (args) => {
    if (args[0] === 'agent' && args[1] === 'get') {
      throw new HerdrError('agent_not_found', 'agent target first-mate not found');
    }
    throw new Error(`unexpected call: ${args.join(' ')}`);
  };
  const reply = await readFirstMateViewport({ runHerdr: fakeRunHerdr });
  assert.match(reply, /not.*running/i);
});

test('readFirstMateViewport degrades to header-only when viewport read fails', async () => {
  const { readFirstMateViewport } = require('./firstMate');
  const fakeRunHerdr = async (args) => {
    if (args[0] === 'agent' && args[1] === 'get') {
      return { agent: { name: 'first-mate', agent_status: 'idle', workspace_id: 'wK' } };
    }
    if (args[0] === 'agent' && args[1] === 'read') {
      throw new HerdrError('process_error', 'read failed');
    }
    throw new Error(`unexpected call: ${args.join(' ')}`);
  };
  const reply = await readFirstMateViewport({ runHerdr: fakeRunHerdr });
  assert.match(reply, /idle/);
  assert.match(reply, /could not be read|couldn't be read|unavailable/i);
});
