/**
 * FlowNote page — compile a score on the server, play the MIDI in the browser.
 *
 * "Play" posts the score to the conductor service (conductor-api), which
 * compiles it with `conductor` and keeps the MIDI + source for 24 hours.
 * The MIDI is played by SpessaSynth (vendored under /js/vendor, no CDN) using
 * a SoundFont served from the same host, fetched on first play and then cached
 * by the browser. "Copy link" produces /flownote?s=<id>, which reopens the
 * score while it lives on the server.
 *
 * The script is idempotent so it can run again after an HTMX page swap.
 * Point it at a different service for local testing:
 *   /flownote.html?api=http://127.0.0.1:8092
 */

(function () {
  'use strict';

  var DRAFT_KEY   = 'flownote-draft';
  var API_STORAGE = 'flownote-api-base';
  var DEFAULT_API = 'https://conductor.joshsi.com';
  var SOUNDFONT   = '/soundfonts/MuseScore_General.sf3';
  var API_TIMEOUT = 15000; // ms; the server itself gives up on a compile after 5 s
  var STATUS_MS   = 4000;

  var EXAMPLE = [
    '// TEMPO: 108',
    '// Twinkle, twinkle: melody over a simple bass',
    '"melody" = |c/4 c g g a a g/2 f/4 f e e d d c/2|@piano',
    '"bass"   = |c,/2 e, f, e, d, g, c,/1|@strings',
    '',
    '"melody" & "bass"',
    ''
  ].join('\n');

  var els = {
    app:       document.getElementById('fn-app'),
    source:    document.getElementById('fn-source'),
    play:      document.getElementById('fn-play'),
    stop:      document.getElementById('fn-stop'),
    bpm:       document.getElementById('fn-bpm'),
    download:  document.getElementById('fn-download'),
    share:     document.getElementById('fn-share'),
    transport: document.getElementById('fn-transport'),
    seek:      document.getElementById('fn-seek'),
    time:      document.getElementById('fn-time'),
    status:    document.getElementById('fn-status')
  };
  if (!els.app) return;

  // ——— Configuration ———
  var api = new URLSearchParams(location.search).get('api');
  try {
    if (api) localStorage.setItem(API_STORAGE, api);
    api = api || localStorage.getItem(API_STORAGE) || DEFAULT_API;
  } catch (_) { api = api || DEFAULT_API; }
  api = api.replace(/\/+$/, '');

  // ——— State ———
  var compiled = null;       // {id, source, bpm, midi: ArrayBuffer, expires_at} for the last good compile
  var player = null;         // {ctx, synth, seq}, created on first play
  var playerPromise = null;
  var busy = false;
  var seeking = false;
  var ticker = null;
  var statusTimer = null;

  // ——— Small helpers ———
  function setStatus(text, kind, sticky) {
    clearTimeout(statusTimer);
    els.status.textContent = text || '';
    els.status.className = 'gm-status' + (kind ? ' gm-status-' + kind : '');
    if (text && !sticky && kind !== 'error') {
      statusTimer = setTimeout(function () { els.status.textContent = ''; }, STATUS_MS);
    }
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  }

  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, els.source.value); } catch (_) { /* private mode */ }
  }

  function sourceNow() { return els.source.value.replace(/\r\n?/g, '\n'); }

  function bpmNow() {
    var raw = els.bpm.value.trim();
    if (!raw) return null;
    var n = Number(raw);
    return Number.isInteger(n) ? n : NaN;
  }

  function request(path, options) {
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller && setTimeout(function () { controller.abort(); }, API_TIMEOUT);
    options = options || {};
    if (controller) options.signal = controller.signal;
    return fetch(api + path, options).finally(function () { clearTimeout(timer); });
  }

  function errorFrom(res) {
    return res.json().then(function (body) {
      var e = new Error(body && body.error || 'Request failed (' + res.status + ')');
      e.line = body && body.line;
      return e;
    }, function () { return new Error('Request failed (' + res.status + ')'); });
  }

  function selectLine(n) {
    var lines = els.source.value.split('\n');
    if (!n || n < 1 || n > lines.length) return;
    var start = 0;
    for (var i = 0; i < n - 1; i++) start += lines[i].length + 1;
    els.source.focus();
    els.source.setSelectionRange(start, start + lines[n - 1].length);
  }

  function setLinks(enabled) {
    els.share.disabled = !enabled;
    if (enabled) {
      els.download.href = api + '/api/midi/' + compiled.id + '.mid';
      els.download.classList.remove('fn-disabled');
      els.download.removeAttribute('aria-disabled');
    } else {
      els.download.removeAttribute('href');
      els.download.classList.add('fn-disabled');
      els.download.setAttribute('aria-disabled', 'true');
    }
  }

  // ——— Compile ———
  function compile() {
    var source = sourceNow();
    var bpm = bpmNow();
    if (!source.trim()) return Promise.reject(new Error('Write a score first.'));
    if (Number.isNaN(bpm) || (bpm !== null && (bpm < 20 || bpm > 400))) {
      return Promise.reject(new Error('Tempo must be a whole number from 20 to 400, or left blank.'));
    }
    // Same text and tempo as the last good compile: reuse it.
    if (compiled && compiled.source === source && compiled.bpmOverride === bpm) {
      return Promise.resolve(compiled);
    }

    var body = { source: source, mode: 'full' };
    if (bpm !== null) body.bpm = bpm;
    return request('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) return errorFrom(res).then(function (e) { throw e; });
      return res.json();
    }).then(function (info) {
      return request(info.midi_url).then(function (res) {
        if (!res.ok) return errorFrom(res).then(function (e) { throw e; });
        return res.arrayBuffer();
      }).then(function (midi) {
        compiled = {
          id: info.id, source: source, bpmOverride: bpm, bpm: info.bpm,
          midi: midi, expires_at: info.expires_at
        };
        setLinks(true);
        try {
          history.replaceState(null, '', location.pathname + '?s=' + encodeURIComponent(info.id));
        } catch (_) { /* ignore */ }
        return compiled;
      });
    });
  }

  // ——— Player ———
  function loadSoundFont(onProgress) {
    return fetch(api + SOUNDFONT).then(function (res) {
      if (!res.ok) throw new Error('Could not load the instrument sounds (' + res.status + ').');
      var total = Number(res.headers.get('Content-Length')) || 0;
      if (!res.body || !res.body.getReader) return res.arrayBuffer();
      var reader = res.body.getReader();
      var chunks = [];
      var got = 0;
      return (function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            var out = new Uint8Array(got);
            var off = 0;
            chunks.forEach(function (c) { out.set(c, off); off += c.length; });
            return out.buffer;
          }
          chunks.push(r.value);
          got += r.value.length;
          onProgress(got, total);
          return pump();
        });
      })();
    });
  }

  function ensurePlayer() {
    if (player) return Promise.resolve(player);
    if (playerPromise) return playerPromise;

    // Created inside the click handler so the browser allows audio.
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || !window.AudioWorkletNode) {
      return Promise.reject(new Error('This browser cannot play the score. You can still download the MIDI.'));
    }
    var ctx = new Ctx();
    var lib;

    playerPromise = Promise.all([
      import('/js/vendor/spessasynth.js'),
      ctx.audioWorklet.addModule('/js/vendor/spessasynth_processor.min.js')
    ]).then(function (r) {
      lib = r[0];
      return loadSoundFont(function (got, total) {
        var mb = function (n) { return (n / 1048576).toFixed(0); };
        setStatus('Loading instrument sounds… ' + mb(got) + (total ? ' / ' + mb(total) : '') + ' MB (first time only)', null, true);
      });
    }).then(function (sf) {
      setStatus('Preparing instruments…', null, true);
      var synth = new lib.WorkletSynthesizer(ctx);
      return synth.soundBankManager.addSoundBank(sf, 'main').then(function () {
        return synth.isReady;
      }).then(function () {
        var seq = new lib.Sequencer(synth);
        seq.eventHandler.addEvent('songEnded', 'flownote', onEnded);
        player = { ctx: ctx, synth: synth, seq: seq };
        return player;
      });
    }).catch(function (e) {
      playerPromise = null;
      try { ctx.close(); } catch (_) { /* ignore */ }
      throw e;
    });
    return playerPromise;
  }

  function onEnded() {
    stopTicker();
    els.stop.disabled = true;
    els.play.textContent = 'Play';
    els.seek.value = 0;
    if (player) els.time.textContent = '0:00 / ' + fmtTime(player.seq.duration);
  }

  function startTicker() {
    stopTicker();
    ticker = setInterval(function () {
      if (!player || seeking) return;
      var d = player.seq.duration || 0;
      var t = Math.min(player.seq.currentTime || 0, d);
      els.seek.value = d ? Math.round((t / d) * 1000) : 0;
      els.time.textContent = fmtTime(t) + ' / ' + fmtTime(d);
    }, 200);
  }
  function stopTicker() { clearInterval(ticker); ticker = null; }

  function play() {
    if (busy) return;
    busy = true;
    els.play.disabled = true;
    setStatus('Compiling…', null, true);

    var ready;
    // Starting the audio context needs a user gesture, so begin it now,
    // before the network round trips, and let ensurePlayer reuse it.
    var pPlayer = ensurePlayer();
    pPlayer.catch(function () { /* reported below */ });

    ready = compile().then(function (c) {
      return pPlayer.then(function (p) { return [c, p]; });
    });

    ready.then(function (r) {
      var c = r[0], p = r[1];
      return p.ctx.resume().then(function () {
        p.seq.loadNewSongList([{ binary: c.midi.slice(0), fileName: c.id + '.mid' }]);
        p.seq.currentTime = 0;
        p.seq.play();
        els.stop.disabled = false;
        els.play.textContent = 'Restart';
        els.transport.hidden = false;
        els.time.textContent = '0:00 / ' + fmtTime(p.seq.duration);
        startTicker();
        setStatus(c.bpm + ' BPM', 'ok');
      });
    }).catch(function (e) {
      if (e && e.name === 'AbortError') e = new Error('The server took too long to respond.');
      var msg = e && e.message || 'Something went wrong.';
      if (e && e.line) msg += '\nClick here to jump to line ' + e.line + '.';
      setStatus(msg, 'error', true);
      if (e && e.line) {
        els.status.style.cursor = 'pointer';
        els.status.onclick = function () { selectLine(e.line); };
      }
    }).then(function () {
      busy = false;
      els.play.disabled = false;
    });

    els.status.style.cursor = '';
    els.status.onclick = null;
  }

  function stop() {
    if (!player) return;
    player.seq.pause();
    player.synth.stopAll(true);
    player.seq.currentTime = 0;
    onEnded();
  }

  // ——— Sharing ———
  function copyLink() {
    if (!compiled) return;
    var url = location.origin + location.pathname.replace(/\.html$/, '') + '?s=' + encodeURIComponent(compiled.id);
    var done = function () { setStatus('Link copied. It works for 24 hours.', 'ok'); };
    var fallback = function () {
      els.share.disabled = false;
      setStatus(url, null, true);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, fallback);
    } else {
      fallback();
    }
  }

  function loadShared(id) {
    setStatus('Loading shared score…', null, true);
    request('/api/score/' + encodeURIComponent(id)).then(function (res) {
      if (res.status === 404) throw new Error('That link has expired. Links last 24 hours after the last compile.');
      if (!res.ok) return errorFrom(res).then(function (e) { throw e; });
      return res.json();
    }).then(function (score) {
      els.source.value = score.source;
      els.bpm.value = '';
      saveDraft();
      setStatus('Loaded shared score. Press Play to hear it.', 'ok');
    }).catch(function (e) {
      setStatus(e && e.message || 'Could not load that score.', 'error', true);
    });
  }

  // ——— Wiring ———
  var shared = new URLSearchParams(location.search).get('s');
  var draft = null;
  try { draft = localStorage.getItem(DRAFT_KEY); } catch (_) { /* ignore */ }
  els.source.value = draft || EXAMPLE;
  setLinks(false);

  els.source.addEventListener('input', saveDraft);
  els.source.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); play(); }
  });
  els.play.addEventListener('click', play);
  els.stop.addEventListener('click', stop);
  els.share.addEventListener('click', copyLink);
  els.seek.addEventListener('input', function () { seeking = true; });
  els.seek.addEventListener('change', function () {
    seeking = false;
    if (player && player.seq.duration) {
      player.seq.currentTime = (Number(els.seek.value) / 1000) * player.seq.duration;
    }
  });

  if (shared) loadShared(shared);

  // Leaving the page through HTMX navigation must not leave music playing.
  // One listener at a time: a re-run of this script replaces the old one.
  if (window.__flownoteSwap) document.body.removeEventListener('htmx:afterSwap', window.__flownoteSwap);
  window.__flownoteSwap = function () {
    if (document.getElementById('fn-app')) return;
    stopTicker();
    if (player) { try { player.seq.pause(); player.ctx.close(); } catch (_) { /* ignore */ } player = null; playerPromise = null; }
    document.body.removeEventListener('htmx:afterSwap', window.__flownoteSwap);
    window.__flownoteSwap = null;
  };
  document.body.addEventListener('htmx:afterSwap', window.__flownoteSwap);
})();
