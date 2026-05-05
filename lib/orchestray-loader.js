'use strict';

/**
 * lib/orchestray-loader.js — Strict runtime loader for orchestray internals.
 *
 * Requires orchestray's modules from the user's installed location at
 * ~/.claude/orchestray/bin/_lib/. If orchestray is missing or the module
 * API is incompatible, throws OrchestrayMissingError with install instructions.
 * NO vendored fallback path exists — arena requires orchestray to function.
 */

const path = require('path');
const os = require('os');

/**
 * Thrown when orchestray cannot be loaded from its expected install location.
 * Carries JSON-RPC code -32603 (internal error).
 */
class OrchestrayMissingError extends Error {
  constructor(reason) {
    super(
      `arena requires orchestray to be installed at ~/.claude/orchestray/. ` +
      `Reason: ${reason}. ` +
      `Install via: npm install -g @palginpav/orchestray (or follow https://github.com/palginpav/orchestray).`
    );
    this.name = 'OrchestrayMissingError';
    this.code = -32603;
  }
}

const ORCHESTRAY_LIB = path.join(os.homedir(), '.claude', 'orchestray', 'bin', '_lib');

let _customAgents = null;
let _canonicalAgents = null;

/**
 * Load custom-agents.js from orchestray's installed location.
 * Throws OrchestrayMissingError if not found or API is incompatible.
 * @returns {object} The loaded module (exposes validateCustomAgentFile, etc.)
 */
function loadCustomAgents() {
  if (_customAgents) return _customAgents;
  const p = path.join(ORCHESTRAY_LIB, 'custom-agents.js');
  let m;
  try {
    m = require(p);
  } catch (e) {
    throw new OrchestrayMissingError(`could not require ${p}: ${e.message}`);
  }
  if (typeof m.validateCustomAgentFile !== 'function') {
    throw new OrchestrayMissingError(
      `${p} loaded but validateCustomAgentFile is missing — orchestray version too old`
    );
  }
  _customAgents = m;
  return m;
}

/**
 * Load canonical-agents.js from orchestray's installed location.
 * Throws OrchestrayMissingError if not found or CANONICAL_AGENTS is missing.
 * @returns {object} The loaded module (exposes CANONICAL_AGENTS Set, etc.)
 */
function loadCanonicalAgents() {
  if (_canonicalAgents) return _canonicalAgents;
  const p = path.join(ORCHESTRAY_LIB, 'canonical-agents.js');
  let m;
  try {
    m = require(p);
  } catch (e) {
    throw new OrchestrayMissingError(`could not require ${p}: ${e.message}`);
  }
  if (!m.CANONICAL_AGENTS) {
    throw new OrchestrayMissingError(
      `${p} loaded but CANONICAL_AGENTS export missing — orchestray version too old`
    );
  }
  _canonicalAgents = m;
  return m;
}

/**
 * Reset memoised module cache (used in tests to simulate different load scenarios).
 */
function _resetLoaderCache() {
  _customAgents = null;
  _canonicalAgents = null;
}

module.exports = { loadCustomAgents, loadCanonicalAgents, OrchestrayMissingError, _resetLoaderCache };
