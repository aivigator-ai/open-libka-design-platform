import { describe, expect, it } from 'vitest';
import { builtinTheme, designWords, LIBKA_BRAND, parseBrand, resolveDesign } from '../src/index.ts';

const brand = (yml: string) => parseBrand(yml).brand!;

describe('the solver\'s result in words', () => {
  const yellow = brand('color:\n  primary: "#F2C500"\n  secondary: "#1D4E89"\ntypography:\n  link:\n    color: "#1D4E89"\n  headings: Bitter\n  base: Public Sans\n');
  const d = resolveDesign(yellow, builtinTheme('classic')!).design;

  it('says in English what each brand colour became, which series LibKa filled, the other modes and the type', () => {
    expect(designWords(d)).toEqual([
      expect.stringMatching(/^the primary colour #F2C500: bars, borders and charts use #[0-9A-F]{6} to reach 3:1; the accent button keeps it with a label that passes$/),
      'the secondary colour #1D4E89 passes as it is: the AI marks, AI text, the AI button use it',
      'the link colour #1D4E89 passes as it is: links and accent text use it',
      expect.stringMatching(/^chart series 1 \(#F2C500\) uses #[0-9A-F]{6} to reach 3:1 against the page$/),
      'chart series 3, 4, 5 and 6 are LibKa\'s, after the brand\'s 2 colours',
      'the dark and high-contrast modes take their own shades of the same hue, each passing in its mode',
      'type: Bitter headings over Public Sans text (the brand\'s); a Word file uses Georgia and Arial in their place',
    ]);
  });

  it('says the same in Czech, each sentence capitalised', () => {
    const cs = designWords(d, 'cs');
    expect(cs).toHaveLength(7);
    expect(cs[0]).toMatch(/^Hlavní barva #F2C500: sloupce, okraje a grafy používají #[0-9A-F]{6} kvůli kontrastu 3:1; zvýrazňující tlačítko ji používá beze změny a má popisek s dostatečným kontrastem$/);
    expect(cs[1]).toBe('Doplňková barva #1D4E89 má dostatečný kontrast i beze změny: používá se pro označení AI, text AI, tlačítko AI');
    expect(cs[2]).toBe('Barva odkazů #1D4E89 má dostatečný kontrast i beze změny: používá se pro odkazy a zvýrazněný text');
    expect(cs[3]).toMatch(/^Řada grafu 1 \(#F2C500\) používá #[0-9A-F]{6} kvůli kontrastu 3:1 vůči pozadí stránky$/);
    expect(cs[4]).toBe('Řady grafu 3, 4, 5 a 6 následují za dvěma barvami značky a mají barvy LibKa');
    expect(cs[6]).toBe('Písmo: nadpisy Bitter, text Public Sans (ze značky); soubor Word místo nich použije písma Georgia a Arial');
    expect(designWords(resolveDesign(brand('color:\n  primary: "#0B6E4F"\n'), builtinTheme('modern')!).design, 'cs').at(-1))
      .toBe('Písmo: nadpisy Space Grotesk, text Inter (z motivu Moderní); soubor Word místo nich použije písmo Arial pro nadpisy i text');
  });

  it('says nothing for LibKa\'s own brand', () => {
    expect(designWords(resolveDesign(LIBKA_BRAND).design, 'cs')).toEqual([]);
  });
});
