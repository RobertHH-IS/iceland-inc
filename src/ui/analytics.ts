/**
 * Visitor counts on the public site (Vercel Web Analytics): page views, with no cookies.
 *
 * Vercel serves the counting script at /_vercel/insights/script.js on its deployments once Web
 * Analytics is switched on for the project. Nothing is loaded while developing (bun run dev) or
 * from a file opened from disk. This is Vercel's own snippet for a plain HTML site, added from
 * code because the bundler cannot resolve a script address that starts at the site root.
 */

/** Whether a page on this host counts its visits: every host except a local development one. */
export function countsVisits(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === '' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return false;
  return !host.endsWith('.localhost') && !host.endsWith('.test');
}

type AnalyticsWindow = Window & { va?: (...args: unknown[]) => void; vaq?: unknown[][] };

/** Start counting visits, once, where the host counts them. */
export function startAnalytics(): void {
  if (!countsVisits(window.location.hostname)) return;
  const w = window as AnalyticsWindow;
  if (w.va) return;
  // calls made before the script arrives wait in a queue that the script then reads
  w.va = (...args: unknown[]) => {
    (w.vaq ??= []).push(args);
  };
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  document.head.appendChild(script);
}
