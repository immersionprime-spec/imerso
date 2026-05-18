'use client';

import { useEffect, useRef, useState } from 'react';

interface AmbientAudioProps {
  audioUrl?: string | null;
}

export function AmbientAudio({ audioUrl }: AmbientAudioProps) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audio.loop = true;
    audio.volume = 0.15;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [audioUrl]);

  if (!audioUrl) return null;

  function toggleAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play().catch(() => {
        /* autoplay policy */
      });
      setPlaying(true);
    }
  }

  return (
    <button
      type="button"
      onClick={toggleAudio}
      className="fixed left-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/70 backdrop-blur-sm transition-all hover:bg-black/70 hover:text-white sm:left-4"
      aria-label={playing ? 'Desativar som ambiente' : 'Ativar som ambiente'}
      title={playing ? 'Desativar som ambiente' : 'Ativar som ambiente'}
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {playing ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      )}
    </button>
  );
}
