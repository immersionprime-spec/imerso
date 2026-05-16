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
  if (typeof window === 'undefined') return 'medium';
  const ua = navigator.userAgent;
  const isTablet = /iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const isMobile = /Android.*Mobile|iPhone/i.test(ua);
  const memGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;

  if (!isMobile && !isTablet) return 'high';
  if (isTablet) return 'medium';
  if (isMobile && memGB <= 2) return 'low';
  return 'medium';
}
