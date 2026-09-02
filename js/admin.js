/**
 * admin.js
 * Powers admin.html. Every admin action re-checks authorization server-side
 * in GAS (AdminService.gs) against ADMIN_EMAILS in Script Properties —
 * this file never grants access on its own; it only calls the API and
 * renders what comes back. If a non-admin token calls any admin endpoint,
 * GAS rejects it regardless of anything the frontend does.
 */

(function () {
  'use strict';

  let currentTab = 'dashboard';
  let currentFilter = 'ALL';
  let votersCache = [];

  const PILL = {
    PENDING: 'pill-pending', APPROVED: 'pill-approved', REJECTED: 'pill-rejected', VOTED: 'pill-voted'
  };
  const PILL_LABEL = {
    PENDING: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak', VOTED: 'Sudah Memilih'
  };

  function switchTab(tab) {
    currentTab = tab;
    APP.qsa('.admin-tab').forEach((el) => el.classList.toggle('active', el.dataset.tab === tab));
    APP.qsa('.admin-panel').forEach((el) => el.classList.toggle('hidden', el.id !== 'panel-' + tab));
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'voters') loadVoters();
    if (tab === 'candidates') loadCandidates();
    if (tab === 'results') loadResults();
    if (tab === 'election') loadElectionSettings();
  }

  /* ---------------- Dashboard ---------------- */
  function loadDashboard() {
    APP.call('adminGetDashboard', {}).then((d) => {
      const box = APP.qs('#dashboardStats');
      box.innerHTML =
        statBox(d.totalVoters, 'TOTAL PENDAFTAR') +
        statBox(d.pending, 'MENUNGGU') +
        statBox(d.approved, 'DISETUJUI') +
        statBox(d.rejected, 'DITOLAK') +
        statBox(d.voted, 'SUDAH MEMILIH') +
        statBox(d.notVoted, 'BELUM MEMILIH');

      const participationPct = d.approved > 0 ? ((d.voted / d.approved) * 100).toFixed(2) : '0.00';
      APP.qs('#participationBox').innerHTML =
        '<div class="progress-participation">' +
        '<div class="num-row"><span>PARTISIPASI</span><b>' + d.voted + ' / ' + d.approved + '</b></div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + Math.min(participationPct, 100) + '%"></div></div>' +
        '<div class="result-meta">' + participationPct + '%</div>' +
        '</div>';
    });
  }
  function statBox(num, label) {
    return '<div class="stat-box"><div class="num">' + num + '</div><div class="lbl">' + label + '</div></div>';
  }

  /* ---------------- Voter verification ---------------- */
  function loadVoters() {
    APP.call('adminGetVoters', {}).then((voters) => {
      votersCache = voters;
      renderVoterTable();
    });
  }

  function renderVoterTable() {
    const filtered = currentFilter === 'ALL' ? votersCache : votersCache.filter((v) => v.status === currentFilter);
    const rows = filtered.map((v) => (
      '<tr>' +
      '<td>' + APP.escapeHtml(v.name) + '</td>' +
      '<td>' + APP.escapeHtml(v.email) + '</td>' +
      '<td>' + APP.escapeHtml(v.origin || '-') + '</td>' +
      '<td>' + APP.escapeHtml(v.position || '-') + '</td>' +
      '<td><span class="pill ' + (PILL[v.status] || 'pill-pending') + '">' + (PILL_LABEL[v.status] || v.status) + '</span></td>' +
      '<td><div class="row-actions">' +
      (v.status === 'PENDING'
        ? '<button class="approve" data-id="' + v.voterId + '" data-act="approve">SETUJUI</button>' +
          '<button class="reject" data-id="' + v.voterId + '" data-act="reject">TOLAK</button>'
        : '<button data-id="' + v.voterId + '" data-act="detail">DETAIL</button>') +
      '</div></td></tr>'
    )).join('');

    APP.qs('#votersTableBody').innerHTML = rows || '<tr><td colspan="6" class="center muted">Tidak ada data.</td></tr>';

    APP.qsa('#votersTableBody button').forEach((btn) => {
      btn.addEventListener('click', () => handleVoterAction(btn.dataset.id, btn.dataset.act));
    });
  }

  function handleVoterAction(voterId, act) {
    const voter = votersCache.find((v) => v.voterId === voterId);
    if (!voter) return;

    if (act === 'detail') {
      alert(
        'Nama: ' + voter.name + '\n' +
        'Email: ' + voter.email + '\n' +
        'WhatsApp: ' + (voter.whatsapp || '-') + '\n' +
        'NIK/Identitas: ' + (voter.identityNumber || '-') + '\n' +
        'Asal: ' + (voter.origin || '-') + '\n' +
        'Jabatan: ' + (voter.position || '-') + '\n' +
        'No. Anggota: ' + (voter.memberNumber || '-') + '\n' +
        'Keterangan: ' + (voter.notes || '-')
      );
      return;
    }

    if (act === 'approve') {
      if (!confirm('Setujui pendaftaran ' + voter.name + '?')) return;
      APP.call('adminApproveVoter', { voterId: voterId }, { loadingMessage: 'Menyetujui...' })
        .then(() => { APP.toast('Voter disetujui.', 'success'); loadVoters(); loadDashboard(); });
    }

    if (act === 'reject') {
      const reason = prompt('Catatan penolakan (opsional):') || '';
      if (!confirm('Tolak pendaftaran ' + voter.name + '?')) return;
      APP.call('adminRejectVoter', { voterId: voterId, reason: reason }, { loadingMessage: 'Menolak...' })
        .then(() => { APP.toast('Voter ditolak.', 'success'); loadVoters(); loadDashboard(); });
    }
  }

  function initVoterFilters() {
    APP.qsa('.filter-chip').forEach((el) => {
      el.addEventListener('click', () => {
        currentFilter = el.dataset.filter;
        APP.qsa('.filter-chip').forEach((c) => c.classList.toggle('active', c === el));
        renderVoterTable();
      });
    });
  }

  /* ---------------- Candidate management ---------------- */
  function loadCandidates() {
    APP.call('getCandidates', { includeInactive: true }).then((candidates) => {
      const list = APP.qs('#candidateAdminList');
      list.innerHTML = candidates.map((c) => (
        '<div class="candidate-admin-row">' +
        '<img src="' + APP.escapeHtml(c.photoUrl || 'assets/images/placeholder-candidate.svg') + '" alt="">' +
        '<div class="info"><div class="n">' + APP.escapeHtml(c.number) + ' — ' + APP.escapeHtml(c.name) + '</div>' +
        '<div class="s">' + (c.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif') + '</div></div>' +
        '<div class="row-actions">' +
        '<button data-id="' + c.candidateId + '" data-act="edit">UBAH</button>' +
        '<button data-id="' + c.candidateId + '" data-act="toggle">' + (c.status === 'ACTIVE' ? 'NONAKTIFKAN' : 'AKTIFKAN') + '</button>' +
        '</div></div>'
      )).join('') || '<p class="muted">Belum ada calon.</p>';

      APP.qsa('#candidateAdminList button').forEach((btn) => {
        btn.addEventListener('click', () => {
          const c = candidates.find((x) => x.candidateId === btn.dataset.id);
          if (btn.dataset.act === 'edit') openCandidateForm(c);
          if (btn.dataset.act === 'toggle') {
            APP.call('adminSaveCandidate', {
              candidateId: c.candidateId,
              status: c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
            }).then(() => { APP.toast('Status calon diperbarui.', 'success'); loadCandidates(); });
          }
        });
      });
    });
  }

  function openCandidateForm(c) {
    c = c || {};
    APP.qs('#candForm_id').value = c.candidateId || '';
    APP.qs('#candForm_number').value = c.number || '';
    APP.qs('#candForm_name').value = c.name || '';
    APP.qs('#candForm_photo').value = c.photoUrl || '';
    APP.qs('#candForm_bio').value = c.biography || '';
    APP.qs('#candForm_vision').value = c.vision || '';
    APP.qs('#candForm_mission').value = c.mission || '';
    APP.qs('#candidateFormCard').classList.remove('hidden');
    APP.qs('#candidateFormCard').scrollIntoView({ behavior: 'smooth' });
  }

  function initCandidateForm() {
    APP.qs('#candAddBtn').addEventListener('click', () => openCandidateForm(null));
    APP.qs('#candCancelBtn').addEventListener('click', () => APP.qs('#candidateFormCard').classList.add('hidden'));
    APP.qs('#candidateForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const payload = {
        candidateId: APP.qs('#candForm_id').value || null,
        number: APP.qs('#candForm_number').value.trim(),
        name: APP.qs('#candForm_name').value.trim(),
        photoUrl: APP.qs('#candForm_photo').value.trim(),
        biography: APP.qs('#candForm_bio').value.trim(),
        vision: APP.qs('#candForm_vision').value.trim(),
        mission: APP.qs('#candForm_mission').value.trim()
      };
      if (!payload.number || !payload.name) {
        APP.toast('Nomor urut dan nama calon wajib diisi.', 'error');
        return;
      }
      APP.call('adminSaveCandidate', payload, { loadingMessage: 'Menyimpan calon...' }).then(() => {
        APP.toast('Data calon tersimpan.', 'success');
        APP.qs('#candidateFormCard').classList.add('hidden');
        loadCandidates();
      });
    });
  }

  /* ---------------- Results ---------------- */
  function loadResults() {
    APP.call('adminGetResults', {}).then((res) => {
      const total = res.totalVotes || 0;
      APP.qs('#resultsList').innerHTML = res.candidates.map((c) => {
        const pct = total > 0 ? ((c.voteCount / total) * 100).toFixed(2) : '0.00';
        return (
          '<div class="result-row">' +
          '<div class="result-head"><span class="name">' + APP.escapeHtml(c.number) + ' — ' + APP.escapeHtml(c.name) + '</span>' +
          '<span class="pct">' + pct + '%</span></div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="result-meta">Jumlah suara: ' + c.voteCount + '</div>' +
          '</div>'
        );
      }).join('');
      APP.qs('#resultsTotal').textContent = 'Total suara masuk: ' + total;
      if (!res.resultsVisible) {
        APP.qs('#resultsNotice').classList.remove('hidden');
      } else {
        APP.qs('#resultsNotice').classList.add('hidden');
      }
    });
  }

  /* ---------------- Election settings ---------------- */
  function loadElectionSettings() {
    APP.call('getElectionStatus', {}).then((e) => {
      APP.qs('#electionName').value = e.electionName || '';
      APP.qs('#electionStart').value = e.startTime ? toLocalInputValue(e.startTime) : '';
      APP.qs('#electionEnd').value = e.endTime ? toLocalInputValue(e.endTime) : '';
      APP.qs('#electionStatusLabel').textContent = e.status;
    });
  }
  function toLocalInputValue(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function initElectionForm() {
    APP.qs('#electionSettingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      APP.call('adminUpdateElection', {
        electionName: APP.qs('#electionName').value.trim(),
        startTime: APP.qs('#electionStart').value,
        endTime: APP.qs('#electionEnd').value
      }, { loadingMessage: 'Menyimpan pengaturan...' }).then(() => {
        APP.toast('Pengaturan pemilihan tersimpan.', 'success');
        loadElectionSettings();
      });
    });

    APP.qs('#electionOpenBtn').addEventListener('click', () => {
      if (!confirm('Buka pemungutan suara sekarang?')) return;
      APP.call('adminUpdateElection', { status: 'OPEN' }).then(() => { APP.toast('Pemilihan dibuka.', 'success'); loadElectionSettings(); });
    });
    APP.qs('#electionCloseBtn').addEventListener('click', () => {
      if (!confirm('Tutup pemungutan suara sekarang? Tindakan ini akan menghentikan seluruh pemungutan suara.')) return;
      APP.call('adminUpdateElection', { status: 'CLOSED' }).then(() => { APP.toast('Pemilihan ditutup.', 'success'); loadElectionSettings(); });
    });
  }

  /* ---------------- Init ---------------- */
  function init() {
    const session = APP.requireLogin('login.html');
    if (!session) return;

    // Frontend cannot know if this account is an admin; ask GAS, which checks
    // ADMIN_EMAILS server-side. If not an admin, GAS returns an error and we redirect.
    APP.call('adminGetDashboard', {}, { silentError: true }).then(() => {
      APP.qs('#adminName').textContent = session.name || session.email;
      APP.qsa('.admin-tab').forEach((el) => el.addEventListener('click', () => switchTab(el.dataset.tab)));
      initVoterFilters();
      initCandidateForm();
      initElectionForm();
      switchTab('dashboard');
    }).catch(() => {
      APP.toast('Anda tidak memiliki akses ke halaman ini.', 'error');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
    });
  }

  window.ADMIN_PAGE = { init };
})();
