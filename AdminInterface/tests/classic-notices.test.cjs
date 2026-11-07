'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { monthlyReminderDue, donationDue } = require('../www/classic-notices.js');

test('statistics reminder is shown once per UTC month only when disabled', () => {
  assert.equal(monthlyReminderDue({enabled:false,lastReminderMonth:'2026-10'}, '2026-11'), true);
  assert.equal(monthlyReminderDue({enabled:false,lastReminderMonth:'2026-11'}, '2026-11'), false);
  assert.equal(monthlyReminderDue({enabled:true,lastReminderMonth:'2026-10'}, '2026-11'), false);
  assert.equal(monthlyReminderDue({enabled:false,lastReminderMonth:''}, 'invalid'), false);
  assert.equal(monthlyReminderDue({enabled:false,statisticsPopupEnabled:false,lastReminderMonth:'2026-10'}, '2026-11'), false);
});
test('donation reminder is monthly and can be disabled', () => {
  assert.equal(donationDue({ lastDonationMonth: '' }, '2026-11'), true);
  assert.equal(donationDue({ lastDonationMonth: '2026-11' }, '2026-11'), false);
  assert.equal(donationDue({ lastDonationMonth: '2026-10' }, '2026-11'), true);
  assert.equal(donationDue({ donationPopupEnabled: false, lastDonationMonth: '2026-10' }, '2026-11'), false);
});
