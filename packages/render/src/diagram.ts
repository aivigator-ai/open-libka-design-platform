/**
 * Mermaid diagrams. They are drawn to SVG in a browser (Chrome during the build, the author's browser in the
 * Studio) with the same settings, then cleaned: Mermaid's geometry and accessible title and description stay,
 * its colours, embedded stylesheet and inline styles go, so components.css can colour every diagram with the
 * LibKa tokens in each theme.
 */

/** Mermaid settings shared by the build and the Studio. Labels are measured in the LibKa UI font. */
export const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict',
  // errors are reported as LibKa problems; Mermaid must not draw its own error graphic into the page
  suppressErrorRendering: true,
  theme: 'neutral',
  htmlLabels: false,
  fontFamily: 'var(--lk-font-ui)',
  themeVariables: { fontFamily: 'var(--lk-font-ui)', fontSize: '16px' },
  flowchart: { htmlLabels: false, useMaxWidth: false },
  sequence: { useMaxWidth: false },
  state: { useMaxWidth: false },
  class: { htmlLabels: false, useMaxWidth: false },
  er: { useMaxWidth: false },
} as const;

/**
 * Runs in a browser (it is serialised into the build's Chrome page): turns Mermaid's SVG into a LibKa one.
 * The SVG is attached to the page for a moment so that Mermaid's own stylesheet still applies; the geometry it
 * sets (text anchors and baselines, font sizes and weights, line widths and dashes) is copied into
 * presentation attributes, because a centred label or a dotted line means something. Then the stylesheet,
 * inline styles, colours and filters are removed, and the root becomes an image named by the title and
 * described by the description Mermaid wrote from accTitle and accDescr.
 */
export function cleanDiagramSvg(svg: string): string {
  const host = document.createElement('div');
  host.innerHTML = svg;
  document.body.append(host);
  const root = host.querySelector('svg')!;
  const text = ['text-anchor', 'dominant-baseline', 'font-size', 'font-weight', 'font-style'];
  const line = ['stroke-width', 'stroke-dasharray', 'stroke-dashoffset'];
  const shapes = new Set(['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse']);
  const fixes: [Element, string, string][] = [];
  root.querySelectorAll('*').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const props = tag === 'text' || tag === 'tspan' ? text : shapes.has(tag) ? line : [];
    if (!props.length) return;
    const cs = getComputedStyle(el);
    for (const p of props) {
      const v = cs.getPropertyValue(p).trim();
      if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && !(p === 'stroke-dashoffset' && v === '0px')) fixes.push([el, p, v]);
    }
  });
  for (const [el, p, v] of fixes) el.setAttribute(p, v);
  root.querySelectorAll('style, filter').forEach((e) => e.remove());
  [root, ...root.querySelectorAll('*')].forEach((el) => {
    el.removeAttribute('style');
    el.removeAttribute('filter');
    for (const a of ['fill', 'stroke']) {
      const v = el.getAttribute(a);
      if (v && /^transparent$/i.test(v)) el.setAttribute(a, 'none');
      else if (v && !/^none$/i.test(v) && !v.startsWith('url(')) el.removeAttribute(a);
    }
  });
  // natural size from the viewBox: a diagram never grows past it, and CSS shrinks it to fit (max-width: 100%)
  const [, , w, h] = (root.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  if (w && h) { root.setAttribute('width', String(Math.ceil(w))); root.setAttribute('height', String(Math.ceil(h))); }
  else { root.removeAttribute('width'); root.removeAttribute('height'); }
  root.removeAttribute('aria-roledescription');
  root.setAttribute('role', 'img');
  root.setAttribute('class', `lk-diagram-svg ${root.getAttribute('class') ?? ''}`.trim());
  const out = new XMLSerializer().serializeToString(root);
  host.remove();
  return out;
}
