const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/**
 * Only plain web links, mail links, in-page anchors and relative paths survive. The address is read as a browser
 * reads it (the WHATWG URL parser): tabs and line breaks anywhere are dropped, and control characters and spaces at
 * either end, so "java\tscript:" or "\u0001javascript:" is a script link here too, not a relative path.
 */
export function safeHref(url: string): string | null {
  const u = url.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');
  if (/^(https?:|mailto:)/i.test(u) || u.startsWith('#') || u.startsWith('/') || u.startsWith('./') || u.startsWith('../')) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null; // javascript:, data:, file: and other schemes
  return u; // relative path like "page.html"
}
