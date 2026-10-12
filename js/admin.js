/**
 * admin.js — Panel Panitia (admin.html)
 *
 * Seluruh data dimuat lewat SATU request (adminGetOverview). Otorisasi Admin
 * tetap sepenuhnya diputuskan di GAS terhadap ADMIN_EMAILS: file ini hanya
 * memanggil API dan menampilkan hasilnya. Jika akun bukan Admin, GAS menolak
 * dengan kode FORBIDDEN dan halaman dialihkan.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var esc = APP.escapeHtml;
  var TABS = ['ringkasan', 'pemilih', 'kandidat', 'pengaturan'];

  var state = {
    dash: null, voters: [], candidates: [],
    results: { candidates: [], totalVotes: 0 },
    election: null, log: [],
    filter: 'PENDING', query: ''
  };

  var STATUS_TAG = {
    PENDING: ['wait', 'Menunggu'], APPROVED: ['ok', 'Disetujui'],
    REJECTED: ['no', 'Ditolak'], VOTED: ['done', 'Sudah memilih']
  };

  /* ---------------- Helpers ---------------- */
  function pad(n) { return ('0' + n).slice(-2); }
  function fmtClock(v) {
    var d = new Date(v); if (!v || isNaN(d)) return '';
    var t = pad(d.getHours()) + '.' + pad(d.getMinutes());
    if (d.toDateString() === new Date().toDateString()) return t;
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + t;
  }
  function fmtDateTime(v) {
    var d = new Date(v); if (!v || isNaN(d)) return '-';
    return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function toLocalInput(v) {
    var d = new Date(v); if (!v || isNaN(d)) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
  }
  function findBy(list, key, id) {
    for (var i = 0; i < list.length; i++) { if (String(list[i][key]) === String(id)) return list[i]; }
    return null;
  }
  function findVoter(id) { return findBy(state.voters, 'voterId', id); }
  function findCand(id) { return findBy(state.candidates, 'candidateId', id); }

  /* Satu-satunya tempat error ditampilkan (semua APP.call memakai silentError). */
  function fail(err) {
    var code = err && err.code;
    if (code === 'UNAUTHENTICATED') {
      APP.toast('Sesi Anda telah berakhir. Silakan login kembali.', 'error');
      APP.clearSession();
      setTimeout(function () { window.location.href = 'login.html'; }, 1200);
      return;
    }
    if (code === 'FORBIDDEN') {
      APP.toast('Anda tidak memiliki akses ke halaman ini.', 'error');
      setTimeout(function () { window.location.href = 'dashboard.html'; }, 1200);
      return;
    }
    APP.toast((err && err.message) || 'Terjadi kendala pada sistem. Silakan coba kembali.', 'error');
  }

  /* ---------------- Tabs ---------------- */
  function showTab(t) {
    document.querySelectorAll('nav button').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.t === t ? 'true' : 'false');
    });
    TABS.forEach(function (k) { $('t-' + k).hidden = k !== t; });
    window.scrollTo(0, 0);
  }

  /* ---------------- Bottom sheet ---------------- */
  function openSheet(html) {
    $('sheet').innerHTML = html;
    $('sheetBackdrop').classList.add('open');
  }
  function closeSheet() {
    $('sheetBackdrop').classList.remove('open');
    $('sheet').innerHTML = '';
  }
  function confirmSheet(o) {
    openSheet(
      '<h3>' + esc(o.title) + '</h3><div class="sbody">' + o.body + '</div>' +
      '<div class="sact"><button class="btn g" data-close>Batal</button>' +
      '<button class="btn ' + (o.okClass || 'y') + '" id="sOk">' + esc(o.okText) + '</button></div>'
    );
    var ok = $('sOk');
    ok.addEventListener('click', APP.disableWhileRunning(ok, o.onOk));
  }

  /* ---------------- Render: status pemilihan ---------------- */
  function remaining(endIso) {
    var m = Math.round((new Date(endIso) - Date.now()) / 6e4);
    if (m <= 0) return 'segera ditutup';
    if (m >= 1440) return 'tutup dalam ' + Math.floor(m / 1440) + ' hari ' + Math.floor((m % 1440) / 60) + ' jam';
    if (m >= 60) return 'tutup dalam ' + Math.floor(m / 60) + ' jam ' + (m % 60) + ' menit';
    return 'tutup dalam ' + m + ' menit';
  }
  function renderStatus() {
    var e = state.election; if (!e) return;
    var txt;
    $('statusDot').className = 'dot ' + String(e.status).toLowerCase();
    if (e.status === 'OPEN') txt = 'Pemungutan suara dibuka' + (e.endTime ? ' · ' + remaining(e.endTime) : '');
    else if (e.status === 'CLOSED') txt = 'Pemungutan suara ditutup';
    else txt = 'Pemilihan belum dibuka' + (e.startTime ? ' · mulai ' + fmtDateTime(e.startTime) : '');
    $('statusText').textContent = txt;
  }

  /* ---------------- Render: ringkasan ---------------- */
  function logText(l) {
    var map = { SUBMIT_VOTE: 'Suara tercatat', REGISTER: 'Pendaftaran pemilih baru masuk' };
    return map[l.action] || l.description || l.action || '';
  }
  function logWho(l) { return l.role === 'ADMIN' ? 'Admin' : 'Sistem'; }

  function renderSummary() {
    var d = state.dash, res = state.results, T = res.totalVotes || 0;
    var byId = {};
    state.candidates.forEach(function (c) { byId[c.candidateId] = c; });

    var list = res.candidates.map(function (c) {
      return { number: c.number, name: c.name, votes: c.voteCount, off: (byId[c.candidateId] || {}).status === 'INACTIVE' };
    }).filter(function (c) { return !c.off || c.votes > 0; })
      .sort(function (a, b) { return b.votes - a.votes; });

    if (!T || !list.length) {
      $('leadName').textContent = 'Belum ada suara masuk';
      $('seg').innerHTML = ''; $('leg').innerHTML = '';
    } else {
      var top = list.filter(function (c) { return c.votes === list[0].votes; });
      $('leadName').textContent = top.length > 1 ? 'Seri: ' + top.map(function (c) { return c.name; }).join(' / ') : top[0].name;
      $('seg').innerHTML = list.map(function (c) {
        var p = Math.max(c.votes / T * 100, 8);
        return '<i style="width:' + p + '%">' + Math.round(c.votes / T * 100) + '%</i>';
      }).join('');
      $('leg').innerHTML = list.map(function (c) { return '<span>No. ' + esc(c.number) + ' · ' + c.votes + '</span>'; }).join('');
    }

    var elig = d.approved || 0;
    $('sVoted').textContent = d.totalVotes;
    $('sElig').textContent = elig;
    $('sBar').style.width = (elig > 0 ? Math.min(d.totalVotes / elig * 100, 100) : 0) + '%';
    $('sPend').textContent = d.pending;
    $('bPend').textContent = d.pending;
    $('bPend').style.display = d.pending ? '' : 'none';

    var pct = elig > 0 ? (d.voted / elig * 100).toFixed(2).replace(/\.00$/, '') : '0';
    $('rTotal').textContent = d.totalVoters; $('rApproved').textContent = d.approved;
    $('rRejected').textContent = d.rejected; $('rVoted').textContent = d.voted;
    $('rNotVoted').textContent = d.notVoted; $('rPct').textContent = pct + '%';
    $('sPart').textContent = d.voted + ' / ' + elig;

    $('log').innerHTML = state.log.length
      ? state.log.map(function (l) {
          return '<li><div><b>' + logWho(l) + '</b><br>' + esc(logText(l)) + '</div><time>' + esc(fmtClock(l.timestamp)) + '</time></li>';
        }).join('')
      : '<li class="empty" style="display:block;width:100%">Belum ada aktivitas.</li>';
  }

  /* ---------------- Render: pemilih ---------------- */
  function matchesFilter(v, f) {
    if (f === 'ALL') return true;
    if (f === 'APPROVED') return v.status === 'APPROVED' || v.status === 'VOTED';
    return v.status === f;
  }
  function renderVoters() {
    var defs = [['PENDING', 'Menunggu'], ['APPROVED', 'Disetujui'], ['REJECTED', 'Ditolak'], ['VOTED', 'Sudah memilih'], ['ALL', 'Semua']];
    $('chips').innerHTML = defs.map(function (d) {
      var n = state.voters.filter(function (v) { return matchesFilter(v, d[0]); }).length;
      return '<button class="chip" data-f="' + d[0] + '" aria-pressed="' + (state.filter === d[0]) + '">' + d[1] + ' (' + n + ')</button>';
    }).join('');

    var q = state.query.trim().toLowerCase();
    var L = state.voters.filter(function (v) {
      if (!matchesFilter(v, state.filter)) return false;
      if (!q) return true;
      return (String(v.name) + ' ' + v.email + ' ' + v.origin).toLowerCase().indexOf(q) !== -1;
    });

    if (!L.length) { $('vlist').innerHTML = '<div class="empty">Tidak ada pemilih di daftar ini.</div>'; return; }

    $('vlist').innerHTML = L.map(function (v) {
      var t = STATUS_TAG[v.status] || STATUS_TAG.PENDING;
      var sub = [v.origin, v.position].filter(Boolean).join(' · ') || v.email;
      var right = v.status === 'PENDING'
        ? '<div class="act"><button class="btn n" data-a="reject" data-id="' + esc(v.voterId) + '" aria-label="Tolak ' + esc(v.name) + '">Tolak</button>' +
          '<button class="btn y" data-a="approve" data-id="' + esc(v.voterId) + '" aria-label="Setujui ' + esc(v.name) + '">Setujui</button></div>'
        : '<span class="tag ' + t[0] + '">' + t[1] + '</span>';
      return '<div class="vrow"><div class="av">' + esc(initials(v.name)) + '</div>' +
        '<button class="vi" data-d="' + esc(v.voterId) + '"><b>' + esc(v.name) + '</b><span>' + esc(sub) + '</span></button>' + right + '</div>';
    }).join('');
  }

  /* ---------------- Render: kandidat ---------------- */
  function renderCandidates() {
    var votes = {}, T = state.results.totalVotes || 0;
    state.results.candidates.forEach(function (c) { votes[c.candidateId] = c.voteCount; });
    if (!state.candidates.length) {
      $('clist').innerHTML = '<div class="card empty">Belum ada calon. Tambahkan calon pertama.</div>'; return;
    }
    $('clist').innerHTML = state.candidates.map(function (c) {
      var n = votes[c.candidateId] || 0, p = T > 0 ? Math.round(n / T * 100) : 0, off = c.status === 'INACTIVE';
      return '<div class="card cand' + (off ? ' off' : '') + '"><div class="no-c">' + esc(c.number) + '</div>' +
        '<div style="flex:1;min-width:0"><h3>' + esc(c.name) + (off ? ' <span class="tag no">Nonaktif</span>' : '') + '</h3>' +
        (c.biography ? '<p>' + esc(c.biography) + '</p>' : '') +
        (c.vision ? '<p style="margin-top:6px;color:var(--ink)"><b>Visi:</b> ' + esc(c.vision) + '</p>' : '') +
        '<div class="v"><span>' + n + ' suara</span><span>' + p + '%</span></div>' +
        '<div class="bar"><u style="width:' + p + '%"></u></div>' +
        '<div class="cact"><button class="btn g" data-ce="' + esc(c.candidateId) + '">Ubah</button>' +
        '<button class="btn g" data-ct="' + esc(c.candidateId) + '">' + (off ? 'Aktifkan' : 'Nonaktifkan') + '</button></div>' +
        '</div></div>';
    }).join('');
  }

  /* ---------------- Render: pengaturan ---------------- */
  function renderSettings() {
    var e = state.election; if (!e) return;
    var map = { OPEN: ['ok', 'Dibuka'], DRAFT: ['wait', 'Belum dibuka'], CLOSED: ['no', 'Ditutup'] };
    var t = map[e.status] || map.DRAFT;
    $('setStatus').className = 'tag ' + t[0];
    $('setStatus').textContent = t[1];
    $('setHint').textContent = e.status === 'CLOSED'
      ? 'Pemilihan ditutup. Hasil resmi kini tampil di dashboard pemilih dan halaman hasil.'
      : 'Jika waktu mulai/selesai diisi, pemungutan suara otomatis mengikuti jadwal tersebut.';
    if (!$('t-pengaturan').contains(document.activeElement)) {
      $('electionName').value = e.electionName || '';
      $('electionStart').value = toLocalInput(e.startTime);
      $('electionEnd').value = toLocalInput(e.endTime);
    }
  }

  function renderAll() {
    renderStatus(); renderSummary(); renderVoters(); renderCandidates(); renderSettings();
  }

  /* ---------------- Load ---------------- */
  function load() {
    return APP.call('adminGetOverview', {}, { silentError: true, loadingMessage: 'Memuat data...' })
      .then(function (o) {
        state.dash = o.dashboard; state.voters = o.voters || []; state.candidates = o.candidates || [];
        state.results = o.results || { candidates: [], totalVotes: 0 };
        state.election = o.election; state.log = o.log || [];
        renderAll();
      })
      .catch(fail);
  }

  /* ---------------- Aksi: pemilih ---------------- */
  function showDetail(id) {
    var v = findVoter(id); if (!v) return;
    var t = STATUS_TAG[v.status] || STATUS_TAG.PENDING;
    var rows = [
      ['Nama', v.name], ['Email', v.email], ['WhatsApp', v.whatsapp], ['NIK / Identitas', v.identityNumber],
      ['Asal Kwartir / Qobilah', v.origin], ['Jabatan', v.position], ['No. Anggota', v.memberNumber],
      ['Keterangan', v.notes], ['Status', t[1]], ['Terdaftar', fmtDateTime(v.registeredAt)]
    ];
    openSheet(
      '<h3>Detail pemilih</h3><dl class="det">' +
      rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1] || '-') + '</dd>'; }).join('') + '</dl>' +
      '<div class="sact"><button class="btn g" data-close>Tutup</button>' +
      (v.status === 'PENDING'
        ? '<button class="btn n" data-a="reject" data-id="' + esc(v.voterId) + '">Tolak</button>' +
          '<button class="btn y" data-a="approve" data-id="' + esc(v.voterId) + '">Setujui</button>'
        : '') + '</div>'
    );
  }

  function askApprove(id) {
    var v = findVoter(id); if (!v) return;
    confirmSheet({
      title: 'Setujui pendaftaran?',
      body: '<p><b>' + esc(v.name) + '</b><br><span class="mute">' + esc(v.email) + '</span></p>',
      okText: 'Ya, setujui',
      onOk: function () {
        return APP.call('adminApproveVoter', { voterId: id }, { loadingMessage: 'Menyetujui...', silentError: true })
          .then(function () { closeSheet(); APP.toast('Pemilih disetujui', 'success'); return load(); })
          .catch(fail);
      }
    });
  }

  function askReject(id) {
    var v = findVoter(id); if (!v) return;
    confirmSheet({
      title: 'Tolak pendaftaran?',
      body: '<p><b>' + esc(v.name) + '</b><br><span class="mute">' + esc(v.email) + '</span></p>' +
        '<textarea id="rejReason" placeholder="Catatan penolakan (opsional)" aria-label="Catatan penolakan"></textarea>',
      okText: 'Ya, tolak', okClass: 'n',
      onOk: function () {
        var reason = $('rejReason').value.trim();
        return APP.call('adminRejectVoter', { voterId: id, reason: reason }, { loadingMessage: 'Menolak...', silentError: true })
          .then(function () { closeSheet(); APP.toast('Pemilih ditolak', 'success'); return load(); })
          .catch(fail);
      }
    });
  }

  /* ---------------- Aksi: kandidat ---------------- */
  function openCandForm(c) {
    c = c || {};
    openSheet(
      '<h3>' + (c.candidateId ? 'Ubah calon' : 'Tambah calon') + '</h3>' +
      '<form id="candForm" novalidate>' +
      '<div class="fld"><label for="cNumber">Nomor urut</label><input type="text" id="cNumber" required></div>' +
      '<div class="fld"><label for="cName">Nama lengkap</label><input type="text" id="cName" required></div>' +
      '<div class="fld"><label for="cPhoto">URL foto</label><input type="text" id="cPhoto" placeholder="https://..."></div>' +
      '<div class="fld"><label for="cBio">Profil singkat</label><textarea id="cBio"></textarea></div>' +
      '<div class="fld"><label for="cVision">Visi</label><textarea id="cVision"></textarea></div>' +
      '<div class="fld"><label for="cMission">Misi</label><textarea id="cMission"></textarea></div>' +
      '<div class="sact"><button type="button" class="btn g" data-close>Batal</button>' +
      '<button type="submit" class="btn y" id="cSave">Simpan</button></div></form>'
    );
    $('cNumber').value = c.number || ''; $('cName').value = c.name || '';
    $('cPhoto').value = c.photoUrl || ''; $('cBio').value = c.biography || '';
    $('cVision').value = c.vision || ''; $('cMission').value = c.mission || '';

    $('candForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('cSave');
      var payload = {
        candidateId: c.candidateId || null,
        number: $('cNumber').value.trim(), name: $('cName').value.trim(),
        photoUrl: $('cPhoto').value.trim(), biography: $('cBio').value.trim(),
        vision: $('cVision').value.trim(), mission: $('cMission').value.trim()
      };
      if (!payload.number || !payload.name) { APP.toast('Nomor urut dan nama calon wajib diisi.', 'error'); return; }
      btn.disabled = true;
      APP.call('adminSaveCandidate', payload, { loadingMessage: 'Menyimpan calon...', silentError: true })
        .then(function () { closeSheet(); APP.toast('Data calon tersimpan.', 'success'); return load(); })
        .catch(fail)
        .then(function () { btn.disabled = false; });
    });
  }

  function askToggle(id) {
    var c = findCand(id); if (!c) return;
    var off = c.status === 'INACTIVE';
    confirmSheet({
      title: off ? 'Aktifkan calon?' : 'Nonaktifkan calon?',
      body: '<p><b>' + esc(c.number) + ' — ' + esc(c.name) + '</b></p>' +
        (off ? '' : '<p class="mute">Calon nonaktif tidak tampil dan tidak dapat dipilih.</p>'),
      okText: off ? 'Ya, aktifkan' : 'Ya, nonaktifkan', okClass: off ? 'y' : 'n',
      onOk: function () {
        return APP.call('adminSaveCandidate', { candidateId: id, status: off ? 'ACTIVE' : 'INACTIVE' }, { silentError: true })
          .then(function () { closeSheet(); APP.toast('Status calon diperbarui.', 'success'); return load(); })
          .catch(fail);
      }
    });
  }

  /* ---------------- Aksi: pengaturan pemilihan ---------------- */
  function askElection(status) {
    var open = status === 'OPEN';
    confirmSheet({
      title: open ? 'Buka pemungutan suara?' : 'Tutup pemungutan suara?',
      body: open
        ? '<p>Pemilih yang disetujui dapat langsung memberikan suara.</p>'
        : '<p>Seluruh pemungutan suara akan dihentikan dan hasil resmi ditampilkan. Tindakan ini tidak dapat dibatalkan dari panel ini kecuali Anda membuka pemilihan kembali.</p>',
      okText: open ? 'Ya, buka' : 'Ya, tutup', okClass: open ? 'y' : 'n',
      onOk: function () {
        return APP.call('adminUpdateElection', { status: status }, { loadingMessage: 'Menyimpan...', silentError: true })
          .then(function () { closeSheet(); APP.toast(open ? 'Pemilihan dibuka.' : 'Pemilihan ditutup.', 'success'); return load(); })
          .catch(fail);
      }
    });
  }

  function saveElection(e) {
    e.preventDefault();
    var s = $('electionStart').value, en = $('electionEnd').value;
    var sd = s ? new Date(s) : null, ed = en ? new Date(en) : null;
    if (sd && ed && ed <= sd) { APP.toast('Waktu selesai harus setelah waktu mulai.', 'error'); return; }
    var btn = $('electionSave'); btn.disabled = true;
    // Dikirim sebagai ISO (UTC) dari zona waktu perangkat Admin, supaya jadwal
    // tidak bergeser oleh zona waktu proyek Apps Script.
    APP.call('adminUpdateElection', {
      electionName: $('electionName').value.trim(),
      startTime: sd ? sd.toISOString() : '', endTime: ed ? ed.toISOString() : ''
    }, { loadingMessage: 'Menyimpan pengaturan...', silentError: true })
      .then(function () { APP.toast('Pengaturan pemilihan tersimpan.', 'success'); return load(); })
      .catch(fail)
      .then(function () { btn.disabled = false; });
  }

  /* ---------------- Events ---------------- */
  function bind() {
    document.addEventListener('click', function (ev) {
      var el = ev.target;
      var t = el.closest('[data-t]'); if (t) { showTab(t.dataset.t); return; }
      var f = el.closest('[data-f]'); if (f) { state.filter = f.dataset.f; renderVoters(); return; }
      var a = el.closest('[data-a]'); if (a) { (a.dataset.a === 'approve' ? askApprove : askReject)(a.dataset.id); return; }
      var d = el.closest('[data-d]'); if (d) { showDetail(d.dataset.d); return; }
      var ce = el.closest('[data-ce]'); if (ce) { openCandForm(findCand(ce.dataset.ce)); return; }
      var ct = el.closest('[data-ct]'); if (ct) { askToggle(ct.dataset.ct); return; }
      if (el.closest('[data-close]') || el === $('sheetBackdrop')) closeSheet();
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeSheet(); });

    $('vq').addEventListener('input', function (ev) { state.query = ev.target.value; renderVoters(); });
    $('addCand').addEventListener('click', function () { openCandForm(null); });
    $('refreshBtn').addEventListener('click', load);
    $('openBtn').addEventListener('click', function () { askElection('OPEN'); });
    $('closeBtn').addEventListener('click', function () { askElection('CLOSED'); });
    $('electionForm').addEventListener('submit', saveElection);
  }

  function init() {
    var session = APP.requireLogin('login.html');
    if (!session) return;
    $('adminName').textContent = session.name || session.email;
    bind();
    load();
    setInterval(renderStatus, 30000); // hanya menyegarkan hitung mundur, tanpa request
  }

  window.ADMIN_PAGE = { init: init };
})();
