/**
 * Group Maker — Vanilla JS client for the balanced_groups API.
 *
 * Reads are public. Writes need an API key, which is kept in localStorage
 * after the user unlocks editing. The script is idempotent so it can run
 * again after an HTMX page swap.
 *
 * Point it at a different server for local testing: /groups.html?api=http://127.0.0.1:8090
 */

(function () {
  'use strict';

  var DEFAULT_API = 'https://groups.joshsi.com';
  var KEY_STORAGE = 'bg-api-key';
  var API_STORAGE = 'bg-api-base';

  var root = document.getElementById('groups-app');
  if (!root) return;

  // ——— Config ———
  var params = new URLSearchParams(window.location.search);
  var api = params.get('api');
  try {
    if (api) localStorage.setItem(API_STORAGE, api);
    api = api || localStorage.getItem(API_STORAGE) || DEFAULT_API;
  } catch (_) { api = api || DEFAULT_API; }
  api = api.replace(/\/+$/, '');

  function getKey() { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (_) { return ''; } }
  function setKey(k) { try { k ? localStorage.setItem(KEY_STORAGE, k) : localStorage.removeItem(KEY_STORAGE); } catch (_) {} }

  // ——— DOM ———
  var $ = function (id) { return document.getElementById(id); };
  var statusEl     = $('gm-status');
  var unlockBtn    = $('gm-unlock');
  var refreshBtn   = $('gm-refresh');
  var membersEl    = $('gm-members');
  var memberCount  = $('gm-member-count');
  var addForm      = $('gm-add-form');
  var addInput     = $('gm-add-name');
  var roundForm    = $('gm-round-form');
  var groupCountEl = $('gm-group-count');
  var sizeHint     = $('gm-size-hint');
  var undoBtn      = $('gm-undo');
  var latestEl     = $('gm-latest');
  var roundNumber  = $('gm-round-number');
  var matrixEl     = $('gm-matrix');
  var historyEl    = $('gm-history');
  var historyCount = $('gm-history-count');

  var state = { members: [], familiarity: [], history: [], rounds: 0 };
  var lastRound = null; // groups from the most recent action, highlighted
  var busy = false;

  // ——— Helpers ———
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'gm-status' + (kind ? ' gm-status-' + kind : '');
  }

  function setBusy(b) {
    busy = b;
    root.classList.toggle('gm-busy', b);
  }

  function editing() { return !!getKey(); }

  function applyEditMode() {
    var on = editing();
    root.classList.toggle('gm-readonly', !on);
    unlockBtn.textContent = on ? 'Lock editing' : 'Unlock editing';
    unlockBtn.className = 'btn ' + (on ? 'btn-secondary' : 'btn-primary');
  }

  // ——— API ———
  function request(method, path, body) {
    var headers = { 'Accept': 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    var key = getKey();
    if (method !== 'GET' && key) headers['Authorization'] = 'Bearer ' + key;

    return fetch(api + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      mode: 'cors',
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) {}
        if (!res.ok) {
          var msg = (data && data.error) || (res.status + ' ' + res.statusText);
          var err = new Error(msg);
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function load() {
    setBusy(true);
    setStatus('Loading…');
    return request('GET', '/api/state').then(function (s) {
      state = s;
      lastRound = s.history.length ? s.history[s.history.length - 1] : null;
      setStatus('');
      renderAll();
    }).catch(function (err) {
      setStatus('Could not reach the server at ' + api + ' (' + err.message + ')', 'error');
    }).finally(function () { setBusy(false); });
  }

  function mutate(method, path, body, okMsg) {
    if (busy) return Promise.resolve();
    setBusy(true);
    setStatus('Saving…');
    return request(method, path, body).then(function (data) {
      if (data && data.state) state = data.state;
      if (data && data.round) lastRound = data.round;
      else lastRound = state.history.length ? state.history[state.history.length - 1] : null;
      setStatus(okMsg || 'Saved', 'ok');
      renderAll();
      return data;
    }).catch(function (err) {
      if (err.status === 401) {
        setStatus('That API key was rejected. Unlock editing again with the right key.', 'error');
        setKey('');
        applyEditMode();
      } else {
        setStatus(err.message, 'error');
      }
    }).finally(function () { setBusy(false); });
  }

  // ——— Rendering ———
  function renderAll() {
    renderMembers();
    renderRoundControls();
    renderLatest();
    renderMatrix();
    renderHistory();
  }

  function renderMembers() {
    memberCount.textContent = state.members.length;
    if (!state.members.length) {
      membersEl.innerHTML = '<p class="gm-empty">No members yet.' + (editing() ? ' Add some below.' : '') + '</p>';
      return;
    }
    membersEl.innerHTML = state.members.map(function (name) {
      return '<span class="gm-chip">' + esc(name) +
        '<button type="button" class="gm-chip-remove gm-editor" data-name="' + esc(name) +
        '" aria-label="Remove ' + esc(name) + '" title="Remove">×</button></span>';
    }).join('');
  }

  function renderRoundControls() {
    var n = state.members.length;
    groupCountEl.max = Math.max(1, n);
    var g = parseInt(groupCountEl.value, 10) || 1;
    if (g > n && n > 0) { g = n; groupCountEl.value = g; }
    if (n === 0) { sizeHint.textContent = ''; return; }
    var lo = Math.floor(n / g), hi = Math.ceil(n / g);
    sizeHint.textContent = lo === hi
      ? 'Groups of ' + lo
      : 'Groups of ' + lo + '–' + hi;
    undoBtn.disabled = state.rounds === 0;
  }

  function renderLatest() {
    roundNumber.textContent = state.rounds ? '#' + state.rounds : '';
    if (!lastRound || !lastRound.length) {
      latestEl.innerHTML = '<p class="gm-empty">No rounds yet.' + (editing() ? ' Make the first one above.' : '') + '</p>';
      return;
    }
    latestEl.innerHTML = lastRound.map(function (group, i) {
      return '<div class="gm-group">' +
        '<div class="gm-group-label">Group ' + (i + 1) + '</div>' +
        '<ul class="gm-group-list">' +
          group.map(function (name) {
            var gone = state.members.indexOf(name) === -1;
            return '<li' + (gone ? ' class="gm-gone" title="No longer a member"' : '') + '>' + esc(name) + '</li>';
          }).join('') +
        '</ul></div>';
    }).join('');
  }

  function renderMatrix() {
    var names = state.members;
    var fam = state.familiarity;
    if (names.length < 2) {
      matrixEl.innerHTML = '<p class="gm-empty">Add at least two members to see familiarity.</p>';
      return;
    }
    var max = 0;
    fam.forEach(function (row) { row.forEach(function (v) { if (v > max) max = v; }); });

    var html = '<table class="gm-matrix"><thead><tr><th></th>';
    names.forEach(function (n) { html += '<th scope="col"><span>' + esc(n) + '</span></th>'; });
    html += '</tr></thead><tbody>';
    names.forEach(function (rowName, i) {
      html += '<tr><th scope="row">' + esc(rowName) + '</th>';
      names.forEach(function (colName, j) {
        if (i === j) { html += '<td class="gm-diag" aria-hidden="true"></td>'; return; }
        var v = fam[i][j];
        var meetings = v / 2; // library stores +2 per shared group
        var p = max ? v / max : 0;
        html += '<td class="gm-cell" style="--p:' + p.toFixed(3) + '" title="' +
          esc(rowName) + ' & ' + esc(colName) + ': ' + meetings + (meetings === 1 ? ' time' : ' times') + '">' +
          (v ? meetings : '') + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    matrixEl.innerHTML = html;
  }

  function renderHistory() {
    historyCount.textContent = state.history.length;
    if (!state.history.length) {
      historyEl.innerHTML = '<p class="gm-empty">Nothing yet.</p>';
      return;
    }
    historyEl.innerHTML = state.history.slice().reverse().map(function (round, idx) {
      var number = state.history.length - idx;
      return '<div class="gm-history-round"><div class="gm-history-label">Round ' + number + '</div>' +
        '<div class="gm-history-groups">' +
          round.map(function (g) { return '<span class="gm-history-group">' + g.map(esc).join(', ') + '</span>'; }).join('') +
        '</div></div>';
    }).join('');
  }

  // ——— Events ———
  unlockBtn.addEventListener('click', function () {
    if (editing()) {
      setKey('');
      applyEditMode();
      renderAll();
      setStatus('Editing locked.', 'ok');
      return;
    }
    var k = window.prompt('Enter the Group Maker API key:');
    if (k === null) return;
    k = k.trim();
    if (!k) return;
    setKey(k);
    applyEditMode();
    renderAll();
    setStatus('Editing unlocked. The key is stored only in this browser.', 'ok');
  });

  refreshBtn.addEventListener('click', function () { load(); });

  addForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = addInput.value.trim();
    if (!name) return;
    mutate('POST', '/api/members', { name: name }, 'Added ' + name).then(function (data) {
      if (data) { addInput.value = ''; addInput.focus(); }
    });
  });

  membersEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.gm-chip-remove');
    if (!btn || !editing()) return;
    var name = btn.getAttribute('data-name');
    if (!window.confirm('Remove ' + name + '? Their familiarity with everyone is discarded.')) return;
    mutate('POST', '/api/members/remove', { name: name }, 'Removed ' + name);
  });

  groupCountEl.addEventListener('input', renderRoundControls);

  roundForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var g = parseInt(groupCountEl.value, 10);
    if (!g || g < 1) return;
    mutate('POST', '/api/rounds', { group_count: g }, 'Round ' + (state.rounds + 1) + ' created');
  });

  undoBtn.addEventListener('click', function () {
    if (!state.rounds) return;
    if (!window.confirm('Undo round ' + state.rounds + '? Its familiarity will be subtracted.')) return;
    mutate('POST', '/api/rounds/undo', undefined, 'Round undone');
  });

  // ——— Init ———
  applyEditMode();
  renderAll();
  load();
})();
