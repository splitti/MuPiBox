'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { monthlyReminderDue, donationDue } = require('../www/classic-notices.js');

test('statistics reminder is shown once per UTC month only when disabled', () => {
  assert.equal(monthlyReminderDue({enabled:false,lastReminderMonth:'2026-10'}, '2026-11'), true);
  assert.equal(monthlyReminderDue({enabled:false,lastReminderMonth:'2026-11'}, '2026-11'), false);
  assert.equal(monthlyReminderDue({enabled:true,lastReminderMonth:'2026-10'}, '2026-11'), false);
  assert.equal(monthlyReminderDue({enabled:false,lastReminderMonth:''}, 'invalid'), false);
});
test('weekly donation reminder respects seven-day interval', () => {
  const now = Date.UTC(2026, 10, 7);
  const day = 24 * 3600 * 1000;
  assert.equal(donationDue(null, now), true);
  assert.equal(donationDue(String(now - 6 * day), now), false);
  assert.equal(donationDue(String(now - 7 * day), now), true);
  assert.equal(donationDue(String(now + day), now), true);
});
