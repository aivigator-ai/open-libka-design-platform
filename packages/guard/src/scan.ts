/**
 * Guard rules that run inside the page. No Node imports: the CLI passes these functions to
 * Playwright's page.evaluate, and LibKa Studio calls them directly in its preview frame, so both
 * apply exactly the same rules. Each function must stay self-contained (no outer references).
 */
/** axe-core's WCAG 2.2 A/AA rules, as Guard runs them in the CLI and in the Studio. */
export const AXE_TAGS: readonly string[] = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
/**
 * axe rules Guard leaves off. Text contrast is LibKa's own scan (`scanContrast`: every text, with standard colours
 * and with more contrast requested), so axe's color-contrast rule measures the same thing a second time, and on a
 * long document it took most of axe's time (2.2 of 3.2 s on a 27-page manual with its slides). Decided 2026-10-05;
 * a test shows the scan finds every text axe's rule found on a set of failing pages.
 */
export const AXE_RULES_OFF: Readonly<Record<string, { enabled: false }>> = { 'color-contrast': { enabled: false } };

export interface ScanResult {
  checked: number;
  skipped: number;
  violations: { rule: string; message: string; target: string }[];
  /** WCAG success criteria the scan exercised ("1.4.3"). */
  covered?: string[];
}

/* ---- runs inside the page: contrast of every visible text node ---- */
export interface ContrastArgs { normal: number; large: number }
export function scanContrast({ normal, large }: ContrastArgs): ScanResult {
  type RGBA = [number, number, number, number];
  const probe = document.createElement('canvas').getContext('2d')!;
  const parse = (css: string): RGBA | null => {
    if (!css || css === 'transparent') return [0, 0, 0, 0];
    let m = css.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if (m) return [+m[1]!, +m[2]!, +m[3]!, m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
    m = css.match(/^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
    if (m) return [+m[1]! * 255, +m[2]! * 255, +m[3]! * 255, m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
    probe.fillStyle = '#000'; probe.fillStyle = css;   // other syntaxes (oklch, named): let canvas normalize
    const n = probe.fillStyle;
    if (n.startsWith('#')) return [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16), 1];
    return n === css ? null : parse(n);
  };
  const over = (top: RGBA, under: RGBA): RGBA => {
    const a = top[3] + under[3] * (1 - top[3]);
    if (a === 0) return [0, 0, 0, 0];
    return [0, 1, 2].map((i) => (top[i]! * top[3] + under[i]! * under[3] * (1 - top[3])) / a).concat(a) as RGBA;
  };
  const lum = (c: RGBA) => {
    const [r, g, b] = [c[0], c[1], c[2]].map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: RGBA, b: RGBA) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const describe = (el: Element) => {
    const cls = el.getAttribute('class');
    return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (cls ? '.' + cls.trim().split(/\s+/).join('.') : '');
  };
  const background = (el: Element): RGBA | null => {
    const layers: RGBA[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage !== 'none') return null;          // text over an image or gradient: not measurable here
      const c = parse(cs.backgroundColor);
      if (!c) return null;
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    let result: RGBA = [255, 255, 255, 1];                       // the page canvas behind everything is white
    for (let i = layers.length - 1; i >= 0; i--) result = over(layers[i]!, result);
    return result;
  };
  /**
   * SVG text is painted with fill, over the SVG shapes drawn before it (a node box, a note): composite every
   * filled shape that comes earlier in the document and covers the middle of the text, over the page behind.
   */
  const svgBackground = (el: Element): RGBA | null => {
    const svg = el.closest('svg')!;
    let result = background(svg);
    if (!result) return null;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (const s of svg.querySelectorAll('rect, polygon, circle, ellipse, path')) {
      if (s.closest('defs, marker, clipPath, mask, symbol') || !(s.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const b = s.getBoundingClientRect();
      if (cx < b.left || cx > b.right || cy < b.top || cy > b.bottom) continue;
      const scs = getComputedStyle(s);
      if (!scs.fill || scs.fill === 'none' || scs.fill.startsWith('url(') || scs.display === 'none' || scs.visibility === 'hidden') continue;
      const c = parse(scs.fill);
      if (!c) return null;
      result = over([c[0], c[1], c[2], c[3] * parseFloat(scs.fillOpacity || '1') * parseFloat(scs.opacity || '1')], result);
    }
    return result;
  };
  const checkedEls = new Set<Element>();
  const violations: { rule: string; message: string; target: string }[] = [];
  let skipped = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!el || checkedEls.has(el) || !t.textContent?.trim()) continue;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || cs.display === 'none' || rect.width <= 1 || rect.height <= 1 || cs.clip !== 'auto') continue;
    // not rendered (the content of a closed details element): its styles are not kept up to date, and Guard measures it
    // again with everything shown
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ contentVisibilityAuto: true })) continue;
    if (el.closest('script, style, noscript')) continue;
    if (el.closest('[aria-disabled="true"], :disabled')) continue;   // inactive UI is exempt (WCAG 1.4.3)
    const inSvg = el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg';
    if (inSvg && (cs.fill === 'none' || el.closest('title, desc'))) continue;   // unpainted, or read by assistive tech only
    checkedEls.add(el);
    const fg = inSvg ? (cs.fill.startsWith('url(') ? null : parse(cs.fill)) : parse(cs.color);
    const bg = inSvg ? svgBackground(el) : background(el);
    if (!fg || !bg) { skipped++; continue; }
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const isLarge = size >= 24 || (size >= 18.66 && bold);
    const need = isLarge ? large : normal;
    // the text fades with every element around it that is partly transparent, not only its own; fully transparent
    // text is not shown (a control that appears on hover), like hidden text
    let opacity = 1;
    for (let node: Element | null = el; node && opacity > 0; node = node.parentElement) opacity *= parseFloat(getComputedStyle(node).opacity || '1');
    if (opacity === 0) { checkedEls.delete(el); continue; }
    const r = ratio(over([fg[0], fg[1], fg[2], fg[3] * opacity], bg), bg);
    if (r < need - 0.005) {
      violations.push({ rule: 'contrast', target: describe(el),
        message: `${r.toFixed(2)}:1 for ${isLarge ? 'large' : 'normal'} text, needs ${need}:1 ("${t.textContent.trim().slice(0, 40)}")` });
    }
  }
  return { checked: checkedEls.size, skipped, violations };
}

/* ---- runs inside the page: LibKa structure rules ---- */
export function scanStructure(): ScanResult {
  const violations: { rule: string; message: string; target: string }[] = [];
  let checked = 0;
  document.querySelectorAll('table').forEach((t, i) => {
    checked++;
    if (!t.querySelector('caption')?.textContent?.trim()) violations.push({ rule: 'table-caption', target: `table:nth-of-type(${i + 1})`, message: 'table has no caption' });
    t.querySelectorAll('th').forEach((th) => { if (!th.getAttribute('scope')) violations.push({ rule: 'table-header-scope', target: 'th', message: `header "${th.textContent?.trim()}" has no scope` }); });
  });
  document.querySelectorAll('figure').forEach((f) => {
    checked++;
    if (!f.querySelector('figcaption')?.textContent?.trim()) violations.push({ rule: 'figure-caption', target: 'figure', message: 'figure has no caption' });
  });
  // Charts: every label inside its drawing (an SVG cuts off what is outside, in every output)
  document.querySelectorAll('svg.lk-chart-svg').forEach((svg) => {
    checked++;
    const box = svg.getBoundingClientRect();
    const out = Array.from(svg.querySelectorAll('text')).filter((t) => {
      const r = t.getBoundingClientRect();
      return r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1);
    });
    if (out.length) {
      violations.push({ rule: 'chart-text-clipped', target: `#${svg.closest('.lk-chart')?.id ?? ''}`,
        message: `chart "${svg.querySelector('title')?.textContent ?? ''}": ${out.length} label(s) cut off at the edge, such as "${out[0]!.textContent}"` });
    }
  });
  document.body.querySelectorAll('[style]').forEach((el) => {
    // an empty attribute styles nothing (tools such as screenshot capture leave one behind)
    if (!el.getAttribute('style')!.trim()) return;
    checked++;
    violations.push({ rule: 'no-inline-style', target: el.tagName.toLowerCase() + (el.classList[0] ? `.${el.classList[0]}` : ''), message: 'inline style attribute (colors and spacing come from tokens)' });
  });
  // Decks: every slide's content must fit inside the slide's padding (1280×720 canvas).
  document.querySelectorAll('.lk-deck-frame > .lk-slide').forEach((slide, i) => {
    checked++;
    const el = slide as HTMLElement;
    const box = el.getBoundingClientRect();
    const scale = el.offsetWidth ? box.width / el.offsetWidth : 1;
    const cs = getComputedStyle(el);
    // client sizes exclude the borders, so start counting inside the top and left border
    const bottom = box.top + (el.clientTop + el.clientHeight - parseFloat(cs.paddingBottom)) * scale;
    const right = box.left + (el.clientLeft + el.clientWidth - parseFloat(cs.paddingRight)) * scale;
    let over = 0;
    el.querySelectorAll('*').forEach((child) => {
      const r = child.getBoundingClientRect();
      if (r.width && r.height) over = Math.max(over, (r.bottom - bottom) / scale, (r.right - right) / scale);
    });
    if (over > 1) {
      const title = el.parentElement?.dataset.title ?? '';
      violations.push({ rule: 'slide-overflow', target: `#${el.parentElement?.id ?? ''}`,
        message: `slide ${i + 1} ("${title}") does not fit: ${Math.round(over)}px too much; split it with ### or shorten it (text moved into :::notes leaves the web page and PDF too)` });
    }
  });
  return { checked, skipped: 0, violations };
}

/*
 * ---- runs inside the page, loaded 320 CSS pixels wide: WCAG 1.4.10 Reflow ----
 * Nothing makes the page scroll sideways: long text needs a place to break, and a code block or a wide table scrolls
 * inside its own box. A deck is checked as a reader sees it, its slides fitted to the screen. Content that a box of
 * its own clips (overflow hidden or clip) is not reported: that is a limit the conformance report states.
 */
export function scanReflow(): ScanResult {
  const root = document.documentElement;
  const width = root.clientWidth;
  const over = root.scrollWidth - width;
  if (over <= 0) return { checked: 1, skipped: 0, violations: [] };
  // what sticks out: the innermost elements past the edge that no box of their own scrolls or clips
  const inOwnBox = (el: Element) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (/auto|scroll|hidden|clip/.test(getComputedStyle(a).overflowX)) return true;
    return false;
  };
  const past = (el: Element) => el.getBoundingClientRect().right > width + 1;
  const first = Array.from(document.body.querySelectorAll('*')).find((el) => past(el) && !inOwnBox(el) && !Array.from(el.children).some(past));
  const target = first ? first.tagName.toLowerCase() + (first.classList[0] ? `.${first.classList[0]}` : '') : 'page';
  const text = (first?.textContent ?? '').trim().slice(0, 40);
  return { checked: 1, skipped: 0, violations: [{ rule: 'reflow', target,
    message: `at ${width} CSS pixels wide the page scrolls sideways by ${over}px${text ? ` ("${text}")` : ''}: long text needs a place to break, a wide element a scrolling box of its own (WCAG 1.4.10)` }] };
}

/** Let running transitions finish (even 0.01ms ones under reduced motion), at most 1 s, so styles are final. */
export function settle(): Promise<unknown> {
  return Promise.race([
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
}

/**
 * Pages with interactive blocks are checked twice: as loaded (tab buttons and their roles) and with
 * everything shown (every tab panel and accordion answer). Returns false when there is nothing to expand.
 */
export function expandPage(): boolean {
  const page = (window as unknown as { libka?: { expandAll(): void } }).libka;
  if (!page?.expandAll || !document.querySelector('.lk-tabs, details')) return false;
  page.expandAll();
  return true;
}

/** Both states of one check: counts add up, the same violation is reported once. */
export function mergeScans(a: ScanResult, b?: ScanResult): ScanResult {
  if (!b) return a;
  const seen = new Set(a.violations.map((v) => `${v.rule}|${v.target}|${v.message}`));
  const covered = [...new Set([...(a.covered ?? []), ...(b.covered ?? [])])];
  return {
    checked: a.checked + b.checked,
    skipped: a.skipped + b.skipped,
    violations: [...a.violations, ...b.violations.filter((v) => !seen.has(`${v.rule}|${v.target}|${v.message}`))],
    ...(covered.length ? { covered } : {}),
  };
}
