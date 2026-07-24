import { getSafeAreaInsets } from './layout';

/** Applies Telegram viewport height, safe-area CSS vars, and full-screen expansion. */
export function initTelegramViewport(): void {
  const tg = window.Telegram?.WebApp;
  if (!tg) {
    setAppHeight(window.innerHeight);
    return;
  }

  tg.ready();
  tg.expand();
  // requestFullscreen throws WebAppMethodUnsupported outside a real Telegram
  // client; never let an optional viewport call abort boot.
  try {
    tg.requestFullscreen?.();
  } catch {
    /* unsupported in this environment */
  }

  const syncViewport = (): void => {
    const height = tg.viewportStableHeight ?? tg.viewportHeight ?? window.innerHeight;
    setAppHeight(height);
    syncSafeAreaCssVars();
  };

  syncViewport();
  tg.onEvent?.('viewportChanged', syncViewport);
  tg.onEvent?.('safeAreaChanged', syncViewport);
  tg.onEvent?.('contentSafeAreaChanged', syncViewport);
  tg.onEvent?.('fullscreenChanged', syncViewport);
  window.addEventListener('resize', syncViewport);
  window.setTimeout(syncViewport, 50);
  window.setTimeout(syncViewport, 300);
}

function setAppHeight(height: number): void {
  const px = `${Math.max(Math.round(height), 1)}px`;
  document.documentElement.style.setProperty('--app-height', px);
}

function syncSafeAreaCssVars(): void {
  const insets = getSafeAreaInsets();
  document.documentElement.style.setProperty('--safe-area-top', `${insets.top}px`);
  document.documentElement.style.setProperty('--safe-area-bottom', `${insets.bottom}px`);
}
