"use client";

import clsx from 'clsx';
import React, { useRef, useEffect, useMemo } from 'react';

interface MemPassageProps extends React.ComponentPropsWithoutRef<'div'> {
  text: string;
  typedText: string;
  onKeyPress: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  isCaseSensitive: boolean;
  checkPunctuation: boolean;
  cleanText: string;
  originalIndices: number[];
  visibilityMap: boolean[];
}

function filterPunctuation(checkPunctuation: boolean, text: string) {
  if (checkPunctuation) return text;
  return text.replace(/[!"#$%&'()*+,-./:;<=>?@[\]\^_`{|}~]/g, '');
}

export function MemPassage({
  text,
  typedText,
  onKeyPress,
  isCaseSensitive,
  checkPunctuation,
  cleanText,
  originalIndices,
  visibilityMap,
  className,
  ...props
}: MemPassageProps) {
  const containerRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const handleKeyPress = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === ' ' && typedText.endsWith(' ')) return;
    onKeyPress(event);
  };

  const filteredPunctuation = useMemo(
    () => filterPunctuation(checkPunctuation, typedText),
    [typedText, checkPunctuation]
  );

  return (
    <div
      ref={containerRef}
      className={clsx(className, 'prose dark:prose-invert outline-none border p-4 rounded-md focus:ring-2 focus:ring-blue-500')}
      onKeyDown={handleKeyPress}
      tabIndex={0}
      {...props}
    >
      {text?.split('').map((char, index) => {
        const processedIndex = originalIndices.indexOf(index);
        if (processedIndex === -1) {
          return <span key={index} className="text-gray-400">{char}</span>;
        }

        const hasTyped = processedIndex < filteredPunctuation.length;
        if (hasTyped) {
          const typedChar = filteredPunctuation[processedIndex];
          const originalCleanChar = cleanText[processedIndex];
          const isCorrect = isCaseSensitive ? typedChar === originalCleanChar : typedChar.toLowerCase() === originalCleanChar.toLowerCase();
          return (
            <span key={index} className={clsx({'text-green-600 dark:text-green-400': isCorrect, 'text-red-500 bg-red-100 dark:bg-red-900/50 rounded-sm': !isCorrect})}>
              {isCorrect? char : typedChar}
            </span>
          );
        } else {
          if (visibilityMap[index]) {
            return <span key={index}>{char}</span>;
          } else {
            return <span key={index}>{' '}</span>;
          }
        }
      })}
    </div>
  );
}
