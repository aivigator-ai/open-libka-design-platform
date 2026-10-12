/** What the About dialog says and what a hosted copy adds (hosting.mjs): no browser needed. */
import { describe, expect, it } from 'vitest';
// @ts-expect-error a plain ES module of the build, without types
import { aboutData, hostedGaps, hostedHeaders } from '../hosting.mjs';

const publisher = { public: { githubOwner: 'someone', copyrightHolder: 'The Publisher', siteUrl: 'https://libka.example.org/', imprintUrl: 'https://example.org/imprint', privacyUrl: 'https://example.org/privacy' } };

describe('the About dialog and the hosted copy', () => {
  it('names the source only when the build knows it: an unfilled placeholder is not an address', () => {
    expect(aboutData({ version: '1.24.0' })).toEqual({ version: '1.24.0', source: null, hosted: null });
    expect(aboutData({ version: '1.24.0', metadata: { repository: '{{repo.url}}' } }).source).toBeNull();
    expect(aboutData({ version: '1.24.0', metadata: { repository: 'https://github.com/x/open-libka-design-platform' } }).source).toBe('https://github.com/x/open-libka-design-platform');
  });

  it('a hosted copy names its publisher and links its site, imprint and privacy policy', () => {
    const about = aboutData({ version: '1.24.0', publisher, hosted: true });
    expect(about).toEqual({
      version: '1.24.0', source: 'https://github.com/someone/open-libka-design-platform',
      hosted: {
        by: 'The Publisher', siteUrl: 'https://libka.example.org',
        imprintUrl: { en: 'https://example.org/imprint', cs: 'https://example.org/imprint' },
        privacyUrl: { en: 'https://example.org/privacy', cs: 'https://example.org/privacy' },
      },
    });
    expect(hostedGaps(about)).toEqual([]);
    const partial = aboutData({ version: '1.24.0', publisher: { public: { copyrightHolder: 'P' } }, hosted: true });
    expect(hostedGaps(partial)).toEqual([expect.stringContaining('the LibKa site'), expect.stringMatching(/imprint/), expect.stringMatching(/privacy/)]);
    expect(() => aboutData({ version: '1.24.0', publisher: null, hosted: true })).toThrow(/needs the publisher/);
  });

  it('links the LibKa site\'s own legal pages in the interface language, as the site writes them', () => {
    const site = { public: { copyrightHolder: 'P', siteUrl: 'https://libka.example.org/', imprintUrl: 'https://libka.example.org/imprint', privacyUrl: 'https://libka.example.org/privacy/' } };
    const { hosted } = aboutData({ version: '2.0.0', publisher: site, hosted: true });
    expect(hosted.imprintUrl).toEqual({ en: 'https://libka.example.org/imprint/', cs: 'https://libka.example.org/cs/imprint/' });
    expect(hosted.privacyUrl).toEqual({ en: 'https://libka.example.org/privacy/', cs: 'https://libka.example.org/cs/privacy/' });
  });

  it('serves the hosted copy with its policy, never inside another site\'s frame, without a referrer', () => {
    const headers = hostedHeaders("default-src 'self'");
    expect(headers).toMatch(/^\/\*\n {2}Cache-Control: [^\n]*\bno-transform\n {2}Content-Security-Policy: default-src 'self'; frame-ancestors 'none'\n/);
    expect(headers).toContain('Referrer-Policy: no-referrer');
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toMatch(/\/sw\.js\n {2}Cache-Control: no-cache/);
  });
});
