import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-sans font-medium transition-all duration-200 ease-out disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-white hover:bg-primary-hover hover:shadow-glow-primary active:translate-y-px',
        accent:
          'bg-accent text-background font-semibold hover:bg-accent-hover hover:shadow-glow-accent active:translate-y-px',
        ghost: 'bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary',
        outline:
          'bg-transparent border border-border-strong text-text-primary hover:bg-surface-elevated',
        destructive: 'bg-error text-white hover:opacity-90 active:translate-y-px',
      },
      size: {
        sm: 'h-8 px-3 text-sm rounded-md',
        md: 'h-10 px-4 text-sm rounded-md',
        lg: 'h-12 px-6 text-base rounded-md',
        icon: 'h-10 w-10 rounded-md',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, asChild, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref as never}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={asChild ? undefined : disabled || loading}
        {...props}
      >
        {loading && !asChild ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';
