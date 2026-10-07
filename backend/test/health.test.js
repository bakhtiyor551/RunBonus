import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHealth } from '../src/services/healthPayload.js';

describe('health summary', () => {
  it('is ok when database is ok and redis is skipped', () => {
    const h = summarizeHealth({ database: 'ok', redis: 'skipped' });
    assert.equal(h.status, 'ok');
    assert.equal(h.service, 'runbonus-api');
    assert.equal(h.ok, true);
  });

  it('is ok when database and redis are ok', () => {
    const h = summarizeHealth({ database: 'ok', redis: 'ok' });
    assert.equal(h.status, 'ok');
  });

  it('is error when database fails', () => {
    const h = summarizeHealth({ database: 'error', redis: 'ok' });
    assert.equal(h.status, 'error');
    assert.equal(h.ok, false);
  });

  it('is error when redis is configured and fails', () => {
    const h = summarizeHealth({ database: 'ok', redis: 'error' });
    assert.equal(h.status, 'error');
  });
});
