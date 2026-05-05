'use strict';

/**
 * lib/errors.js — Typed error classes for the Arena plugin.
 *
 * Each error maps to a JSON-RPC error code and carries a human-readable message.
 * Tool handlers catch these and convert via toJsonRpcError() before responding to the caller.
 */

class ArenaError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }

  /** @returns {{ code: number, message: string }} */
  toJsonRpcError() {
    return { code: this.code, message: this.message };
  }
}

/** Bad parameters — tool args fail schema or business validation. Code -32602. */
class BadParamsError extends ArenaError {
  constructor(message) {
    super(message);
    this.code = -32602;
  }
}

/** Internal unexpected error inside a tool handler. Code -32603. */
class InternalError extends ArenaError {
  constructor(message) {
    super(message);
    this.code = -32603;
  }
}

/** Tool name not in TOOLS map. Code -32601. */
class ToolNotFoundError extends ArenaError {
  constructor(message) {
    super(message);
    this.code = -32601;
  }
}

/**
 * validateCustomAgentFile returned {ok:false} OR the 3-section refinement cap
 * was hit. Code -32099 (custom).
 */
class ValidatorRejectedError extends ArenaError {
  constructor(message) {
    super(message);
    this.code = -32099;
  }
}

/** Input path lstat'd as symlink — refused for security. Code -32097 (custom). */
class SymlinkError extends ArenaError {
  constructor(message) {
    super(message);
    this.code = -32097;
  }
}

module.exports = {
  ArenaError,
  BadParamsError,
  InternalError,
  ToolNotFoundError,
  ValidatorRejectedError,
  SymlinkError,
};
