/**
 * voter.js
 * Handles: register.html (submit pendaftaran voter) and status.html (tampilkan status).
 */

(function () {
  'use strict';

  const STATUS_LABEL = {
    NOT_REGISTERED: { text: 'BELUM TERDAFTAR', cls: 'status-pending', dot: '🟡' },
    PENDING: { text: 'MENUNGGU APPROVAL', cls: 'status-pending', dot: '🟡' },
    APPROVED: { text: 'DISETUJUI', cls: 'status-approved', dot: '🟢' },
    REJECTED: { text: 'DITOLAK', cls: 'status-rejected', dot: '🔴' },
    VOTED: { text: 'SUDAH MEMILIH', cls: 'status-voted', dot: '🔵' }
  };

  function initRegisterPage() {
    const session = APP.requireLogin('login.html');
    if (!session) return;

    APP.qs('#voterEmail').value = session.email;
    APP.qs('#voterName').value = session.name || '';

    // If already registered, skip straight to status.
    APP.call('getVoterStatus', {}, { silentError: true }).then((res) => {
      if (res && res.status && res.status !== 'NOT_REGISTERED') {
        window.location.href = 'status.html';
      }
    }).catch(() => { /* not registered yet — fine, stay on the form */ });

    const form = APP.qs('#registerForm');
    const submitBtn = APP.qs('#submitRegister');
    const agree = APP.qs('#agreeCheck');

    agree.addEventListener('change', () => { submitBtn.disabled = !agree.checked; });

    form.addEventListener('submit', APP.disableWhileRunning(submitBtn, function (e) {
      e.preventDefault();
      if (!agree.checked) return;

      const payload = {
        whatsapp: APP.qs('#voterWhatsapp').value.trim(),
        identityNumber: APP.qs('#voterIdentity').value.trim(),
        origin: APP.qs('#voterOrigin').value.trim(),
        position: APP.qs('#voterPosition').value.trim(),
        memberNumber: APP.qs('#voterMemberNumber').value.trim(),
        notes: APP.qs('#voterNotes').value.trim()
      };

      if (!payload.origin || payload.origin.length < 2) {
        APP.toast('Asal Kwartir Cabang / Qobilah wajib diisi.', 'error');
        return Promise.resolve();
      }

      return APP.call('registerVoter', payload, { loadingMessage: 'Mengirim pendaftaran...' })
        .then(() => {
          window.location.href = 'status.html?registered=1';
        });
    }));
  }

  function renderStatusCard(res, container) {
    const s = STATUS_LABEL[res.status] || STATUS_LABEL.NOT_REGISTERED;
    let extra = '';

    if (res.status === 'PENDING') {
      extra = '<div class="info-box">Anda belum dapat memberikan suara sebelum pendaftaran disetujui oleh Admin.</div>';
    } else if (res.status === 'REJECTED') {
      extra = '<div class="info-box warn">Pendaftaran Anda belum dapat disetujui. Silakan hubungi Admin.'
        + (res.rejectionReason ? '<br><b>Catatan Admin:</b> ' + APP.escapeHtml(res.rejectionReason) : '') + '</div>';
    } else if (res.status === 'APPROVED') {
      extra = '<a href="vote.html" class="btn btn-gold btn-block mt-16">MULAI PEMILIHAN</a>';
    } else if (res.status === 'VOTED') {
      extra = '<div class="info-box">Anda telah menggunakan hak suara. Terima kasih atas partisipasi Anda.'
        + (res.referenceCode ? '<br><span class="reference-code">' + APP.escapeHtml(res.referenceCode) + '</span>' : '') + '</div>';
    } else {
      extra = '<a href="register.html" class="btn btn-primary btn-block mt-16">DAFTAR SEBAGAI PEMILIH</a>';
    }

    container.innerHTML =
      '<div class="status-card">' +
      '<h3>STATUS PEMILIH</h3>' +
      '<p class="muted">Nama<br><b style="color:var(--hw-ink)">' + APP.escapeHtml(res.name || '-') + '</b></p>' +
      '<p class="muted">Email<br>' + APP.escapeHtml(res.email || '-') + '</p>' +
      '<div class="status-badge ' + s.cls + '"><span class="dot"></span>' + s.text + '</div>' +
      extra +
      '</div>';
  }

  function initStatusPage() {
    const session = APP.requireLogin('login.html');
    if (!session) return;

    const container = APP.qs('#statusContainer');
    APP.call('getVoterStatus', {}).then((res) => {
      renderStatusCard(res, container);
    }).catch(() => {
      container.innerHTML = '<div class="info-box warn">Tidak dapat memuat status. Silakan coba kembali.</div>';
    });
  }

  window.VOTER_PAGE = { initRegisterPage, initStatusPage };
})();
