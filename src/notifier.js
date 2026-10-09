const { FIRST_MATE_NAME } = require('./firstMate');

const FINISHED_STATUSES = new Set(['idle', 'done']);

/**
 * Compare the previous status-by-name map to a fresh `herdr agent list`
 * result and return notification events for genuine transitions only.
 * A brand-new agent (no entry in `previous`) never fires on its first
 * observation — there is nothing to transition *from* yet.
 * @param {Record<string,string>} [previous]
 * @param {Array<{name:string, agent_status:string, workspace_id:string}>} [current]
 * @returns {Array<{name:string, workspaceId:string, kind:'blocked'|'finished'}>}
 */
function diffAgentStatuses(previous = {}, current = []) {
  if (!previous || typeof previous !== 'object' || !Array.isArray(current)) {
    return [];
  }
  const events = [];
  for (const agent of current) {
    if (!agent) continue;
    const key = agent.name || agent.pane_id;
    if (!key || agent.name === FIRST_MATE_NAME) continue;
    if (!Object.hasOwn(previous, key)) continue;
    const previousStatus = previous[key];
    if (previousStatus === agent.agent_status) continue;

    const displayName = agent.name || agent.terminal_title_stripped || agent.pane_id;
    if (agent.agent_status === 'blocked') {
      events.push({ name: displayName, workspaceId: agent.workspace_id, kind: 'blocked' });
    } else if (
      (previousStatus === 'working' || previousStatus === 'blocked') &&
      FINISHED_STATUSES.has(agent.agent_status)
    ) {
      events.push({ name: displayName, workspaceId: agent.workspace_id, kind: 'finished' });
    }
  }
  return events;
}

module.exports = { FIRST_MATE_NAME, diffAgentStatuses };
