import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('bg-surface-elevated rounded animate-[pulseSoft_1.6s_ease-in-out_infinite]', className)}
      {...props}
    />
  );
}

export function TourCardSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-9 w-full mt-4" />
      </div>
    </div>
  );
}
