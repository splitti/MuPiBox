'use strict';
// Classic admin notices only. No statistics request is ever made here.
function monthlyReminderDue(state, month) {
  return Boolean(state && state.enabled === false && state.statisticsPopupEnabled !== false &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && state.lastReminderMonth !== month);
}
function donationDue(state, month) {
  return Boolean(state && state.donationPopupEnabled !== false &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && state.lastDonationMonth !== month);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { monthlyReminderDue, donationDue };
}
if (typeof document !== 'undefined') {
  (function () {
    const state = window.classicAdminStatistics;
    if (!state || !document.body) return;
    const de = /^de\b/i.test(navigator.language || '');
    const t = (german, english) => de ? german : english;
    const donationUrl = 'https://mupibox.de/spenden/';
    const legacyKey = 'mupibox-classic-admin-donation-last-shown-v1';
    const month = new Date().toISOString().slice(0, 7);
    const dialogs = [];

    if (location.hash === '#classic-statistics') {
      const section = document.getElementById('classic-statistics');
      if (section) { section.open = true; setTimeout(() => section.scrollIntoView({block: 'start'}), 60); }
    }
    function legacyShownThisMonth() {
      try {
        const value = Number(localStorage.getItem(legacyKey));
        return Number.isFinite(value) && value > 0 &&
          new Date(value).toISOString().slice(0, 7) === month;
      } catch (_) { return false; }
    }
    function recordShown(kind) {
      const body = new URLSearchParams({csrf_token: String(state.csrf || ''), kind});
      fetch('statistics_reminder.php', {
        method: 'POST', credentials: 'same-origin',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: body.toString()
      }).catch(() => {}); // Local calendar marker only, no statistics sent.
    }
    function item(kind, title, description) {
      const dialog = document.createElement('dialog');
      dialog.className = 'classic-notice-dialog';
      dialog.setAttribute('aria-label', title);
      const heading = document.createElement('h2');
      heading.textContent = title;
      dialog.appendChild(heading);
      const p = document.createElement('p');
      p.textContent = description;
      dialog.appendChild(p);
      const actions = document.createElement('div');
      actions.className = 'classic-notice-actions';
      dialog.appendChild(actions);
      const button = (label, callback, primary) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = primary ? 'classic-notice-primary' : '';
        b.textContent = label;
        b.addEventListener('click', callback);
        actions.appendChild(b);
      };
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener('close', () => { showNext(); });
      document.body.appendChild(dialog);
      dialogs.push({kind, dialog, button});
      return {dialog, button};
    }
    if (donationDue(state, month) && !legacyShownThisMonth()) {
      const d = item('donation',
        t('MuPiBox Classic ist ein Community-Projekt', 'MuPiBox Classic is a community project'),
        t('Wir entwickeln MuPiBox gemeinsam mit der Community in unserer Freizeit und stellen das Projekt kostenlos zur Verfügung. Wenn dir MuPiBox gefällt, kannst du uns und die Weiterentwicklung mit einer freiwilligen Spende unterstützen. Natürlich bleibt MuPiBox ohne Spende uneingeschränkt nutzbar.',
          'We develop MuPiBox together with the community in our spare time and make the project available free of charge. If you enjoy MuPiBox, you can support us and its continued development with a voluntary donation. All features remain available without donating.'));
      d.button(t('Projekt unterstützen', 'Support the project'), () => {
        window.open(donationUrl, '_blank', 'noopener,noreferrer');
        d.dialog.close();
      }, true);
      d.button(t('Vielleicht später', 'Maybe later'), () => d.dialog.close());
    }
    if (monthlyReminderDue(state, month)) {
      const d = item('statistics',
        t('Hilf mit freiwilliger Statistik', 'Help improve MuPiBox with optional statistics'),
        t('Mit deiner freiwilligen Zustimmung können rein technische Angaben zu Version und Hardware bei der Weiterentwicklung helfen. Es werden keine abgespielten Inhalte oder Nutzungszeiten erfasst. Die Statistik ist standardmäßig deaktiviert und jederzeit widerrufbar.',
          'Optional technical installation and hardware statistics help improve MuPiBox Classic. No listening history or usage times are recorded. Statistics are off by default, and consent can be withdrawn at any time.'));
      d.button(t('Statistik-Einstellungen', 'Statistics settings'), () => {
        d.dialog.close();
        window.location.href = 'admin.php#classic-statistics';
      }, true);
      d.button(t('Nicht jetzt', 'Not now'), () => d.dialog.close());
    }
    let shown = false;
    function showNext() {
      if (document.querySelector('dialog[open]')) return;
      const next = dialogs.shift();
      if (!next) return;
      try {
        next.dialog.showModal();
        if (next.kind === 'donation') recordShown('donation');
        if (next.kind === 'statistics') { shown = true; recordShown('statistics'); }
      } catch (_) { next.dialog.remove(); showNext(); }
    }
    // Display these notices only in the Admin UI (this script is included after its auth gate).
    if (!shown) showNext();
  })();
}
