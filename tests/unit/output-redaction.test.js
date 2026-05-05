'use strict';
// Module under test: lib/output-redaction.js
// Contract: redact() replaces credential patterns with safe placeholders before they
//           leave the plugin boundary. All generic patterns tested; API-specific tests removed.

const test = require('node:test');
const assert = require('node:assert');

const { redact } = require('../../lib/output-redaction');

// Anthropic API key pattern
test('redact replaces Anthropic API key pattern sk-ant-* with [REDACTED-API-KEY]', () => {
  const input = 'Request failed with key sk-ant-foo123 — quota exceeded';
  const result = redact(input);
  assert.ok(!result.includes('sk-ant-foo123'), 'API key must not appear in output');
  assert.ok(result.includes('[REDACTED-API-KEY]'), 'Placeholder must appear in output');
});

// Authorization: Bearer <token>
test('redact replaces Authorization Bearer token with [REDACTED]', () => {
  const input = 'Server responded with Authorization: Bearer xyz — unauthorized';
  const result = redact(input);
  assert.ok(!result.includes('Bearer xyz'), 'Bearer token must not appear in output');
  assert.ok(result.includes('Authorization: [REDACTED]'), 'Authorization header placeholder must appear');
});

// x-api-key: <value>
test('redact replaces x-api-key header value with [REDACTED]', () => {
  const input = 'Header x-api-key: secret was rejected by the upstream service';
  const result = redact(input);
  assert.ok(!result.includes('secret'), 'x-api-key value must not appear in output');
  assert.ok(result.includes('x-api-key: [REDACTED]'), 'x-api-key placeholder must appear');
});

// Multiple patterns in one string
test('redact handles multiple credential patterns in one message', () => {
  const input = 'sk-ant-foo123 and Authorization: Bearer xyz and x-api-key: secret all in one';
  const result = redact(input);
  assert.ok(!result.includes('sk-ant-foo123'), 'API key must be redacted');
  assert.ok(!result.includes('Bearer xyz'), 'Bearer token must be redacted');
  assert.ok(!result.includes('x-api-key: secret'), 'x-api-key value must be redacted');
});

// Non-string input: should not throw
test('redact converts non-string input to string without throwing', () => {
  const result = redact(42);
  assert.strictEqual(typeof result, 'string');
  assert.strictEqual(result, '42');
});

// String with no credentials is returned unchanged
test('redact returns clean string unchanged when no credentials present', () => {
  const input = 'All systems nominal — no credentials here';
  const result = redact(input);
  assert.strictEqual(result, input);
});

// PEM private key blocks
test('redact removes BEGIN RSA PRIVATE KEY block', () => {
  const input =
    'Config:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA1234ABCD\n-----END RSA PRIVATE KEY-----\nEnd.';
  const result = redact(input);
  assert.ok(!result.includes('BEGIN RSA PRIVATE KEY'), 'Private key block must be redacted');
  assert.ok(!result.includes('MIIEpAIBAAKCAQEA1234ABCD'), 'Private key body must be redacted');
  assert.ok(result.includes('[REDACTED-PRIVATE-KEY-BLOCK]'), 'Placeholder must appear');
});

test('redact removes generic BEGIN PRIVATE KEY block', () => {
  const input = '-----BEGIN PRIVATE KEY-----\nfakekey==\n-----END PRIVATE KEY-----';
  const result = redact(input);
  assert.ok(!result.includes('fakekey=='), 'Private key content must be redacted');
  assert.ok(result.includes('[REDACTED-PRIVATE-KEY-BLOCK]'), 'Placeholder must appear');
});

// JWT tokens
test('redact removes JWT tokens (three-segment eyJ...eyJ...sig form)', () => {
  const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV';
  const input = `Authorization token: ${jwt}`;
  const result = redact(input);
  assert.ok(!result.includes(jwt), 'JWT must not appear in output');
  assert.ok(result.includes('[REDACTED-JWT]'), 'JWT placeholder must appear');
});

// Generic key=value patterns
test('redact removes api_key=<value> credential patterns', () => {
  const input = 'Config: api_key=supersecret123456789';
  const result = redact(input);
  assert.ok(!result.includes('supersecret123456789'), 'api_key value must be redacted');
  assert.ok(/api_key=\[REDACTED\]/i.test(result), 'api_key placeholder must appear');
});

test('redact removes password=<value> patterns', () => {
  const input = 'Connecting with password=MySecretPass1234';
  const result = redact(input);
  assert.ok(!result.includes('MySecretPass1234'), 'password value must be redacted');
  assert.ok(/password=\[REDACTED\]/i.test(result), 'password placeholder must appear');
});

test('redact removes token=<value> patterns', () => {
  const input = 'token=ghp_1234567890abcdefghij used for auth';
  const result = redact(input);
  assert.ok(!result.includes('ghp_1234567890abcdefghij'), 'token value must be redacted');
  assert.ok(/token=\[REDACTED\]/i.test(result), 'token placeholder must appear');
});
