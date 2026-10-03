import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyProgress, loadTracked, track } from '../public/js/my-reports.js';

test('citizen tracking removes deleted reports without losing a report submitted during refresh', t => {
  const values = new Map<string,string>();
  t.mock.method(globalThis, 'localStorage', undefined);
});
