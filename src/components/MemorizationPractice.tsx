"use client";

import React, { useState, useMemo } from 'react';
import { useStickyState } from '@/hooks/useStickyState';
import { MemPassageSettings, DisplayMode } from './MemPassageSettings';
import { MemPassage } from './MemPassage';
import { Container } from './Container';

interface MemorizationPracticeProps {
  text: string;
}

export function MemorizationPractice({ text }: MemorizationPracticeProps) {
  const [typedText, setTypedText] = useState('');

  const [isCaseSensitive, setIsCaseSensitive] = useStickyState(true, 'mempassage-case-sensitive');
  const [checkPunctuation, setCheckPunctuation] = useStickyState(true, 'mempassage-check-punctuation');
  const [displayMode, setDisplayMode] = useStickyState<DisplayMode>('hidden', 'mempassage-display-mode');

  const { cleanText, originalIndices } = useMemo(() => {
    let processed = '';
    const indices: number[] = [];
    const puncRegex = /[!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~]/;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (!checkPunctuation && puncRegex.test(char)) continue;
        processed += char;
        indices.push(i);
    }
    return { cleanText: processed, originalIndices: indices };
  }, [text, checkPunctuation]);

  const visibilityMap = useMemo(() => {
    if (displayMode === 'full') return Array(text.length).fill(true);
    if (displayMode === 'hidden') return Array(text.length).fill(false);
    
    const map = Array(text.length).fill(false);
    const wordsAndSpaces = text.split(/(\s+)/);
    let charIndex = 0;
    let wordCount = 0;

    wordsAndSpaces.forEach(segment => {
      const isWord = segment.trim().length > 0;
      if (isWord) {
        if (displayMode === 'firstLetter') map[charIndex] = true;
        if (displayMode === 'everyOther' && wordCount % 2 === 0) {
          for (let i = 0; i < segment.length; i++) map[charIndex + i] = true;
        }
        wordCount++;
      }
      charIndex += segment.length;
    });
    return map;
  }, [text, displayMode]);

  // All event handling logic lives here
  const handleKeyPress = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === ' ') event.preventDefault();
    if (event.key === 'Backspace') {
      setTypedText(typedText.slice(0, -1));
    } else if (event.key.length === 1 && typedText.length < cleanText.length) {
      setTypedText(typedText + event.key);
    }
  };

  return (
    <Container className="mt-16 sm:mt-16">
      <MemPassageSettings
        isCaseSensitive={isCaseSensitive}
        onCaseSensitiveChange={setIsCaseSensitive}
        checkPunctuation={checkPunctuation}
        onPunctuationChange={setCheckPunctuation}
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
      />
      <MemPassage
        text={text}
        typedText={typedText}
        onKeyPress={handleKeyPress}
        isCaseSensitive={isCaseSensitive}
        checkPunctuation={checkPunctuation}
        cleanText={cleanText}
        originalIndices={originalIndices}
        visibilityMap={visibilityMap}
      />
    </Container>
  );
}
