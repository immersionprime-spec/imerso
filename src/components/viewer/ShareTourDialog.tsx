'use client';

import { useState } from 'react';
import { Camera } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface ShareTourDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  onScreenshot?: () => void;
}

export function ShareTourDialog({ open, onOpenChange, url, onScreenshot }: ShareTourDialogProps) {
  const tShare = useTranslations('viewer.share_dialog');
  const tViewer = useTranslations('viewer');
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(tShare('copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(tShare('copy_fail'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tShare('title')}</DialogTitle>
          <DialogDescription>{tShare('desc')}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={url} className="font-mono text-xs" />
          <Button type="button" onClick={copy}>
            {copied ? tShare('copied') : tShare('copy')}
          </Button>
        </div>
        {onScreenshot ? (
          <>
            <div className="my-2 border-t border-border" />
            <button
              type="button"
              onClick={onScreenshot}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
            >
              <Camera className="h-4 w-4 shrink-0" />
              <span>{tViewer('screenshot')}</span>
            </button>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
