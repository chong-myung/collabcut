import * as React from 'react';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className = '', variant = 'default', size = 'default', ...props },
    ref
  ) => {
    // Base Tailwind classes
    const baseClasses =
      'inline-flex items-center justify-center rounded font-medium cursor-pointer transition-all duration-150 border-none';

    // Variant classes using Tailwind
    const variantClasses = {
      default:
        'bg-discord-brand text-discord-text-primary hover:bg-discord-brand-hover',
      destructive:
        'bg-discord-danger text-discord-text-primary hover:bg-discord-danger-hover',
      outline:
        'bg-transparent border border-discord-border text-discord-text-secondary hover:bg-discord-bg-accent',
      secondary:
        'bg-discord-bg-accent-hover text-discord-text-secondary hover:bg-discord-bg-accent-active',
      ghost:
        'bg-transparent text-discord-text-muted hover:bg-discord-bg-accent hover:text-discord-text-secondary',
      link: 'bg-transparent text-discord-brand underline p-0 hover:text-discord-brand-hover',
    };

    // Size classes using Tailwind
    const sizeClasses = {
      default: 'px-4 py-2 text-sm min-h-8',
      sm: 'px-2 py-1 text-xs min-h-7',
      lg: 'px-6 py-3 text-base min-h-11',
      icon: 'w-8 h-8 p-0 min-w-8',
    };

    // Legacy CSS classes for backward compatibility
    const legacyClasses = `btn btn-${variant} btn-${size}`;

    const classes =
      `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${legacyClasses} ${className}`.trim();

    return <button className={classes} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button };
