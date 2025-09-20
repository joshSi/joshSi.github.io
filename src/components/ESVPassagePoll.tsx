"use client";

import { useState } from 'react';
import { Button } from './Button';

interface ESVPassagePollProps {
  apiKey: string;
  onPassageChange?: (passage: string) => void;
}

const ESVPassagePoll = ({ apiKey, onPassageChange }: ESVPassagePollProps) => {
  const [passage, setPassage] = useState<string>('');
  const [query, setQuery] = useState<string>('Psalms46:11');

  const fetchPassage = () => {
    const url = new URL(`https://api.esv.org/v3/passage/text/?q=${query}`);
    const headers = new Headers();
    headers.append('Authorization', `Token ${apiKey}`);
    fetch(url.toString(), { headers })
      .then(response => response.json())
      .then(data => {
        setPassage(data.passages[0].content);
        if (onPassageChange) onPassageChange(data.passages[0].content);
      })
      .catch(error => console.error(error));
  };

  const handleQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.currentTarget.value);
  };

  const handleTestPassage = () => {
    fetchPassage();
  };

  return (
    <div className="flex flex-col">
      <form className="flex flex-col">
        <label className="block text-gray-600 dark:text-gray-400 text-sm font-bold mb-2">
          ESV Passage
        </label>
        <div className="mb-4">
          <input
            type="text"
            className="bg-transparent shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline"
            onChange={handleQueryChange}
          />
        </div>
        <Button className="self-start" onClick={handleTestPassage}>Test Passage</Button>
      </form>
    </div>
  );
};

export default ESVPassagePoll;

