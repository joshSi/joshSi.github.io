/**
 * Memorization Practice — Vanilla JS
 *
 * Ports the React MemorizationPractice component to pure JS.
 * Uses localStorage via stickyState() for persisted preferences.
 */

(function () {
  'use strict';

  // ——— Sticky State (localStorage-backed) ———
  function stickyState(key, defaultValue) {
    let value = defaultValue;
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) value = JSON.parse(stored);
    } catch (_) { /* ignore */ }
    return {
      get()  { return value; },
      set(v) { value = v; try { localStorage.setItem(key, JSON.stringify(v)); } catch(_){} },
    };
  }

  // ——— State ———
  const caseSensitive   = stickyState('mempassage-case-sensitive', true);
  const checkPunctuation = stickyState('mempassage-check-punctuation', true);
  const displayModeSt   = stickyState('mempassage-display-mode', 'hidden');

  let sourceText = '';
  let typedText  = '';

  // ——— DOM refs ———
  const sourceInput   = document.getElementById('mem-source');
  const passageEl     = document.getElementById('mem-passage');
  const caseCb        = document.getElementById('case-sensitive');
  const puncCb        = document.getElementById('check-punctuation');
  const modeBtns      = document.querySelectorAll('.mem-mode-btn');

  if (!sourceInput || !passageEl) return; // guard if DOM isn't ready

  // ——— Init checkboxes from persisted state ———
  caseCb.checked = caseSensitive.get();
  puncCb.checked = checkPunctuation.get();
  setActiveMode(displayModeSt.get());

  // ——— Event listeners ———
  sourceInput.addEventListener('input', () => {
    sourceText = sourceInput.value
      .replace(/\n/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s+|\s+$/g, ' ');
    typedText = '';
    render();
  });

  caseCb.addEventListener('change', () => {
    caseSensitive.set(caseCb.checked);
    render();
  });

  puncCb.addEventListener('change', () => {
    checkPunctuation.set(puncCb.checked);
    typedText = '';
    render();
  });

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      displayModeSt.set(mode);
      setActiveMode(mode);
      render();
    });
  });

  passageEl.addEventListener('keydown', handleKey);

  // Mobile keyboard support
  passageEl.addEventListener('touchstart', () => {
    if (window.matchMedia('(pointer: coarse)').matches) {
      const inp = document.createElement('input');
      inp.type = 'text';
      Object.assign(inp.style, { position:'absolute', top:'0', left:'0', width:'1px', height:'1px', opacity:'0' });
      document.body.appendChild(inp);
      inp.focus();
      inp.addEventListener('blur', () => document.body.removeChild(inp));
    }
  });

  // ——— Key handler ———
  function handleKey(e) {
    if (e.key === ' ') e.preventDefault(); // prevent scroll

    // Prevent duplicate trailing spaces
    if (e.key === ' ' && typedText.endsWith(' ')) return;

    if (e.key === 'Backspace') {
      typedText = typedText.slice(0, -1);
    } else if (e.key.length === 1) {
      const { cleanText } = computeClean();
      if (typedText.length < cleanText.length) {
        typedText += e.key;
      }
    } else {
      return; // ignore meta keys
    }
    render();
  }

  // ——— Derived computations ———
  const PUNC_REGEX = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

  function computeClean() {
    let processed = '';
    const indices = [];
    for (let i = 0; i < sourceText.length; i++) {
      const ch = sourceText[i];
      if (!checkPunctuation.get() && PUNC_REGEX.test(ch)) continue;
      processed += ch;
      indices.push(i);
    }
    return { cleanText: processed, originalIndices: indices };
  }

  function computeVisibility() {
    const mode = displayModeSt.get();
    const len = sourceText.length;
    if (mode === 'full')   return new Array(len).fill(true);
    if (mode === 'hidden') return new Array(len).fill(false);

    const map = new Array(len).fill(false);
    const segments = sourceText.split(/(\s+)/);
    let charIdx = 0;
    let wordCount = 0;

    segments.forEach(seg => {
      const isWord = seg.trim().length > 0;
      if (isWord) {
        if (mode === 'firstLetter') map[charIdx] = true;
        if (mode === 'everyOther' && wordCount % 2 === 0) {
          for (let i = 0; i < seg.length; i++) map[charIdx + i] = true;
        }
        wordCount++;
      }
      charIdx += seg.length;
    });
    return map;
  }

  function filterPunc(text) {
    if (checkPunctuation.get()) return text;
    return text.replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, '');
  }

  // ——— Render ———
  function render() {
    if (!sourceText) {
      passageEl.innerHTML = '<span style="color: var(--color-fg-subtle)">Paste source text above, then click here and start typing from memory…</span>';
      return;
    }

    const { cleanText, originalIndices } = computeClean();
    const visibilityMap = computeVisibility();
    const filteredTyped = filterPunc(typedText);
    const isCaseSen = caseSensitive.get();

    const spans = [];
    for (let i = 0; i < sourceText.length; i++) {
      const ch = sourceText[i];
      const processedIdx = originalIndices.indexOf(i);

      if (processedIdx === -1) {
        // Punctuation that is being skipped
        spans.push(`<span class="char-skipped">${escapeHtml(ch)}</span>`);
        continue;
      }

      const hasTyped = processedIdx < filteredTyped.length;
      if (hasTyped) {
        const typedChar  = filteredTyped[processedIdx];
        const origChar   = cleanText[processedIdx];
        const isCorrect  = isCaseSen
          ? typedChar === origChar
          : typedChar.toLowerCase() === origChar.toLowerCase();

        if (isCorrect) {
          spans.push(`<span class="char-correct">${escapeHtml(ch)}</span>`);
        } else {
          spans.push(`<span class="char-incorrect">${escapeHtml(typedChar)}</span>`);
        }
      } else {
        if (visibilityMap[i]) {
          spans.push(`<span>${escapeHtml(ch)}</span>`);
        } else {
          // Hidden character — show a non-breaking space to preserve layout
          spans.push(`<span class="char-blank">${escapeHtml(ch)}</span>`);
        }
      }
    }

    passageEl.innerHTML = spans.join('');
  }

  // ——— Helpers ———
  function escapeHtml(s) {
    const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
    return s.replace(/[&<>"']/g, c => map[c]);
  }

  function setActiveMode(mode) {
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  }

  // Initial render
  render();
})();
