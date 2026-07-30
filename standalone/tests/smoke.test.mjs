import { test } from 'node:test';
import assert from 'node:assert/strict';

// Smoke test — verifies node's native --test runner works on this
// project before we invest in real feature tests. If this fails, the
// test harness itself is broken, not the feature under test.
test('node --test runner works', () => {
    assert.equal(1 + 1, 2);
});

test('esm imports work inside test files', async () => {
    const { getEffectiveFestivalDay } = await import('../js/festival.js');
    assert.equal(typeof getEffectiveFestivalDay, 'function');
});
