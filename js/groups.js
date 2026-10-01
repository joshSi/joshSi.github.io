/**
 * Group Maker — Vanilla JS client for the balanced_groups API.
 *
 * Anyone can view. Editing (roster changes, new rounds) needs the organiser
 * passcode, which the API knows as its bearer token. Once entered it is kept
 * in localStorage so the organiser stays unlocked on that device.
 *
 * The script is idempotent so it can run again after an HTMX page swap.
 * Point it at a different server for local testing:
 *   /groups.html?api=http://127.0.0.1:8090
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
  var unlockPanel  = $('gm-unlock-panel');
  var unlockForm   = $('gm-unlock-form');
  var passcodeEl   = $('gm-passcode');
  var unlockCancel = $('gm-unlock-cancel');
  var unlockError  = $('gm-unlock-error');
  var refreshBtn   = $('gm-refresh');
  var membersEl    = $('gm-members');
  var memberCount  = $('gm-member-count');
  var addForm      = $('gm-add-form');
  var addInput     = $('gm-add-name');
  var roundForm    = $('gm-round-form');
  var groupCountEl = $('gm-group-count');
  var sizeHint     = $('gm-size-hint');
  var undoBtn      = $('gm-undo');
  var manualForm   = $('gm-manual-form');
  var manualText   = $('gm-manual-text');
  var manualDetails = $('gm-manual');
  var latestEl     = $('gm-latest');
  var roundNumber  = $('gm-round-number');
  var matrixEl     = $('gm-matrix');
  var historyEl    = $('gm-history');
  var historyCount = $('gm-history-count');

  var state = { members: [], familiarity: [], history: [], rounds: 0 };
  var lastRound = null; // groups from the most recent action
  var busy = false;

  // ——— Helpers ———
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function joinNames(list) {
    if (list.length <= 1) return list.join('');
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
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
    unlockBtn.textContent = on ? 'Done editing' : 'Edit';
    unlockBtn.className = 'btn ' + (on ? 'btn-secondary' : 'btn-primary');
    if (on) hideUnlockPanel();
  }

  function showUnlockPanel() {
    unlockPanel.hidden = false;
    unlockError.textContent = '';
    passcodeEl.value = '';
    try { passcodeEl.focus(); } catch (_) {}
  }

  function hideUnlockPanel() {
    unlockPanel.hidden = true;
    unlockError.textContent = '';
    passcodeEl.value = '';
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
          err.data = data;
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

  /**
   * Send a change. Resolves with the response data, or undefined if the
   * request failed (the failure has already been shown to the user unless
   * opts.onError returned true to say it handled it).
   */
  function mutate(method, path, body, okMsg, opts) {
    opts = opts || {};
    if (busy) return Promise.resolve();
    setBusy(true);
    setStatus('Saving…');
    return request(method, path, body).then(function (data) {
      if (data && data.state) state = data.state;
      if (data && data.round) lastRound = data.round;
      else lastRound = state.history.length ? state.history[state.history.length - 1] : null;
      setStatus(typeof okMsg === 'function' ? okMsg(data) : (okMsg || 'Saved'), 'ok');
      renderAll();
      return data;
    }).catch(function (err) {
      if (err.status === 401) {
        setKey('');
        applyEditMode();
        renderAll();
        setStatus('The saved passcode no longer works. Click Edit to enter it again.', 'error');
      } else if (!(opts.onError && opts.onError(err))) {
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
      membersEl.innerHTML = '<p class="gm-empty">Nobody on the roster yet.' + (editing() ? ' Add the first name below.' : '') + '</p>';
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
    if (n === 0) { sizeHint.textContent = ''; undoBtn.disabled = true; return; }
    var lo = Math.floor(n / g), hi = Math.ceil(n / g);
    sizeHint.textContent = lo === hi ? 'Groups of ' + lo : 'Groups of ' + lo + '–' + hi;
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
            return '<li' + (gone ? ' class="gm-gone" title="No longer on the roster"' : '') + '>' + esc(name) + '</li>';
          }).join('') +
        '</ul></div>';
    }).join('');
  }

  function renderMatrix() {
    var names = state.members;
    var fam = state.familiarity;
    if (names.length < 2) {
      matrixEl.innerHTML = '<p class="gm-empty">Add at least two people to see who has met.</p>';
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

  // ——— Manual round parsing ———
  /** "A, B\nC; D" → [["A","B"],["C","D"]]. Returns {groups} or {error}. */
  function parseManualGroups(text) {
    var groups = [];
    var seen = {};
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var names = lines[i].split(/[,;\t]/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!names.length) continue;
      for (var j = 0; j < names.length; j++) {
        var key = names[j].toLowerCase();
        if (seen[key]) return { error: names[j] + ' appears more than once.' };
        seen[key] = true;
      }
      groups.push(names);
    }
    if (!groups.length) return { error: 'Type at least one group, one per line.' };
    return { groups: groups };
  }

  function recordManual(groups, addMissing) {
    return mutate('POST', '/api/rounds/manual', { groups: groups, add_missing: !!addMissing }, function (data) {
      var msg = 'Round ' + state.rounds + ' recorded';
      if (data && data.added && data.added.length) msg += ' and added ' + joinNames(data.added) + ' to the roster';
      return msg + '.';
    }, {
      onError: function (err) {
        if (err.status !== 422 || !err.data || !err.data.unknown) return false;
        var unknown = err.data.unknown;
        var ok = window.confirm(
          joinNames(unknown) + (unknown.length === 1 ? ' is not' : ' are not') +
          ' on the roster yet.\n\nAdd ' + (unknown.length === 1 ? 'them' : 'these ' + unknown.length + ' people') +
          ' and record the round?'
        );
        if (ok) {
          setTimeout(function () { recordManual(groups, true); }, 0);
        } else {
          setStatus('Round not recorded. Fix the names or add those people first.', 'error');
        }
        return true;
      },
    }).then(function (data) {
      if (data) { manualText.value = ''; manualDetails.open = false; }
      return data;
    });
  }

  // ——— Events ———
  unlockBtn.addEventListener('click', function () {
    if (editing()) {
      setKey('');
      applyEditMode();
      renderAll();
      setStatus('Editing turned off on this device.', 'ok');
      return;
    }
    if (unlockPanel.hidden) showUnlockPanel(); else hideUnlockPanel();
  });

  unlockCancel.addEventListener('click', hideUnlockPanel);

  unlockForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = passcodeEl.value.trim();
    if (!code) return;
    unlockError.textContent = '';
    setBusy(true);
    // Verify the passcode before trusting it, with a request that cannot
    // change anything: an empty name is rejected with 400 only after the
    // server has accepted the key, while a wrong key is rejected with 401.
    fetch(api + '/api/members', {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + code },
      body: JSON.stringify({ name: '' }),
    }).then(function (res) {
      if (res.status === 401) throw new Error("That passcode didn't work. Check it and try again.");
      if (res.status === 503) throw new Error('The server is in read-only mode right now.');
      setKey(code);
      applyEditMode();
      renderAll();
      setStatus("You're editing. Changes save instantly and stay on this device until you click Done editing.", 'ok');
    }).catch(function (err) {
      unlockError.textContent = err.message || 'Could not reach the server.';
    }).finally(function () { setBusy(false); });
  });

  refreshBtn.addEventListener('click', function () { load(); });

  addForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = addInput.value.trim();
    if (!name) return;
    mutate('POST', '/api/members', { name: name }, 'Added ' + name + '.').then(function (data) {
      if (data) { addInput.value = ''; addInput.focus(); }
    });
  });

  membersEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.gm-chip-remove');
    if (!btn || !editing()) return;
    var name = btn.getAttribute('data-name');
    if (!window.confirm('Remove ' + name + ' from the roster? The record of who they have met is discarded.')) return;
    mutate('POST', '/api/members/remove', { name: name }, 'Removed ' + name + '.');
  });

  groupCountEl.addEventListener('input', renderRoundControls);

  roundForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var g = parseInt(groupCountEl.value, 10);
    if (!g || g < 1) return;
    mutate('POST', '/api/rounds', { group_count: g }, function () { return 'Round ' + state.rounds + ' created.'; });
  });

  manualForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var parsed = parseManualGroups(manualText.value);
    if (parsed.error) { setStatus(parsed.error, 'error'); return; }
    recordManual(parsed.groups, false);
  });

  undoBtn.addEventListener('click', function () {
    if (!state.rounds) return;
    if (!window.confirm('Undo round ' + state.rounds + '? Those groups will be forgotten.')) return;
    mutate('POST', '/api/rounds/undo', undefined, 'Last round undone.');
  });

  // ——— Init ———
  applyEditMode();
  renderAll();
  load();
})();
