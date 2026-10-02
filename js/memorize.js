/**
 * Memorization Practice — Vanilla JS
 *
 * Passages, typing progress and settings are saved in localStorage so an
 * anonymous visitor can close the tab and come back to the same passage.
 * "Copy link" stores the passage with the share service (memorize-api) and
 * hands out a short link like /memorize?p=k7HqX2mB that opens it on any
 * device. If that service can't be reached the link falls back to carrying
 * the passage itself in the URL fragment (deflate + base64url), so sharing
 * always works.
 *
 * The script is idempotent so it can run again after an HTMX page swap.
 * Point it at a different share service for local testing:
 *   /memorize.html?api=http://127.0.0.1:8091
 */

(function () {
  'use strict';

  var SESSIONS_KEY = 'mempassage-sessions';
  var CURRENT_KEY  = 'mempassage-current';
  var MAX_SESSIONS = 50;
  var STATUS_MS    = 4000;
  var LONG_LINK    = 8000; // chars; past this some chat apps truncate URLs
  var DEFAULT_API  = 'https://memorize.joshsi.com';
  var API_STORAGE  = 'mempassage-api-base';
  var API_TIMEOUT  = 6000; // ms before we give up on the share service

  // ——— Storage helpers ———
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (_) { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }

  function stickyState(key, defaultValue) {
    var value = load(key, defaultValue);
    return {
      get: function ()  { return value; },
      set: function (v) { value = v; store(key, v); },
    };
  }

  // ——— DOM refs ———
  var $ = function (id) { return document.getElementById(id); };
  var app           = $('memorize-app');
  var sourceInput   = $('mem-source');
  var inputEl       = $('mem-input');
  var passageEl     = $('mem-passage');
  var caseCb        = $('case-sensitive');
  var puncCb        = $('check-punctuation');
  var modeBtns      = document.querySelectorAll('.mem-mode-btn');
  var resetBtn      = $('mem-reset');
  var titleInput    = $('mem-title');
  var savedSelect   = $('mem-saved');
  var copyBtn       = $('mem-copy-link');
  var newBtn        = $('mem-new');
  var deleteBtn     = $('mem-delete');
  var statusEl      = $('mem-status');
  var shareUrlEl    = $('mem-share-url');

  if (!app || !sourceInput || !passageEl || !inputEl) return;

  // ——— Share service ———
  var query = new URLSearchParams(location.search);
  var api = query.get('api');
  try {
    if (api) localStorage.setItem(API_STORAGE, api);
    api = api || localStorage.getItem(API_STORAGE) || DEFAULT_API;
  } catch (_) { api = api || DEFAULT_API; }
  api = api.replace(/\/+$/, '');

  function apiFetch(path, options) {
    options = options || {};
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller && setTimeout(function () { controller.abort(); }, API_TIMEOUT);
    if (controller) options.signal = controller.signal;
    return fetch(api + path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var err = new Error(body && body.error ? body.error : 'Request failed');
          err.status = res.status;
          throw err;
        }
        return body;
      });
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  function storePassage(text, title) {
    return apiFetch('/api/passages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, title: title }),
    });
  }

  function fetchPassage(id) {
    return apiFetch('/api/passages/' + encodeURIComponent(id));
  }

  function shortLink(id) {
    return location.origin + location.pathname + '?p=' + encodeURIComponent(id);
  }

  // ——— Preferences (defaults for new passages) ———
  var caseSensitive    = stickyState('mempassage-case-sensitive', true);
  var checkPunctuation = stickyState('mempassage-check-punctuation', true);
  var displayModeSt    = stickyState('mempassage-display-mode', 'hidden');

  // ——— Working state ———
  var sourceText = '';
  var typedText  = '';
  var locked     = false; // true once the user starts typing

  // ——— Saved sessions ———
  var sessions  = load(SESSIONS_KEY, []);
  if (!Array.isArray(sessions)) sessions = [];
  sessions = sessions.filter(function (s) {
    return s && typeof s === 'object' && typeof s.id === 'string' && typeof s.text === 'string';
  });
  sessions.forEach(function (s) {
    if (typeof s.title !== 'string') s.title = '';
    if (typeof s.typed !== 'string') s.typed = '';
    if (typeof s.updatedAt !== 'number') s.updatedAt = 0;
  });
  var current = null; // the session object being practised, or null

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function normalize(text) {
    return String(text || '')
      .replace(/\n/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function autoTitle(text) {
    var words = normalize(text).split(' ').filter(Boolean).slice(0, 6).join(' ');
    if (words.length > 40) words = words.slice(0, 40).replace(/\s+\S*$/, '') + '…';
    return words;
  }

  function displayTitle(s) {
    return (s.title && s.title.trim()) || autoTitle(s.text) || 'Untitled passage';
  }

  function progressOf(s) {
    var clean = normalize(s.text);
    if (s.punctuation === false) clean = clean.replace(PUNC_GLOBAL, '');
    if (!clean.length) return 0;
    return Math.min(100, Math.round(100 * s.typed.length / clean.length));
  }

  function persistSessions() {
    sessions.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    if (sessions.length > MAX_SESSIONS) sessions.length = MAX_SESSIONS;
    store(SESSIONS_KEY, sessions);
  }

  function setCurrent(s) {
    current = s;
    store(CURRENT_KEY, s ? s.id : null);
  }

  function findSession(id) {
    for (var i = 0; i < sessions.length; i++) if (sessions[i].id === id) return sessions[i];
    return null;
  }

  function createSession(text, title) {
    var s = {
      id: newId(),
      title: title || '',
      text: text || '',
      typed: '',
      mode: displayModeSt.get(),
      caseSensitive: caseSensitive.get(),
      punctuation: checkPunctuation.get(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    sessions.unshift(s);
    setCurrent(s);
    persistSessions();
    return s;
  }

  // Debounced save while typing so progress survives a closed tab.
  var saveTimer = null;
  function touch(immediate) {
    if (!current) return;
    current.updatedAt = Date.now();
    clearTimeout(saveTimer);
    if (immediate) { persistSessions(); renderSaved(); }
    else saveTimer = setTimeout(function () { persistSessions(); renderSaved(); }, 300);
  }

  // ——— Status line ———
  var statusTimer = null;
  function setStatus(msg, kind) {
    if (!statusEl) return;
    clearTimeout(statusTimer);
    statusEl.textContent = msg || '';
    statusEl.className = 'mem-status' + (kind ? ' mem-status-' + kind : '');
    if (msg) statusTimer = setTimeout(function () { statusEl.textContent = ''; }, STATUS_MS);
  }

  // ——— Lock / Unlock settings ———
  function lockSettings() {
    if (locked) return;
    locked = true;
    caseCb.disabled = true;
    puncCb.disabled = true;
    modeBtns.forEach(function (b) { b.disabled = true; });
    var settings = caseCb.closest('.mem-settings');
    var group = modeBtns[0] && modeBtns[0].closest('.mem-mode-group');
    if (settings) settings.classList.add('mem-locked');
    if (group) group.classList.add('mem-locked');
    if (resetBtn) resetBtn.style.display = '';
  }

  function unlockSettings() {
    locked = false;
    caseCb.disabled = false;
    puncCb.disabled = false;
    modeBtns.forEach(function (b) { b.disabled = false; });
    var settings = caseCb.closest('.mem-settings');
    var group = modeBtns[0] && modeBtns[0].closest('.mem-mode-group');
    if (settings) settings.classList.remove('mem-locked');
    if (group) group.classList.remove('mem-locked');
    if (resetBtn) resetBtn.style.display = 'none';
  }

  // ——— Session <-> UI ———
  function applySettings(s) {
    if (typeof s.mode === 'string') displayModeSt.set(s.mode);
    if (typeof s.caseSensitive === 'boolean') caseSensitive.set(s.caseSensitive);
    if (typeof s.punctuation === 'boolean') checkPunctuation.set(s.punctuation);
    caseCb.checked = caseSensitive.get();
    puncCb.checked = checkPunctuation.get();
    setActiveMode(displayModeSt.get());
  }

  function showSession(s) {
    setCurrent(s);
    applySettings(s);
    sourceInput.value = s.text;
    sourceText = normalize(s.text);
    typedText = s.typed;
    if (titleInput) titleInput.value = s.title;
    unlockSettings();
    var clean = computeClean().cleanText;
    if (typedText.length > clean.length) { typedText = typedText.slice(0, clean.length); s.typed = typedText; }
    inputEl.value = typedText;
    if (typedText.length > 0) lockSettings();
    renderSaved();
    render();
  }

  function clearWorkspace() {
    setCurrent(null);
    sourceInput.value = '';
    sourceText = '';
    typedText = '';
    inputEl.value = '';
    if (titleInput) titleInput.value = '';
    unlockSettings();
    renderSaved();
    render();
  }

  function renderSaved() {
    if (!savedSelect) return;
    var hasAny = sessions.length > 0;
    savedSelect.hidden = !hasAny;
    var html = '';
    if (!current) html += '<option value="" selected>Saved passages…</option>';
    sessions.forEach(function (s) {
      var pct = progressOf(s);
      var label = displayTitle(s) + (pct > 0 ? ' · ' + pct + '%' : '');
      html += '<option value="' + escapeHtml(s.id) + '"' + (current && s.id === current.id ? ' selected' : '') + '>' +
        escapeHtml(label) + '</option>';
    });
    savedSelect.innerHTML = html;

    var hasText = !!(current && normalize(current.text));
    if (copyBtn)   copyBtn.disabled = !hasText;
    if (deleteBtn) deleteBtn.hidden = !current;
    if (newBtn)    newBtn.hidden = !current;
    if (titleInput) titleInput.hidden = !current;
    if (shareUrlEl && !hasText) shareUrlEl.hidden = true;
  }

  // ——— Share links ———
  function toB64url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromB64url(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    var bin = atob(str);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function encodePassage(text) {
    var bytes = new TextEncoder().encode(text);
    var raw = { key: 'p', value: toB64url(bytes) };
    if (typeof CompressionStream === 'undefined') return Promise.resolve(raw);
    try {
      var stream = new Response(bytes).body.pipeThrough(new CompressionStream('deflate'));
      return new Response(stream).arrayBuffer().then(function (buf) {
        var out = new Uint8Array(buf);
        return out.length < bytes.length ? { key: 'z', value: toB64url(out) } : raw;
      }).catch(function () { return raw; });
    } catch (_) { return Promise.resolve(raw); }
  }

  function decodePassage(key, value) {
    return new Promise(function (resolve, reject) {
      var bytes = fromB64url(value); // throws on malformed input
      if (key === 'p') return resolve(new TextDecoder().decode(bytes));
      if (typeof DecompressionStream === 'undefined') {
        return reject(new Error('This browser cannot open compressed links'));
      }
      var stream = new Response(bytes).body.pipeThrough(new DecompressionStream('deflate'));
      new Response(stream).text().then(resolve, reject);
    });
  }

  function longLink(text, title) {
    return encodePassage(text).then(function (enc) {
      var hash = enc.key + '=' + enc.value;
      if (title) hash += '&t=' + encodeURIComponent(title);
      return location.origin + location.pathname + '#' + hash;
    });
  }

  // Resolves to { url, short }. A short link is reused while the passage and
  // title are unchanged; otherwise the share service is asked for a new one,
  // and if it is unreachable the passage travels inside the link instead.
  function buildShareLink() {
    var s = current;
    var text = normalize(s.text);
    var title = (s.title || '').trim();
    if (s.shareId && s.shareText === text && s.shareTitle === title) {
      return Promise.resolve({ url: shortLink(s.shareId), short: true });
    }
    return storePassage(text, title).then(function (row) {
      if (!row || typeof row.id !== 'string') throw new Error('bad response');
      s.shareId = row.id;
      s.shareText = text;
      s.shareTitle = title;
      touch(true);
      return { url: shortLink(row.id), short: true };
    }).catch(function () {
      return longLink(text, title).then(function (url) { return { url: url, short: false }; });
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  // Save a passage that arrived by link (or switch to it if already saved).
  function adoptPassage(text, title, shareId) {
    text = normalize(text);
    if (!text) throw new Error('empty');
    var existing = null;
    for (var i = 0; i < sessions.length; i++) {
      if (normalize(sessions[i].text) === text) { existing = sessions[i]; break; }
    }
    var s = existing || createSession(text, title);
    if (existing) {
      if (title && !existing.title) existing.title = title;
      existing.updatedAt = Date.now();
    }
    if (shareId && (s.title || '').trim() === (title || '').trim()) {
      s.shareId = shareId;
      s.shareText = text;
      s.shareTitle = (title || '').trim();
    }
    persistSessions();
    showSession(s);
    setStatus(existing ? 'Opened a passage you already had saved.'
                       : 'Passage loaded from the link and saved in this browser.', existing ? '' : 'ok');
  }

  function dropFromAddressBar(param) {
    try {
      var q = new URLSearchParams(location.search);
      if (param) q.delete(param);
      var qs = q.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    } catch (_) {}
  }

  // Short link: /memorize?p=<id> — the passage lives on the share service.
  function importFromQuery() {
    var id = query.get('p');
    if (!id) return Promise.resolve(false);
    setStatus('Loading shared passage…');
    return fetchPassage(id).then(function (row) {
      adoptPassage(row.text, (row.title || '').slice(0, 80), row.id);
      dropFromAddressBar('p');
      return true;
    }).catch(function (err) {
      if (err && err.status === 404) {
        setStatus('This link does not point to a saved passage. It may have been mistyped.', 'error');
      } else {
        setStatus('Could not load the shared passage. Check your connection and reload the page.', 'error');
      }
      return true; // don't replace the message by restoring the last session
    });
  }

  // Long link: /memorize#z=<deflated passage> — self-contained, no service needed.
  function importFromHash() {
    var hash = location.hash.replace(/^#/, '');
    if (!hash) return Promise.resolve(false);
    var params = new URLSearchParams(hash);
    var z = params.get('z');
    var p = params.get('p');
    if (!z && !p) return Promise.resolve(false);
    var title = (params.get('t') || '').slice(0, 80);

    return decodePassage(z ? 'z' : 'p', z || p).then(function (text) {
      adoptPassage(text, title, null);
      dropFromAddressBar(null);
      return true;
    }).catch(function () {
      setStatus('That link does not contain a readable passage.', 'error');
      return false;
    });
  }

  // ——— Event listeners ———
  sourceInput.addEventListener('input', function () {
    var value = sourceInput.value;
    var previous = current ? current.text : '';
    // Typing or deleting at the end extends the same passage. Replacing the
    // whole thing (e.g. select-all + paste) starts a new one so the old
    // passage and its progress are kept.
    var isEdit = !previous || value.indexOf(previous) === 0 || previous.indexOf(value) === 0;
    if (current && isEdit) {
      current.text = value;
      current.typed = '';
    } else if (normalize(value)) {
      createSession(value, '');
      if (titleInput) titleInput.value = '';
      setStatus('Saved in this browser.', 'ok');
    }
    sourceText = normalize(value);
    typedText = '';
    inputEl.value = '';
    unlockSettings();
    if (current) touch(true); else renderSaved();
    render();
  });

  inputEl.addEventListener('input', function () {
    // Restrict typed text length to clean source text length
    var cleanText = computeClean().cleanText;
    var currentInput = inputEl.value;
    if (currentInput.length > cleanText.length) {
      currentInput = currentInput.slice(0, cleanText.length);
      inputEl.value = currentInput;
    }
    typedText = currentInput;

    // Lock settings on first character typed; unlock if all deleted
    if (typedText.length > 0 && !locked) {
      lockSettings();
    } else if (typedText.length === 0 && locked) {
      unlockSettings();
    }

    if (current) { current.typed = typedText; touch(false); }
    render();
  });

  caseCb.addEventListener('change', function () {
    if (locked) return;
    caseSensitive.set(caseCb.checked);
    if (current) { current.caseSensitive = caseCb.checked; touch(true); }
    render();
  });

  puncCb.addEventListener('change', function () {
    if (locked) return;
    checkPunctuation.set(puncCb.checked);
    if (current) { current.punctuation = puncCb.checked; touch(true); }
    render();
  });

  modeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (locked) return;
      var mode = btn.dataset.mode;
      displayModeSt.set(mode);
      setActiveMode(mode);
      if (current) { current.mode = mode; touch(true); }
      render();
    });
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      typedText = '';
      inputEl.value = '';
      unlockSettings();
      if (current) { current.typed = ''; touch(true); }
      render();
      inputEl.focus();
    });
  }

  if (titleInput) {
    titleInput.addEventListener('input', function () {
      if (!current) return;
      current.title = titleInput.value.slice(0, 80);
      touch(false);
    });
  }

  if (savedSelect) {
    savedSelect.addEventListener('change', function () {
      var s = findSession(savedSelect.value);
      if (!s) return;
      clearTimeout(saveTimer);
      persistSessions();
      showSession(s);
      if (shareUrlEl) shareUrlEl.hidden = true;
      inputEl.focus();
    });
  }

  if (newBtn) {
    newBtn.addEventListener('click', function () {
      clearTimeout(saveTimer);
      persistSessions();
      clearWorkspace();
      if (shareUrlEl) shareUrlEl.hidden = true;
      sourceInput.focus();
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', function () {
      if (!current) return;
      if (!window.confirm('Delete "' + displayTitle(current) + '" from this browser?')) return;
      var id = current.id;
      sessions = sessions.filter(function (s) { return s.id !== id; });
      persistSessions();
      if (shareUrlEl) shareUrlEl.hidden = true;
      if (sessions.length) showSession(sessions[0]); else clearWorkspace();
      setStatus('Passage deleted.');
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      if (!current || !normalize(current.text)) return;
      setStatus('Making a link…');
      copyBtn.disabled = true;
      buildShareLink().then(function (link) {
        var url = link.url;
        var note = link.short
          ? ' It opens this passage on any device.'
          : ' Short links are unavailable right now, so this one is longer, but it still works.';
        if (!link.short && url.length > LONG_LINK) note += ' Some chat apps may truncate it.';
        return copyText(url).then(function () {
          setStatus('Link copied.' + note, 'ok');
          if (shareUrlEl) shareUrlEl.hidden = true;
        }, function () {
          if (shareUrlEl) {
            shareUrlEl.value = url;
            shareUrlEl.hidden = false;
            shareUrlEl.focus();
            shareUrlEl.select();
          }
          setStatus('Copy the link below to share this passage.' + note);
        });
      }).catch(function () {
        setStatus('Could not build a share link.', 'error');
      }).finally(function () {
        copyBtn.disabled = false;
      });
    });
  }

  // ——— Derived computations ———
  var PUNC_REGEX  = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
  var PUNC_GLOBAL = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;

  function computeClean() {
    var processed = '';
    var indices = [];
    for (var i = 0; i < sourceText.length; i++) {
      var ch = sourceText[i];
      if (!checkPunctuation.get() && PUNC_REGEX.test(ch)) continue;
      processed += ch;
      indices.push(i);
    }
    return { cleanText: processed, originalIndices: indices };
  }

  function computeVisibility() {
    var mode = displayModeSt.get();
    var len = sourceText.length;
    if (mode === 'full')   return new Array(len).fill(true);
    if (mode === 'hidden') return new Array(len).fill(false);

    var map = new Array(len).fill(false);
    var segments = sourceText.split(/(\s+)/);
    var charIdx = 0;
    var wordCount = 0;

    segments.forEach(function (seg) {
      var isWord = seg.trim().length > 0;
      if (isWord) {
        if (mode === 'firstLetter') map[charIdx] = true;
        if (mode === 'everyOther' && wordCount % 2 === 0) {
          for (var i = 0; i < seg.length; i++) map[charIdx + i] = true;
        }
        wordCount++;
      }
      charIdx += seg.length;
    });
    return map;
  }

  function filterPunc(text) {
    if (checkPunctuation.get()) return text;
    return text.replace(PUNC_GLOBAL, '');
  }

  // ——— Render ———
  function render() {
    if (!sourceText) {
      passageEl.innerHTML = '<span style="color: var(--color-fg-subtle)">Paste source text above, then type here from memory…</span>';
      inputEl.style.height = '10rem';
      passageEl.style.height = '10rem';
      return;
    }

    var clean = computeClean();
    var cleanText = clean.cleanText;
    var originalIndices = clean.originalIndices;
    var visibilityMap = computeVisibility();
    var filteredTyped = filterPunc(typedText);
    var isCaseSen = caseSensitive.get();

    var spans = [];
    var processedIdx = 0;
    for (var i = 0; i < sourceText.length; i++) {
      var ch = sourceText[i];

      if (originalIndices[processedIdx] !== i) {
        // Punctuation that is being skipped
        spans.push('<span class="char-skipped">' + escapeHtml(ch) + '</span>');
        continue;
      }
      var idx = processedIdx++;

      if (idx < filteredTyped.length) {
        var typedChar = filteredTyped[idx];
        var origChar  = cleanText[idx];
        var isCorrect = isCaseSen
          ? typedChar === origChar
          : typedChar.toLowerCase() === origChar.toLowerCase();

        if (isCorrect) {
          spans.push('<span class="char-correct">' + escapeHtml(ch) + '</span>');
        } else {
          spans.push('<span class="char-incorrect">' + escapeHtml(typedChar) + '</span>');
        }
      } else if (visibilityMap[i]) {
        spans.push('<span>' + escapeHtml(ch) + '</span>');
      } else if (ch === ' ') {
        spans.push('<span class="char-blank-space">&nbsp;</span>');
      } else {
        spans.push('<span class="char-blank">' + escapeHtml(ch) + '</span>');
      }
    }

    passageEl.innerHTML = spans.join('');

    // Dynamically adjust heights to match scroll height of backdrop
    requestAnimationFrame(function () {
      var height = Math.max(160, passageEl.scrollHeight);
      inputEl.style.height = height + 'px';
      passageEl.style.height = height + 'px';
    });
  }

  // ——— Helpers ———
  function escapeHtml(s) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(s).replace(/[&<>"']/g, function (c) { return map[c]; });
  }

  function setActiveMode(mode) {
    modeBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.mode === mode); });
  }

  // ——— Init ———
  caseCb.checked = caseSensitive.get();
  puncCb.checked = checkPunctuation.get();
  setActiveMode(displayModeSt.get());
  renderSaved();
  render();

  importFromQuery().then(function (imported) {
    return imported || importFromHash();
  }).then(function (imported) {
    if (imported) return;
    var last = findSession(load(CURRENT_KEY, null));
    if (last) showSession(last);
  });
})();
