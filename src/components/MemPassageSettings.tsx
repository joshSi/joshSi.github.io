import clsx from 'clsx';

export type DisplayMode = 'hidden' | 'firstLetter' | 'everyOther' | 'full';

interface MemPassageSettingsProps {
  isCaseSensitive: boolean;
  onCaseSensitiveChange: (value: boolean) => void;
  checkPunctuation: boolean;
  onPunctuationChange: (value: boolean) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
}

export function MemPassageSettings({
  isCaseSensitive,
  onCaseSensitiveChange,
  checkPunctuation,
  onPunctuationChange,
  displayMode,
  onDisplayModeChange,
}: MemPassageSettingsProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-sm text-gray-600 dark:text-gray-400">
        <div className="flex items-center space-x-2">
          <input type="checkbox" id="case-sensitive" checked={isCaseSensitive} onChange={(e) => onCaseSensitiveChange(e.target.checked)} className="rounded" />
          <label htmlFor="case-sensitive" className="cursor-pointer">Case Sensitive</label>
        </div>
        <div className="flex items-center space-x-2">
          <input type="checkbox" id="check-punctuation" checked={checkPunctuation} onChange={(e) => onPunctuationChange(e.target.checked)} className="rounded" />
          <label htmlFor="check-punctuation" className="cursor-pointer">Punctuation</label>
        </div>
      </div>

      <div className="flex items-center space-x-2 mb-4">
        {(['hidden', 'firstLetter', 'everyOther', 'full'] as DisplayMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => onDisplayModeChange(mode)}
            className={clsx(
              'px-3 py-1 text-sm rounded-md transition-colors',
              displayMode === mode 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
            )}
          >
            {mode.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
          </button>
        ))}
      </div>
    </>
  );
}

