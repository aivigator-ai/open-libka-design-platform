// Writes each gallery template's pictures (gallery/<id>/en.png, cs.png): the report's first page, the talk's title
// slide, from the template's own build in Chrome, 640 × 400 pixels. gallery/pictures.json records the SHA-256 of the
// source each picture was made from; the test fails when a template changed and its picture did not.
//   node packages/create-libka/build-pictures.mts
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '@libka/cli';
import { launchBrowser } from '@libka/guard';

const gallery = join(dirname(fileURLToPath(import.meta.url)), 'gallery');
const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const ids = readdirSync(gallery, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const browser = await launchBrowser();
const record: Record<string, Record<string, string>> = {};
const work = mkdtempSync(join(tmpdir(), 'libka-pictures-'));
try {
  for (const id of ids) {
    const meta = JSON.parse(readFileSync(join(gallery, id, 'template.json'), 'utf8')) as { picture: 'page' | 'slide' };
    record[id] = {};
    for (const lang of ['en', 'cs']) {
      const dir = join(work, `${id}-${lang}`);
      mkdirSync(join(dir, '.libka'), { recursive: true });
      const source = join(gallery, id, `${lang}.md`);
      copyFileSync(source, join(dir, `${id}.md`));
      const slide = meta.picture === 'slide';
      const r = await build(join(dir, `${id}.md`), { out: join(dir, 'out'), check: false, outputs: slide ? ['deck'] : ['web'] });
      if (!r.ok) throw new Error(`${id} ${lang}: ${r.problems.join('; ')}`);
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 0.5 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(pathToFileURL(slide ? r.deck!.html : r.html!).href);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(200);
      const png = slide ? await page.locator('#slide-1 .lk-slide').screenshot({ type: 'png' }) : await page.screenshot({ type: 'png' });
      writeFileSync(join(gallery, id, `${lang}.png`), png);
      await page.close();
      record[id]![lang] = sha(source);
      console.log(`pictures: wrote gallery/${id}/${lang}.png`);
    }
  }
} finally {
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}
writeFileSync(join(gallery, 'pictures.json'), `${JSON.stringify(record, null, 2)}\n`);
console.log('pictures: wrote gallery/pictures.json');
