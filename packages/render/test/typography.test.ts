import { describe, expect, it } from 'vitest';
import { parse } from '@libka/model';
import { czechText, typeset } from '../src/typography.ts';
import { renderDeck } from '../src/deck.ts';

const N = ' ';

describe('Czech typography', () => {
  it('keeps one-letter words, units and digit groups on the line with the next word', () => {
    expect(czechText('Bydlím v Praze a pracuji s lidmi i v noci.')).toBe(`Bydlím v${N}Praze a${N}pracuji s${N}lidmi i${N}v${N}noci.`);
    expect(czechText('Stojí 1 240 000 Kč, roste o 25 % a trvá 3 h.')).toBe(`Stojí 1${N}240${N}000${N}Kč, roste o${N}25${N}% a${N}trvá 3${N}h.`);
    expect(czechText('(k dispozici) „s úsměvem“')).toBe(`(k${N}dispozici) „s${N}úsměvem“`);
    expect(czechText('Verze 2024 a 12 lidí')).toBe(`Verze 2024 a${N}12 lidí`);   // a year is not a digit group
  });

  it('changes only text, never code, scripts, styles or attributes, and only in Czech', () => {
    const html = '<p title="v Praze">v Praze <code>a b</code> <strong>s</strong> k nám</p><script>if (a < b) x = "v Praze"</script><style>a > b {}</style><p>o tom</p>';
    expect(typeset(html, 'cs')).toBe(`<p title="v Praze">v${N}Praze <code>a b</code> <strong>s</strong> k${N}nám</p><script>if (a < b) x = "v Praze"</script><style>a > b {}</style><p>o${N}tom</p>`);
    expect(typeset(html, 'en')).toBe(html);
  });

  it('applies to every Czech output', () => {
    const doc = parse('---\ntitle: Návod\nlang: cs\n---\n\n## Úvod\n\nPracujeme v Brně a stojí to 250 Kč.\n').document;
    const deck = renderDeck(doc, { styles: { tokens: '', components: '', deck: '' } as never });
    expect(deck).toContain(`Pracujeme v${N}Brně a${N}stojí to 250${N}Kč.`);
  });
});
