/** v2026-10-06 */
/**
 * Group Maker — Vanilla JS client for the balanced_groups API.
 *
 * Anyone can view a group system by its link, and anyone can create one: the
 * server hands back a passcode that is the bearer token for every change to
 * that system. Passcodes are kept in localStorage per system so the organiser
 * stays unlocked on that device. Josh's admin key (also stored locally) edits
 * every system and lists them all.
 *
 * `?g=<id>` picks a system; without it the server's first system is shown.
 *
 * The script is idempotent so it can run again after an HTMX page swap.
 * Point it at a different server for local testing:
 *   /groups.html?api=http://127.0.0.1:8090
 */

(function () {
  'use strict';

  var DEFAULT_API = 'https://groups.joshsi.com';
  var KEY_STORAGE = 'bg-api-key';      // admin key
  var SYS_KEY_PREFIX = 'bg-sys-key:';   // + system id → that system's passcode
  var MINE_STORAGE = 'bg-mine';         // [{id, name}] systems this device has a passcode for
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
  var systemId = params.get('g') || '';

  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function lsSet(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (_) {} }
  function getAdminKey() { return lsGet(KEY_STORAGE); }
  function setAdminKey(k) { lsSet(KEY_STORAGE, k); }
  function getSysKey(id) { return id ? lsGet(SYS_KEY_PREFIX + id) : ''; }
  function setSysKey(id, k) { if (id) lsSet(SYS_KEY_PREFIX + id, k); }
  /** The credential to use for the current system: admin key first, else its passcode. */
  function getKey() { return getAdminKey() || getSysKey(systemId); }
  function isAdmin() { return !!getAdminKey(); }
  function getMine() { try { return JSON.parse(lsGet(MINE_STORAGE) || '[]'); } catch (_) { return []; } }
  function setMine(list) { lsSet(MINE_STORAGE, list.length ? JSON.stringify(list) : ''); }
  function rememberMine(id, name) {
    var list = getMine().filter(function (m) { return m.id !== id; });
    list.unshift({ id: id, name: name });
    setMine(list.slice(0, 50));
  }
  function forgetMine(id) { setMine(getMine().filter(function (m) { return m.id !== id; })); setSysKey(id, ''); }

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
  var systemName   = $('gm-system-name');
  var systemSelect = $('gm-system-select');
  var systemNew    = $('gm-system-new');
  var systemRename = $('gm-system-rename');
  var systemDelete = $('gm-system-delete');
  var systemCopy   = $('gm-system-copy');
  var systemPass   = $('gm-system-passcode');
  var createBtns   = Array.prototype.slice.call(document.querySelectorAll('.gm-system-create'));
  var createPanel  = $('gm-create-panel');
  var createForm   = $('gm-create-form');
  var createName   = $('gm-create-name');
  var createPass   = $('gm-create-passcode');
  var createCancel = $('gm-create-cancel');
  var createError  = $('gm-create-error');
  var revealPanel  = $('gm-reveal-panel');
  var revealName   = $('gm-reveal-name');
  var revealCode   = $('gm-reveal-code');
  var revealCopy   = $('gm-reveal-copy');
  var revealClose  = $('gm-reveal-close');

  var state = { system: null, members: [], familiarity: [], history: [], rounds: 0, can_edit: false, locked: false };
  var systems = []; // [{id, name, members, rounds, locked}], only known to the admin
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
    root.classList.toggle('gm-admin', isAdmin());
    unlockBtn.textContent = on ? 'Done editing' : 'Edit';
    unlockBtn.className = 'btn ' + (on ? 'btn-secondary' : 'btn-primary');
    if (on) hideUnlockPanel();
  }

  function showCreatePanel() {
    createPanel.hidden = false;
    createError.textContent = '';
    createName.value = '';
    createPass.value = '';
    hideUnlockPanel();
    try { createName.focus(); } catch (_) {}
  }
  function hideCreatePanel() { createPanel.hidden = true; createError.textContent = ''; }

  /** Show a freshly issued passcode once, with a copy button. */
  function revealPasscode(name, code) {
    revealName.textContent = name;
    revealCode.textContent = code;
    revealPanel.hidden = false;
    try { revealPanel.scrollIntoView({ block: 'nearest' }); } catch (_) {}
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

  /** Path for an endpoint that acts on the current group system. */
  function sys(path) {
    return systemId ? path + '?system=' + encodeURIComponent(systemId) : path;
  }

  function shareLink(id) {
    return location.origin + location.pathname + '?g=' + encodeURIComponent(id);
  }

  /** Show `id` in the address bar so the page can be bookmarked or shared. */
  function setUrlSystem(id) {
    var url = new URL(location.href);
    if (id) url.searchParams.set('g', id); else url.searchParams.delete('g');
    try { history.replaceState(history.state, '', url.toString()); } catch (_) {}
  }

  // ——— API ———
  function request(method, path, body) {
    var headers = { 'Accept': 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    var key = getKey();
    // Reads are public, but sending the key with /api/state tells us whether it may edit.
    if (key) headers['Authorization'] = 'Bearer ' + key;

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
    return request('GET', sys('/api/state')).then(function (s) {
      state = s;
      lastRound = s.history.length ? s.history[s.history.length - 1] : null;
      setStatus('');
      // A stored passcode that no longer opens this system is dropped quietly.
      if (!isAdmin() && getSysKey(s.system.id) && !s.can_edit) {
        forgetMine(s.system.id);
        setStatus('The passcode saved for ' + s.system.name + ' no longer works.', 'error');
      }
      if (s.can_edit && !isAdmin()) rememberMine(s.system.id, s.system.name);
      applyEditMode();
      renderAll();
    }).catch(function (err) {
      if (err.status === 404 && systemId) {
        state = { system: null, members: [], familiarity: [], history: [], rounds: 0 };
        lastRound = null;
        renderAll();
        setStatus("This link points to a group system that doesn't exist any more.", 'error');
      } else {
        setStatus('Could not reach the server at ' + api + ' (' + err.message + ')', 'error');
      }
    }).finally(function () { setBusy(false); });
  }

  /** Refresh the admin's list of every group system. */
  function loadSystems() {
    if (!isAdmin()) return Promise.resolve();
    return request('GET', '/api/systems').then(function (data) {
      systems = data.systems || [];
      renderSystems();
    }).catch(function (err) {
      if (err.status === 401) lockAfterBadKey();
    });
  }

  function switchSystem(id) {
    systemId = id;
    setUrlSystem(id);
    return load();
  }

  function lockAfterBadKey() {
    if (isAdmin()) { setAdminKey(''); systems = []; } else forgetMine(systemId || (state.system && state.system.id));
    applyEditMode();
    renderAll();
    setStatus('The saved passcode no longer works. Click Edit to enter it again.', 'error');
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
        lockAfterBadKey();
      } else if (!(opts.onError && opts.onError(err))) {
        setStatus(err.message, 'error');
      }
    }).finally(function () { setBusy(false); });
  }

  // ——— Rendering ———
  function renderAll() {
    renderSystems();
    renderMembers();
    renderRoundControls();
    renderLatest();
    renderMatrix();
    renderHistory();
  }

  function renderSystems() {
    var current = state.system;
    systemName.textContent = current ? current.name : '';
    if (current) document.title = current.name + ' — Group Maker — Josh Si';

    var list = isAdmin() ? systems.slice() : getMine();
    if (current && !list.some(function (s) { return s.id === current.id; })) {
      list.unshift({ id: current.id, name: current.name });
    }
    systemSelect.innerHTML = list.map(function (s) {
      var count = current && s.id === current.id ? state.members.length : s.members;
      var detail = count === undefined ? '' : ' (' + count + (count === 1 ? ' person' : ' people') + ')';
      return '<option value="' + esc(s.id) + '">' + esc(s.name) + esc(detail) + '</option>';
    }).join('');
    if (current) systemSelect.value = current.id;
    systemDelete.disabled = !current;
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

  // ——— Export (CSV for Excel / Google Sheets, TSV for the clipboard) ———
  function slug(name) {
    return String(name || 'groups').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'groups';
  }

  /** Rows for an export. `kind`: long (Round, Group, Member), wide (one row per round), matrix. */
  function exportRows(kind) {
    var rows = [];
    if (kind === 'long') {
      rows.push(['Round', 'Group', 'Member']);
      state.history.forEach(function (round, r) {
        round.forEach(function (group, g) {
          group.forEach(function (name) { rows.push([r + 1, g + 1, name]); });
        });
      });
    } else if (kind === 'wide') {
      var width = state.history.reduce(function (m, round) { return Math.max(m, round.length); }, 0);
      var head = ['Round'];
      for (var i = 1; i <= width; i++) head.push('Group ' + i);
      rows.push(head);
      state.history.forEach(function (round, r) {
        var row = [r + 1];
        for (var g = 0; g < width; g++) row.push(round[g] ? round[g].join(', ') : '');
        rows.push(row);
      });
    } else if (kind === 'matrix') {
      rows.push(['Times met'].concat(state.members));
      state.members.forEach(function (name, i) {
        rows.push([name].concat(state.members.map(function (_, j) { return i === j ? '' : state.familiarity[i][j] / 2; })));
      });
    }
    return rows;
  }

  function cell(v, sep) {
    var t = v === null || v === undefined ? '' : String(v);
    if (sep === '\t') return t.replace(/[\t\r\n]+/g, ' ');
    // Excel runs cells starting with = + - @ as formulas; neutralise them.
    if (/^[=+\-@]/.test(t)) t = "'" + t;
    return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  function table(rows, sep) {
    return rows.map(function (r) { return r.map(function (v) { return cell(v, sep); }).join(sep); }).join('\r\n') + '\r\n';
  }

  function downloadText(filename, text, mime) {
    // The BOM makes Excel read the file as UTF-8 (accents, non-Latin names).
    var blob = new Blob(['\ufeff' + text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportHistory(kind) {
    if (kind !== 'matrix' && !state.history.length) { setStatus('No rounds to export yet.', 'error'); return; }
    if (kind === 'matrix' && state.members.length < 2) { setStatus('Add at least two people to export the matrix.', 'error'); return; }
    var base = slug(state.system && state.system.name);
    if (kind === 'copy') {
      var tsv = table(exportRows('long'), '\t');
      var done = function () { setStatus('Table copied. Paste it into a spreadsheet.', 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tsv).then(done, function () { window.prompt('Copy this table:', tsv); });
      else window.prompt('Copy this table:', tsv);
      return;
    }
    var names = { long: 'rounds-by-person', wide: 'rounds', matrix: 'familiarity' };
    downloadText(base + '-' + names[kind] + '.csv', table(exportRows(kind), ','), 'text/csv;charset=utf-8');
    setStatus('Downloaded ' + base + '-' + names[kind] + '.csv. Open it in Excel or import it into Google Sheets.', 'ok');
  }

  Array.prototype.forEach.call(document.querySelectorAll('.gm-export-btn'), function (b) {
    b.addEventListener('click', function () { exportHistory(b.getAttribute('data-export')); });
  });

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
    return mutate('POST', sys('/api/rounds/manual'), { groups: groups, add_missing: !!addMissing }, function (data) {
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

  // ——— Group systems ———
  systemSelect.addEventListener('change', function () {
    switchSystem(systemSelect.value);
  });

  createBtns.forEach(function (b) { b.addEventListener('click', function () { if (createPanel.hidden) showCreatePanel(); else hideCreatePanel(); }); });
  if (systemNew) systemNew.addEventListener('click', showCreatePanel);
  createCancel.addEventListener('click', hideCreatePanel);

  createForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = createName.value.trim();
    var pass = createPass.value.trim();
    if (!name) return;
    if (pass && pass.length < 8) { createError.textContent = 'A passcode needs at least 8 characters, or leave it blank to get one.'; return; }
    if (busy) return;
    setBusy(true);
    createError.textContent = '';
    var body = pass ? { name: name, passcode: pass } : { name: name };
    request('POST', '/api/systems', body).then(function (data) {
      if (data.systems) systems = data.systems;
      systemId = data.system.id;
      setSysKey(systemId, data.passcode);
      rememberMine(systemId, data.system.name);
      setUrlSystem(systemId);
      hideCreatePanel();
      revealPasscode(data.system.name, data.passcode);
      applyEditMode();
      setBusy(false);
      return load().then(function () {
        setStatus('Created ' + data.system.name + '. Add people below to get started.', 'ok');
      });
    }).catch(function (err) {
      setBusy(false);
      createError.textContent = err.status === 429 ? 'Too many new groups were made recently. Please try again in a little while.' : (err.message || 'Could not reach the server.');
    });
  });

  systemPass.addEventListener('click', function () {
    if (!state.system || busy) return;
    var custom = window.prompt('New passcode for ' + state.system.name + ' (at least 8 characters). Leave blank to have one generated. Anyone with the old passcode will be locked out.', '');
    if (custom === null) return;
    custom = custom.trim();
    if (custom && custom.length < 8) { setStatus('A passcode needs at least 8 characters.', 'error'); return; }
    setBusy(true);
    var body = custom ? { id: state.system.id, passcode: custom } : { id: state.system.id };
    request('POST', '/api/systems/passcode', body).then(function (data) {
      if (!isAdmin()) setSysKey(data.system.id, data.passcode);
      revealPasscode(data.system.name, data.passcode);
      setStatus('Passcode changed.', 'ok');
    }).catch(function (err) {
      if (err.status === 401) lockAfterBadKey(); else setStatus(err.message, 'error');
    }).finally(function () { setBusy(false); });
  });

  revealClose.addEventListener('click', function () { revealPanel.hidden = true; });
  revealCopy.addEventListener('click', function () {
    var code = revealCode.textContent;
    var done = function () { setStatus('Passcode copied.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, function () { window.prompt('Copy this passcode:', code); });
    else window.prompt('Copy this passcode:', code);
  });

  systemRename.addEventListener('click', function () {
    if (!state.system) return;
    var name = (window.prompt('New name for ' + state.system.name + ':', state.system.name) || '').trim();
    if (!name || name === state.system.name) return;
    if (busy) return;
    setBusy(true);
    request('POST', '/api/systems/rename', { id: state.system.id, name: name }).then(function (data) {
      if (data.systems) systems = data.systems;
      state.system = data.system;
      if (!isAdmin()) rememberMine(data.system.id, data.system.name);
      renderSystems();
      setStatus('Renamed to ' + name + '. Existing links still work.', 'ok');
    }).catch(function (err) {
      if (err.status === 401) lockAfterBadKey(); else setStatus(err.message, 'error');
    }).finally(function () { setBusy(false); });
  });

  systemDelete.addEventListener('click', function () {
    var current = state.system;
    if (!current || busy) return;
    if (!window.confirm('Delete ' + current.name + '? Its roster, familiarity and every round are erased for good.')) return;
    setBusy(true);
    request('POST', '/api/systems/delete', { id: current.id }).then(function (data) {
      if (data.systems) systems = data.systems;
      forgetMine(current.id);
      setBusy(false);
      var next = isAdmin() ? (systems[0] && systems[0].id) : (getMine()[0] && getMine()[0].id);
      return switchSystem(next || '').then(function () {
        setStatus('Deleted ' + current.name + '.', 'ok');
      });
    }).catch(function (err) {
      setBusy(false);
      if (err.status === 401) lockAfterBadKey(); else setStatus(err.message, 'error');
    });
  });

  systemCopy.addEventListener('click', function () {
    if (!state.system) return;
    var link = shareLink(state.system.id);
    var done = function () { setStatus('Link copied. Anyone with it can view ' + state.system.name + '.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done, function () { window.prompt('Copy this link:', link); });
    } else {
      window.prompt('Copy this link:', link);
    }
  });

  // ——— Events ———
  unlockBtn.addEventListener('click', function () {
    if (editing()) {
      if (isAdmin()) { setAdminKey(''); systems = []; } else setSysKey(systemId || (state.system && state.system.id), '');
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
    // The same box takes the admin key or this group's passcode: try the
    // admin list first, then ask the current system whether the code may edit it.
    var h = { 'Accept': 'application/json', 'Authorization': 'Bearer ' + code };
    fetch(api + '/api/systems', { method: 'GET', mode: 'cors', headers: h }).then(function (res) {
      if (res.ok) return res.json().then(function (data) {
        systems = data.systems || [];
        setAdminKey(code);
        return 'admin';
      });
      if (res.status !== 401 && res.status !== 503) throw new Error('Could not check the passcode (' + res.status + ').');
      return fetch(api + sys('/api/state'), { method: 'GET', mode: 'cors', headers: h }).then(function (r2) {
        if (!r2.ok) throw new Error('Could not check the passcode (' + r2.status + ').');
        return r2.json();
      }).then(function (st) {
        if (!st.can_edit) throw new Error(st.locked ? "That passcode doesn't open this group. Check it and try again." : 'This group has no passcode of its own yet; only Josh can edit it.');
        state = st;
        setSysKey(st.system.id, code);
        rememberMine(st.system.id, st.system.name);
        return 'owner';
      });
    }).then(function () {
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
    mutate('POST', sys('/api/members'), { name: name }, 'Added ' + name + '.').then(function (data) {
      if (data) { addInput.value = ''; addInput.focus(); }
    });
  });

  membersEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.gm-chip-remove');
    if (!btn || !editing()) return;
    var name = btn.getAttribute('data-name');
    if (!window.confirm('Remove ' + name + ' from the roster? The record of who they have met is discarded.')) return;
    mutate('POST', sys('/api/members/remove'), { name: name }, 'Removed ' + name + '.');
  });

  groupCountEl.addEventListener('input', renderRoundControls);

  roundForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var g = parseInt(groupCountEl.value, 10);
    if (!g || g < 1) return;
    mutate('POST', sys('/api/rounds'), { group_count: g }, function () { return 'Round ' + state.rounds + ' created.'; });
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
    mutate('POST', sys('/api/rounds/undo'), undefined, 'Last round undone.');
  });

  // ——— Init ———
  applyEditMode();
  renderAll();
  load();
  loadSystems();
})();
