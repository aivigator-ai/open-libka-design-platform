/**
 * A strict Content Security Policy for a finished page: nothing loads but the page's own inline scripts and styles
 * (allowed by hash), its own files (fonts, images, media next to it) and, after the reader asks for it, a video
 * player from the two privacy-friendly hosts the video block uses; a site may add its host's own sources (a
 * statistics script and where it reports), and nothing else. Synchronous (the hash is @libka/design's SHA-256), so
 * the Studio builds the same pages in the browser.
 */
import { sha256Bytes } from '@libka/design/sha256';

/** SHA-256 of a UTF-8 string, as base64 (what a CSP hash source holds). */
export function sha256Base64(text: string): string {
  let bin = '';
  sha256Bytes(text).forEach((byte) => { bin += String.fromCharCode(byte); });
  return btoa(bin);
}

/** The hosts the video block loads a player from, after the reader clicks. */
export const VIDEO_HOSTS = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com'];

/** Sources a host's own service needs on a page, such as its privacy-friendly statistics: scripts and requests. */
export interface HostSources {
  script?: string[];
  connect?: string[];
}

/** The policy for a page whose inline scripts and styles are given (frames: sources besides the video players). */
export function policy(scripts: string[], styles: string[], frames: string[] = [], host: HostSources = {}): string {
  const hash = (s: string) => `'sha256-${sha256Base64(s)}'`;
  return [
    "default-src 'none'",
    `script-src ${[...new Set(scripts.map(hash)), ...(host.script ?? [])].join(' ') || "'none'"}`,
    ...(host.connect?.length ? [`connect-src ${host.connect.join(' ')}`] : []),
    `style-src 'self' ${[...new Set(styles.map(hash))].join(' ')}`.trim(),
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self'",
    `frame-src ${[...frames, ...VIDEO_HOSTS].join(' ')}`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');
}

/** A finished page with its policy declared right after the charset, before any style or script. */
export function withCsp(html: string, frames?: string[], host?: HostSources): string {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]!);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy(scripts, styles, frames, host)}">`;
  return html.replace(/<meta charset="utf-8">\n?/, (m) => `${m.trimEnd()}\n${meta}\n`);
}

/** A page without its policy: for previews that inject their own checking scripts (the Studio). */
export const withoutCsp = (html: string) => html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '');
