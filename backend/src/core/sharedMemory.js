/**
 * sharedMemory.js — PCAM Component 3
 * ─────────────────────────────────────────────────────────────────────────
 * Shared context store. Agents MUST check state before requesting API access.
 * Prevents any agent from re-computing data another agent already produced.
 *
 * Novel contribution: eliminates redundant LLM calls across the mesh.
 * If Agent A already extracted skills, Agent B reads them from memory —
 * it never re-asks the LLM.
 */

export class SharedMemory {
  constructor() {
    this._store    = {};
    this._log      = [];
    this._callCount = 0;
    this._savedCalls = 0;
  }

  /** Write a key. Any agent can then read it without an API call. */
  set(key, value, agentId = 'system') {
    this._store[key] = value;
    this._log.push({ ts: Date.now(), op: 'SET', key, agent: agentId });
  }

  /** Read. Returns null if not present (caller must then request API). */
  get(key) {
    return this._store[key] ?? null;
  }

  /** Check if key is already populated. */
  has(key) {
    return key in this._store && this._store[key] !== null;
  }

  /** Record that a real API call was made. */
  recordCall(taskBundle, agentIds) {
    this._callCount++;
    this._log.push({ ts: Date.now(), op: 'API_CALL', tasks: taskBundle, agents: agentIds });
  }

  /** Record that a call was saved (speculative reasoning succeeded). */
  recordSavedCall(agentId, reason) {
    this._savedCalls++;
    this._log.push({ ts: Date.now(), op: 'SAVED', agent: agentId, reason });
  }

  getStats() {
    return {
      totalApiCalls:  this._callCount,
      callsSaved:     this._savedCalls,
      efficiency:     this._callCount > 0
        ? `${Math.round(this._savedCalls / (this._callCount + this._savedCalls) * 100)}% API calls avoided`
        : 'N/A',
      memoryKeys:     Object.keys(this._store).length
    };
  }

  getLog() { return this._log; }
  dump()   { return { ...this._store }; }
}