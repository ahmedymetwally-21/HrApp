import { useEffect, useState } from 'react';

/**
 * Returns `true` ONLY when running as an installed mobile PWA (standalone display-mode)
 * or on a compact mobile screen (<768px). On desktop/web browsers this returns `false`
 * so major forms & profile views render as clean full-page workspace views instead of modals.
 */
export function useIsCompactOverlay(): boolean {
  const getMatches = () => {
    if (typeof window === 'undefined') return false;
    const isStandalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    const isSmallMobile = window.innerWidth < 768;
    return isStandalone || isSmallMobile;
  };

  const [compact, setCompact] = useState<boolean>(getMatches);

  useEffect(() => {
    const update = () => setCompact(getMatches());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return compact;
}
