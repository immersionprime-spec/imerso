'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface ShareTourDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
}

export function ShareTourDialog({ open, onOpenChange, url }: ShareTourDialogProps) {
  const t = useTranslations('viewer.share_dialog');
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('copy_fail'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('desc')}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={url} className="font-mono text-xs" />
          <Button type="button" onClick={copy}>
            {copied ? t('copied') : t('copy')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
