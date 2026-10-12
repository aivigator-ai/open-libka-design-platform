/**
 * The page runtime: small progressive enhancements for manuals (and the deck's copy and video).
 * Everything works without it: tabs are then sections, accordions are native details, videos
 * are links. Inlined as `(${pageRuntime})(labels)`, so it must stay self-contained.
 *
 *   tabs     WAI-ARIA tabs (arrow keys, Home, End). Tabs with the same label switch together
 *            across the page; the reader's choice is remembered until the browser is
 *            closed (session storage: a reader's own choice, kept no longer than the visit).
 *   code     a copy button per code block; the result is announced.
 *   video    YouTube and Vimeo load (privacy-enhanced) only after the reader presses play.
 *   print    every tab and every accordion item is shown, then restored.
 *   window.libka.expandAll()  shows everything (used by Guard and before printing a PDF).
 */
export interface PageLabels {
  copy: string;
  copied: string;
  copyCode: string;
  tabs: string;
}

export function pageRuntime(L: PageLabels): void {
  const store = {
    get(k: string): string | null { try { return sessionStorage.getItem(`libka:${k}`); } catch { return null; } },
    set(k: string, v: string): void { try { sessionStorage.setItem(`libka:${k}`, v); } catch { /* storage blocked */ } },
  };
  const live = document.createElement('p');
  live.className = 'lk-visually-hidden lk-live';
  live.setAttribute('role', 'status');
  document.body.append(live);
  const announce = (text: string) => { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 50); };

  /* ---- tabs ---- */
  interface Group { el: HTMLElement; list: HTMLElement; tabs: HTMLButtonElement[]; panels: HTMLElement[] }
  const groups: Group[] = [];
  function select(g: Group, i: number, focus = false): void {
    g.tabs.forEach((t, j) => {
      const on = i === j;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      g.panels[j]!.hidden = !on;
    });
    if (focus) g.tabs[i]!.focus();
  }
  function choose(label: string): void {
    for (const g of groups) {
      const i = g.tabs.findIndex((t) => t.textContent === label);
      if (i >= 0) select(g, i);
    }
  }
  document.querySelectorAll<HTMLElement>('.lk-tabs:not(.lk-tabs--static)').forEach((el) => {
    const panels = Array.from(el.querySelectorAll<HTMLElement>(':scope > .lk-tabs-panel'));
    const list = document.createElement('div');
    list.className = 'lk-tabs-list';
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', L.tabs);
    const g: Group = { el, list, tabs: [], panels };
    panels.forEach((p, i) => {
      const label = p.querySelector('.lk-tabs-label')?.textContent ?? `${i + 1}`;
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'lk-tabs-tab';
      t.id = `${p.id}-tab`;
      t.textContent = label;
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-controls', p.id);
      p.setAttribute('role', 'tabpanel');
      p.setAttribute('aria-labelledby', t.id);
      p.tabIndex = 0;
      t.addEventListener('click', () => { select(g, i); store.set('tab', label); choose(label); });
      t.addEventListener('keydown', (e) => {
        const n = g.tabs.length;
        const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
        if (next < 0) return;
        e.preventDefault();
        select(g, next, true);
        const chosen = g.tabs[next]!.textContent ?? '';
        store.set('tab', chosen);
        choose(chosen);
        g.tabs[next]!.focus();
      });
      g.tabs.push(t);
      list.append(t);
    });
    el.prepend(list);
    el.classList.add('is-enhanced');
    groups.push(g);
    select(g, 0);
  });
  const remembered = store.get('tab');
  if (remembered) choose(remembered);

  /* ---- copy buttons ---- */
  document.querySelectorAll<HTMLElement>('.lk-code').forEach((fig) => {
    const code = fig.querySelector('code');
    if (!code) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lk-code-copy';
    b.textContent = L.copy;
    b.setAttribute('aria-label', L.copyCode);
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent ?? '');
        announce(L.copied);
        b.textContent = '✓';
        setTimeout(() => { b.textContent = L.copy; }, 1600);
      } catch {
        const range = document.createRange();
        range.selectNodeContents(code);
        const sel = getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });
    fig.append(b);
    fig.classList.add('has-copy');
  });

  /* ---- videos that load only when played ---- */
  document.querySelectorAll<HTMLAnchorElement>('a.lk-video-play[data-embed]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const frame = document.createElement('iframe');
      frame.src = a.dataset.embed!;
      frame.title = a.dataset.title ?? '';
      frame.allow = 'autoplay; fullscreen; picture-in-picture';
      frame.allowFullscreen = true;
      frame.className = 'lk-video-frame';
      a.replaceWith(frame);
      frame.focus();
    });
  });

  /* ---- everything visible: print, PDF, Guard ---- */
  let opened: HTMLDetailsElement[] = [];
  function expandAll(): void {
    for (const g of groups) {
      g.list.hidden = true;
      g.el.classList.add('is-expanded');
      g.panels.forEach((p) => { p.hidden = false; });
    }
    opened = Array.from(document.querySelectorAll<HTMLDetailsElement>('details:not([open])'));
    opened.forEach((d) => { d.open = true; });
  }
  function restore(): void {
    for (const g of groups) {
      g.list.hidden = false;
      g.el.classList.remove('is-expanded');
      select(g, Math.max(0, g.tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true')));
    }
    opened.forEach((d) => { d.open = false; });
    opened = [];
  }
  window.addEventListener('beforeprint', expandAll);
  window.addEventListener('afterprint', restore);
  (window as unknown as { libka: object }).libka = { expandAll, restore };
}
