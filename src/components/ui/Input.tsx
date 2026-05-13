import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', error, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'w-full bg-surface-elevated text-text-primary border border-border rounded-md px-4 py-2',
        'placeholder:text-text-muted font-sans text-sm',
        'transition-all duration-200 outline-none',
        'focus:border-primary focus:ring-2 focus:ring-primary/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        error && 'border-error focus:border-error focus:ring-error/20',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';
