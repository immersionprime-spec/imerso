import { cn } from '@/lib/utils/cn';

export interface ProgressProps {
  value: number;
  className?: string;
}

export function Progress({ value, className }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={cn('h-2 bg-surface-elevated rounded-full overflow-hidden', className)}>
      <div
        className="h-full rounded-full transition-all duration-200"
        style={{
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #4F8EF7, #D4A574)',
        }}
      />
    </div>
  );
}
