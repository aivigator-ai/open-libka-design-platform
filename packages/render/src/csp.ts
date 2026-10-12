/**
 * A strict Content Security Policy for a finished page: nothing loads but the page's own inline scripts and styles
 * (allowed by hash), its own files (fonts, images, media next to it) and, after the reader asks for it, a video
 * player from the two privacy-friendly hosts the video block uses; a site may add its host's own sources (a
 * statistics script and where it reports), and nothing else. Synchronous and dependency-free, so the Studio
 * builds the same pages in the browser.
 */

/** SHA-256 of a UTF-8 string, as base64 (what a CSP hash source holds). */
export function sha256Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const length = bytes.length;
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 2 ** 32));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let t = 0; t < 16; t++) W[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15]!, 7) ^ rotr(W[t - 15]!, 18) ^ (W[t - 15]! >>> 3);
      const s1 = rotr(W[t - 2]!, 17) ^ rotr(W[t - 2]!, 19) ^ (W[t - 2]! >>> 10);
      W[t] = (W[t - 16]! + s0 + W[t - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = [H[0]!, H[1]!, H[2]!, H[3]!, H[4]!, H[5]!, H[6]!, H[7]!];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[t]! + W[t]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
    }
    H[0] = (H[0]! + a) >>> 0; H[1] = (H[1]! + b) >>> 0; H[2] = (H[2]! + c) >>> 0; H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0; H[5] = (H[5]! + f) >>> 0; H[6] = (H[6]! + g) >>> 0; H[7] = (H[7]! + h) >>> 0;
  }
  const out = new Uint8Array(32);
  H.forEach((v, i) => new DataView(out.buffer).setUint32(i * 4, v));
  let bin = '';
  out.forEach((byte) => { bin += String.fromCharCode(byte); });
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
