import React from 'react';
import { Input } from './ui/input';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}) => {
  return (
    <div className={`mb-2 ${className}`}>
      <div className="relative flex items-center">
        <span className="absolute left-2 z-10 text-discord-text-faint text-sm">
          🔍
        </span>
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-7 pr-8 py-1.5 bg-discord-bg-accent border border-transparent rounded text-discord-text-secondary text-sm focus:border-discord-brand focus:bg-discord-bg-primary placeholder:text-discord-text-faint"
        />
        {value && (
          <button
            className="absolute right-2 bg-transparent border-none text-discord-text-faint cursor-pointer text-sm p-0 w-4 h-4 flex items-center justify-center hover:text-discord-text-secondary"
            onClick={() => onChange('')}
            type="button"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};

export default SearchBar;
