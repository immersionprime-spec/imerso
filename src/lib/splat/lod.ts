'use client';

export type QualityLevel = 'high' | 'medium' | 'low';

export interface QualityPreset {
  sphericalHarmonicsDegree: number;
  antialiased: boolean;
  pixelRatio: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  high: {
    sphericalHarmonicsDegree: 2,
    antialiased: true,
    pixelRatio: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 2,
  },
  medium: {
    sphericalHarmonicsDegree: 1,
    antialiased: true,
    pixelRatio: 1.25,
  },
  low: {
    sphericalHarmonicsDegree: 0,
    antialiased: false,
    pixelRatio: 1,
  },
};

export function detectInitialQuality(): QualityLevel {
  if (typeof window === 'undefined') return 'high';
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const memGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  // Desktop: sempre high (SH=2, antialiased, pixelRatio cap 2).
  // Mobile fraco: low. Mobile normal: medium.
  if (!isMobile) return 'high';
  if (memGB <= 4) return 'low';
  return 'medium';
}
