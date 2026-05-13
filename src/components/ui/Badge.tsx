import { cva, type VariantProps } from 'class-variance-authority';
import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
  {
    variants: {
      variant: {
        disponivel: 'bg-success/15 text-success border-success/30',
        reservado: 'bg-warning/15 text-warning border-warning/30',
        vendido: 'bg-text-muted/15 text-text-muted border-transparent',
        draft: 'bg-surface-elevated text-text-muted border-border',
        processing: 'bg-info/15 text-info border-info/30 animate-pulse',
        ready: 'bg-success/15 text-success border-success/30',
        failed: 'bg-error/15 text-error border-error/30',
        info: 'bg-primary/15 text-primary border-primary/30',
        default: 'bg-surface-elevated text-text-secondary border-border',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
