// What the About dialog says, and what a hosted Studio adds (build.mjs --hosted), kept apart from the build so it can be
// tested. Every build has the About dialog: the version, the licence, the third-party notices, a privacy note and,
// when the build knows it, the source repository. A hosted build (the copy served on its own origin, such as
// libka-studio.<publisher domain>) also names who provides it with links to the publisher's site, imprint and privacy
// policy, read from the publisher's local file when it is built, and writes the host's security headers. The Studio
// never has analytics, hosted or not.

/** A real address, not a placeholder the export has not filled. */
const real = (url) => typeof url === 'string' && /^https:\/\/[^\s{}]+$/.test(url) ? url.replace(/\/$/, '') : null;

/**
 * A legal page's address in each interface language. A page of the LibKa site (its Czech pages are under /cs/) gets
 * its Czech twin and the trailing slash the site's pages have, so the link needs no redirect; an address elsewhere is
 * the same in both languages.
 */
function perLanguage(url, siteUrl) {
  if (!url) return null;
  if (!siteUrl || !url.startsWith(`${siteUrl}/`)) return { en: url, cs: url };
  const path = url.slice(siteUrl.length);
  const page = /\.[a-z0-9]+$/i.test(path) ? path : `${path.replace(/\/$/, '')}/`;
  return { en: `${siteUrl}${page}`, cs: `${siteUrl}/cs${page}` };
}

/**
 * @param {{ version: string, metadata?: { repository?: string } | null, publisher?: { public?: Record<string, unknown> } | null, hosted?: boolean }} o
 * metadata: npm/metadata.json (filled in the public repository); publisher: the publisher's own file (--publisher), never committed
 */
export function aboutData({ version, metadata = null, publisher = null, hosted = false }) {
  const pub = publisher?.public ?? {};
  const owner = typeof pub.githubOwner === 'string' ? pub.githubOwner : null;
  const source = real(metadata?.repository) ?? (owner ? `https://github.com/${owner}/open-libka-design-platform` : null);
  if (!hosted) return { version, source, hosted: null };
  const by = typeof pub.copyrightHolder === 'string' ? pub.copyrightHolder : null;
  if (!by) throw new Error('studio: a hosted build needs the publisher: --publisher <file> with public.copyrightHolder');
  const siteUrl = real(pub.siteUrl);
  return {
    version, source,
    hosted: { by, siteUrl, imprintUrl: perLanguage(real(pub.imprintUrl), siteUrl), privacyUrl: perLanguage(real(pub.privacyUrl), siteUrl) },
  };
}

/** What a hosted build still lacks, to say when it is built. */
export function hostedGaps(about) {
  if (!about.hosted) return [];
  return [['siteUrl', 'the LibKa site'], ['imprintUrl', 'the imprint'], ['privacyUrl', 'the privacy policy']]
    .filter(([k]) => !about.hosted[k]).map(([k, what]) => `no link to ${what} (the publisher file's public.${k})`);
}

/**
 * The host's headers for every file (Cloudflare reads _headers): the Studio's policy, never in a frame elsewhere, and
 * "no-transform", so a host that adds its statistics script to every page of a domain (Cloudflare Web Analytics on
 * automatic setup) leaves the Studio's pages untouched.
 */
export function hostedHeaders(policy) {
  return `/*
  Cache-Control: public, max-age=0, must-revalidate, no-transform
  Content-Security-Policy: ${policy}; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Strict-Transport-Security: max-age=31536000
  Cross-Origin-Opener-Policy: same-origin
/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
`;
}
