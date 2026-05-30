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
  const inputEl       = document.getElementById('mem-input');
  const passageEl     = document.getElementById('mem-passage');
  const caseCb        = document.getElementById('case-sensitive');
  const puncCb        = document.getElementById('check-punctuation');
  const modeBtns      = document.querySelectorAll('.mem-mode-btn');

  if (!sourceInput || !passageEl || !inputEl) return; // guard if DOM isn't ready

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
    inputEl.value = '';
    render();
  });

  inputEl.addEventListener('input', () => {
    // Restrict typed text length to clean source text length
    const { cleanText } = computeClean();
    let currentInput = inputEl.value;
    if (currentInput.length > cleanText.length) {
      currentInput = currentInput.slice(0, cleanText.length);
      inputEl.value = currentInput;
    }
    typedText = currentInput;
    render();
  });

  caseCb.addEventListener('change', () => {
    caseSensitive.set(caseCb.checked);
    render();
  });

  puncCb.addEventListener('change', () => {
    checkPunctuation.set(puncCb.checked);
    typedText = '';
    inputEl.value = '';
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
      passageEl.innerHTML = '<span style="color: var(--color-fg-subtle)">Paste source text above, then type here from memory…</span>';
      inputEl.style.height = '10rem';
      passageEl.style.height = '10rem';
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
          if (ch === ' ') {
            spans.push(`<span class="char-blank-space">&nbsp;</span>`);
          } else {
            spans.push(`<span class="char-blank">${escapeHtml(ch)}</span>`);
          }
        }
      }
    }

    passageEl.innerHTML = spans.join('');

    // Dynamically adjust heights to match scroll height of backdrop
    requestAnimationFrame(() => {
      const height = Math.max(160, passageEl.scrollHeight);
      inputEl.style.height = height + 'px';
      passageEl.style.height = height + 'px';
    });
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
