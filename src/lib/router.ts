import { useSyncExternalStore } from 'react';

/** Hash routing — GitHub Pages has no SPA fallback, and hashes keep deep links working offline. */
export interface Route {
  path: string[];
  query: URLSearchParams;
  raw: string;
}

function parse(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [p = '', q = ''] = hash.split('?');
  return {
    path: p
      .split('/')
      .filter(Boolean)
      .map((seg) => {
        try {
          return decodeURIComponent(seg);
        } catch {
          return seg;
        }
      }),
    query: new URLSearchParams(q),
    raw: hash,
  };
}

let current = parse();
const listeners = new Set<() => void>();
function update() {
  current = parse();
  listeners.forEach((l) => l());
}
window.addEventListener('popstate', update);
window.addEventListener('hashchange', update);

/** in-app links (<a href="#/…">) go through navigate() so history depth is tracked */
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement | null)?.closest?.('a');
  const href = a?.getAttribute('href');
  if (!a || !href?.startsWith('#/') || e.metaKey || e.ctrlKey || a.target) return;
  e.preventDefault();
  navigate(href);
});

const depth = () => (history.state as { idx?: number } | null)?.idx ?? 0;

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const target = '#/' + to.replace(/^[#/]+/, '');
  if (target === window.location.hash && !opts.replace) return;
  if (opts.replace) history.replaceState({ idx: depth() }, '', target);
  else history.pushState({ idx: depth() + 1 }, '', target);
  update();
  window.scrollTo(0, 0);
}

/** Go back inside the app, or to `fallback` when there's no in-app history (deep link / PWA launch). */
export function goBack(fallback = ''): void {
  if (depth() > 0) history.back();
  else navigate(fallback, { replace: true });
}

export const wordHref = (w: string, pinyin?: string) =>
  `#/word/${encodeURIComponent(w)}${pinyin ? `?p=${encodeURIComponent(pinyin)}` : ''}`;
