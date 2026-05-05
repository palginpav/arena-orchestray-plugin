'use strict';

/**
 * lib/output-redaction.js — String redaction for credentials and auth tokens.
 *
 * Applied to all error messages, stderr writes, and log strings before they
 * leave the plugin boundary. The plugin runs unsandboxed (H4) so credentials
 * MUST NOT appear in transcript files, audit events, or JSON-RPC error responses.
 */

const PATTERNS = [
  // Anthropic API key in any context
  { re: /sk-ant-[A-Za-z0-9_-]+/g, replacement: '[REDACTED-API-KEY]' },
  // Authorization: Bearer <token>
  { re: /Authorization:\s*Bearer\s+\S+/gi, replacement: 'Authorization: [REDACTED]' },
  // x-api-key: <value>
  { re: /x-api-key:\s*\S+/gi, replacement: 'x-api-key: [REDACTED]' },
  // PEM private key blocks (RSA, EC, PKCS8, etc.)
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replacement: '[REDACTED-PRIVATE-KEY-BLOCK]' },
  // JWT tokens: three base64url segments starting with eyJ (header.payload.signature)
  { re: /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replacement: '[REDACTED-JWT]' },
  // Generic key=value patterns: api_key, password, secret, token followed by a value
  { re: /(api[_-]?key|password|secret|token)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]{8,}['"]?/gi, replacement: '$1=[REDACTED]' },
];

/**
 * Replace credential patterns in a string with safe placeholders.
 * @param {string} s - Input string (error message, log line, etc.)
 * @returns {string} - Redacted copy
 */
function redact(s) {
  if (typeof s !== 'string') return String(s);
  let out = s;
  for (const { re, replacement } of PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

module.exports = { redact };
