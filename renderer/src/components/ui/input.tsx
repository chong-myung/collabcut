import * as React from 'react';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', type, ...props }, ref) => {
    // Base Tailwind classes for input styling
    const baseClasses =
      'w-full px-3 py-2 bg-discord-bg-accent border border-discord-bg-accent rounded text-discord-text-secondary text-sm transition-colors duration-150 focus:outline-none focus:border-discord-brand placeholder:text-discord-text-faint disabled:opacity-50 disabled:cursor-not-allowed';

    // Legacy CSS class for backward compatibility
    const legacyClass = 'input';

    return (
      <input
        type={type}
        className={`${baseClasses} ${legacyClass} ${className}`.trim()}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
