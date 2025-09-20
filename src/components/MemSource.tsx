"use client";

import { useState } from 'react';
import { Button } from './Button';

interface MemSourceProps {
  text: string;
  onTextChange: (passage: string) => void;
}

export const MemSource = ({ text, onTextChange }: MemSourceProps) => {
  const [inputText, setInputText] = useState(text);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const filteredText = event.target.value
      .replace(/\n/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .trim();
    setInputText(filteredText);
    onTextChange(filteredText);
  };

  return (
    <div className="flex flex-col">
      <form className="flex flex-col">
        <label className="block text-gray-600 dark:text-gray-400 text-sm font-bold mb-2">
          Source
        </label>
        <div className="mb-4">
          <input
            type="password"
            className="bg-transparent shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline"
            title="Paste the source text here"
            value={inputText}
            onChange={handleInputChange}
          />
        </div>
      </form>
    </div>
  );
};
