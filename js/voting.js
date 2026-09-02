/**
 * voting.js
 * Handles vote.html: list candidates, single-selection, confirmation modal,
 * submit vote. All authorization/state checks are re-validated server-side —
 * this file only builds the UI and shows the right messages back to the user.
 */

(function () {
  'use strict';

  let selectedCandidateId = null;
  let candidatesById = {};

  function candidateCardHtml(c) {
    return (
      '<div class="candidate-card" data-id="' + c.candidateId + '" tabindex="0" role="button" aria-pressed="false">' +
      '<img class="candidate-photo" src="' + APP.escapeHtml(c.photoUrl || 'assets/images/placeholder-candidate.svg') + '" alt="Foto ' + APP.escapeHtml(c.name) + '">' +
      '<div class="candidate-body">' +
      '<span class="candidate-number">' + APP.escapeHtml(c.number) + '</span>' +
      '<div class="candidate-name">' + APP.escapeHtml(c.name) + '</div>' +
      (c.biography ? '<div class="candidate-bio">' + APP.escapeHtml(c.biography) + '</div>' : '') +
      (c.vision ? '<div class="candidate-vm"><b>Visi:</b> ' + APP.escapeHtml(c.vision) + '</div>' : '') +
      (c.mission ? '<div class="candidate-vm"><b>Misi:</b> ' + APP.escapeHtml(c.mission) + '</div>' : '') +
      '<div class="candidate-select-row">' +
      '<input type="radio" name="candidateChoice" id="cand-' + c.candidateId + '" value="' + c.candidateId + '">' +
      '<label for="cand-' + c.candidateId + '">PILIH CALON INI</label>' +
      '</div></div></div>'
    );
  }

  function selectCandidate(id) {
    selectedCandidateId = id;
    APP.qsa('.candidate-card').forEach((el) => {
      const isSelected = el.getAttribute('data-id') === id;
      el.classList.toggle('selected', isSelected);
      el.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      const radio = el.querySelector('input[type=radio]');
      if (radio) radio.checked = isSelected;
    });
    APP.qs('#continueBtn').disabled = false;
  }

  function openConfirmModal() {
    const c = candidatesById[selectedCandidateId];
    if (!c) return;
    APP.qs('#confirmNumber').textContent = c.number;
    APP.qs('#confirmName').textContent = c.name;
    APP.qs('#confirmAgree').checked = false;
    APP.qs('#confirmSendBtn').disabled = true;
    APP.qs('#confirmModal').classList.add('open');
  }
  function closeConfirmModal() {
    APP.qs('#confirmModal').classList.remove('open');
  }

  function submitVote() {
    return APP.call('submitVote', { candidateId: selectedCandidateId }, { loadingMessage: 'Menyimpan suara...' })
      .then((res) => {
        closeConfirmModal();
        sessionStorage.setItem('hw_last_vote_ref', res.referenceCode || '');
        window.location.href = 'vote.html?done=1';
      })
      .catch((err) => {
        closeConfirmModal();
        // Server already re-validated everything (status, hasVoted, election window,
        // candidate active) — surface its message and refresh state.
        if (err.code === 'ALREADY_VOTED') {
          renderAlreadyVoted();
        }
      });
  }

  function renderAlreadyVoted(refCode) {
    APP.qs('#voteArea').innerHTML =
      '<div class="card center">' +
      '<h3>TERIMA KASIH</h3>' +
      '<p>Suara Anda telah berhasil dicatat.</p>' +
      '<div class="status-badge status-voted"><span class="dot"></span>SUDAH MEMILIH</div>' +
      (refCode ? '<div><span class="reference-code">' + APP.escapeHtml(refCode) + '</span></div>' : '') +
      '<a href="dashboard.html" class="btn btn-primary btn-block mt-24">KEMBALI KE DASHBOARD</a>' +
      '</div>';
  }

  function renderBlocked(message) {
    APP.qs('#voteArea').innerHTML =
      '<div class="card center">' +
      '<div class="info-box warn">' + APP.escapeHtml(message) + '</div>' +
      '<a href="dashboard.html" class="btn btn-outline btn-block mt-16">KEMBALI KE DASHBOARD</a>' +
      '</div>';
  }

  function init() {
    const session = APP.requireLogin('login.html');
    if (!session) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('done') === '1') {
      renderAlreadyVoted(sessionStorage.getItem('hw_last_vote_ref') || '');
      return;
    }

    // Server re-checks voter status, election window, and hasVoted before
    // returning candidates — the frontend never decides eligibility itself.
    APP.call('getVoterStatus', {}, { silent: true }).then((statusRes) => {
      if (statusRes.status === 'VOTED') { renderAlreadyVoted(statusRes.referenceCode); return; }
      if (statusRes.status === 'PENDING') { renderBlocked('Pendaftaran Anda masih menunggu verifikasi Admin.'); return; }
      if (statusRes.status === 'REJECTED') { renderBlocked('Pendaftaran Anda belum dapat disetujui. Silakan hubungi Admin.'); return; }
      if (statusRes.status === 'NOT_REGISTERED') { window.location.href = 'register.html'; return; }

      APP.call('getElectionStatus', {}, { silent: true }).then((electionRes) => {
        if (electionRes.status !== 'OPEN') {
          renderBlocked('Pemungutan suara telah ditutup.');
          return;
        }
        loadCandidates();
      });
    });
  }

  function loadCandidates() {
    APP.call('getCandidates', {}).then((candidates) => {
      candidatesById = {};
      candidates.forEach((c) => { candidatesById[c.candidateId] = c; });

      const grid = APP.qs('#candidateGrid');
      grid.innerHTML = candidates.map(candidateCardHtml).join('');

      APP.qsa('.candidate-card').forEach((el) => {
        el.addEventListener('click', () => selectCandidate(el.getAttribute('data-id')));
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCandidate(el.getAttribute('data-id')); }
        });
      });

      APP.qs('#continueBtn').addEventListener('click', () => {
        if (!selectedCandidateId) return;
        openConfirmModal();
      });
      APP.qs('#confirmBackBtn').addEventListener('click', closeConfirmModal);
      APP.qs('#confirmAgree').addEventListener('change', (e) => {
        APP.qs('#confirmSendBtn').disabled = !e.target.checked;
      });
      APP.qs('#confirmSendBtn').addEventListener('click', APP.disableWhileRunning(APP.qs('#confirmSendBtn'), submitVote));
    });
  }

  window.VOTING_PAGE = { init };
})();
