/**
 * The deck runtime: navigation, notes, overview, presenter view, full screen, theme and contrast.
 * renderDeck inlines this function as `(${deckRuntime})(labels)`, so it must stay self-contained:
 * no imports, no references outside its body.
 *
 * Keys: → ↓ PageDown Space next · ← ↑ PageUp previous · Home End · N notes · O overview
 *       P presenter view · F full screen · D dark theme · C high contrast · Esc closes
 * Keys are ignored with Ctrl, Cmd or Alt held and while typing; Space is left to a focused control.
 * The letter keys can be turned off with the "Letter shortcuts" button (WCAG 2.1.4: a speech-input user's
 * words must not trigger them); the choice is remembered in this browser.
 * The presenter view is the same file opened with #presenter; the two windows keep the slide in
 * sync with postMessage (works for local files too). #5 links to slide 5.
 */
export interface DeckLabels {
  of: string;            // "{n} / {total}"
  announce: string;      // "Slide {n} of {total}: {title}"
  goTo: string;          // "Go to slide {n}: {title}"
  noNotes: string;
  end: string;
  popupBlocked: string;
}

export function deckRuntime(L: DeckLabels): void {
  const root = document.documentElement;
  const deck = document.querySelector('.lk-deck') as HTMLElement;
  const viewport = deck.querySelector('.lk-deck-viewport') as HTMLElement;
  const frames = Array.from(deck.querySelectorAll<HTMLElement>('.lk-deck-frame'));
  const q = (s: string) => deck.querySelector(s) as HTMLElement;
  const btn = (name: string) => deck.querySelector(`[data-deck="${name}"]`) as HTMLButtonElement;
  const counter = q('.lk-deck-count');
  const live = q('.lk-deck-live');
  const notes = q('.lk-deck-notes');
  const notesBody = q('.lk-deck-notes-body');
  const next = q('.lk-deck-next');
  const nextBody = q('.lk-deck-next-body');
  const timer = q('.lk-deck-timer');
  const total = frames.length;
  const presenter = location.hash === '#presenter';
  const fmt = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));
  const store = {
    get(k: string): string | null { try { return localStorage.getItem(`libka-deck:${k}`); } catch { return null; } },
    set(k: string, v: string): void { try { localStorage.setItem(`libka-deck:${k}`, v); } catch { /* storage blocked */ } },
  };
  let current = 0;
  let peer: Window | null = presenter ? window.opener as Window | null : null;

  /* ---- scale the 1280×720 slides to the space they have ---- */
  function fit(): void {
    const box = viewport.getBoundingClientRect();
    const s = Math.min(box.width / 1280, box.height / 720) * 0.96;
    root.style.setProperty('--lk-deck-scale', String(s > 0 ? s : 0.5));
    if (presenter) {
      const nb = nextBody.getBoundingClientRect();
      root.style.setProperty('--lk-deck-next-scale', String(Math.max(0.1, Math.min(nb.width / 1280, nb.height / 720))));
    }
  }

  function setMode(mode: 'slides' | 'overview' | 'all'): void {
    deck.dataset.mode = mode;
    frames.forEach((f, i) => {
      const slide = f.firstElementChild as HTMLElement;
      f.inert = mode === 'slides' && i !== current;
      slide.inert = mode === 'overview';
      if (mode === 'overview') {
        f.tabIndex = i === current ? 0 : -1;
        f.setAttribute('role', 'button');
        f.setAttribute('aria-label', fmt(L.goTo, { n: i + 1, title: f.dataset.title ?? '' }));
        f.removeAttribute('aria-roledescription');
      } else {
        f.removeAttribute('tabindex');
        f.removeAttribute('role');
        f.setAttribute('aria-roledescription', f.dataset.role ?? 'slide');
        f.setAttribute('aria-label', fmt(L.of, { n: i + 1, total }));
      }
    });
    btn('overview').setAttribute('aria-pressed', String(mode === 'overview'));
    if (mode === 'overview') frames[current]!.focus();
    fit();
  }

  function go(n: number, remote = false): void {
    current = Math.max(0, Math.min(total - 1, n));
    frames.forEach((f, i) => {
      f.classList.toggle('is-active', i === current);
      if (deck.dataset.mode === 'slides') f.inert = i !== current;
      if (deck.dataset.mode === 'overview') f.tabIndex = i === current ? 0 : -1;
    });
    const f = frames[current]!;
    counter.textContent = fmt(L.of, { n: current + 1, total });
    live.textContent = fmt(L.announce, { n: current + 1, total, title: f.dataset.title ?? '' });
    root.style.setProperty('--lk-deck-progress', `${((current + 1) / total) * 100}%`);
    btn('prev').disabled = current === 0;
    btn('next').disabled = current === total - 1;
    const tpl = f.querySelector('template');
    if (tpl) notesBody.replaceChildren(tpl.content.cloneNode(true));
    else notesBody.replaceChildren(Object.assign(document.createElement('p'), { className: 'lk-deck-empty', textContent: L.noNotes }));
    if (presenter) {
      const following = frames[current + 1];
      if (following) {
        const clone = following.firstElementChild!.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
        clone.inert = true;
        nextBody.replaceChildren(clone);
      } else {
        nextBody.replaceChildren(Object.assign(document.createElement('p'), { className: 'lk-deck-empty', textContent: L.end }));
      }
    }
    try { history.replaceState(null, '', presenter ? '#presenter' : `#${current + 1}`); } catch { /* sandboxed */ }
    if (!remote && peer && !peer.closed) peer.postMessage({ libkaDeck: current }, '*');
  }

  function toggleNotes(open = notes.hidden): void {
    notes.hidden = !open;
    deck.dataset.notes = open ? 'open' : 'closed';
    btn('notes').setAttribute('aria-pressed', String(open));
    fit();
  }

  function openPresenter(): void {
    if (presenter) return;
    const w = window.open(`${location.href.split('#')[0]}#presenter`, 'libka-presenter', 'popup,width=1280,height=800');
    if (!w) { live.textContent = L.popupBlocked; return; }
    peer = w;
  }

  function fullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.requestFullscreen?.();
  }

  const darkOn = () => root.dataset.theme === 'dark';
  const contrastOn = () => root.dataset.contrast === 'high' || (root.dataset.contrast !== 'standard' && matchMedia('(prefers-contrast: more)').matches);
  let letters = store.get('letters') !== 'off';
  function syncToggles(): void {
    btn('theme').setAttribute('aria-pressed', String(darkOn()));
    btn('contrast').setAttribute('aria-pressed', String(contrastOn()));
    btn('letters').setAttribute('aria-pressed', String(letters));
    deck.dataset.letters = letters ? 'on' : 'off';
  }
  function toggleLetters(): void { letters = !letters; store.set('letters', letters ? 'on' : 'off'); syncToggles(); }
  function toggleTheme(): void { root.dataset.theme = darkOn() ? 'light' : 'dark'; store.set('theme', root.dataset.theme); syncToggles(); }
  function toggleContrast(): void { root.dataset.contrast = contrastOn() ? 'standard' : 'high'; store.set('contrast', root.dataset.contrast); syncToggles(); }

  /* ---- input ---- */
  const actions: Record<string, () => void> = {
    prev: () => go(current - 1), next: () => go(current + 1),
    notes: () => toggleNotes(), overview: () => setMode(deck.dataset.mode === 'overview' ? 'slides' : 'overview'),
    presenter: openPresenter, fullscreen, theme: toggleTheme, contrast: toggleContrast, letters: toggleLetters,
  };
  deck.querySelectorAll<HTMLButtonElement>('[data-deck]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.deck!]!()));

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable]')) return;
    const onControl = Boolean(t.closest('button, a, summary, [role="button"]'));
    const overview = deck.dataset.mode === 'overview';
    if (!letters && /^[a-z]$/i.test(e.key)) return;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': go(current + 1); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': go(current - 1); break;
      case 'Home': go(0); break;
      case 'End': go(total - 1); break;
      case ' ': case 'Enter':
        if (overview && t.classList.contains('lk-deck-frame')) { setMode('slides'); break; }
        if (onControl || e.key === 'Enter') return;
        go(current + 1); break;
      case 'n': case 'N': toggleNotes(); break;
      case 'o': case 'O': actions.overview!(); break;
      case 'p': case 'P': openPresenter(); break;
      case 'f': case 'F': fullscreen(); break;
      case 'd': case 'D': toggleTheme(); break;
      case 'c': case 'C': toggleContrast(); break;
      case 'Escape':
        if (overview) setMode('slides');
        else if (!notes.hidden && !presenter) toggleNotes(false);
        else return;
        break;
      default: return;
    }
    if (overview && e.key !== 'Escape' && deck.dataset.mode === 'overview') frames[current]!.focus();
    e.preventDefault();
  });

  frames.forEach((f, i) => f.addEventListener('click', () => {
    if (deck.dataset.mode !== 'overview') return;
    go(i);
    setMode('slides');
  }));

  let startX: number | null = null;
  viewport.addEventListener('pointerdown', (e) => { startX = e.pointerType === 'touch' ? e.clientX : null; });
  viewport.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 60) go(current + (dx < 0 ? 1 : -1));
  });

  function fromHash(hash = location.hash): void {
    const h = decodeURIComponent(hash.slice(1));
    if (!h || h === 'presenter') return;
    if (/^\d+$/.test(h)) { go(Number(h) - 1); return; }
    const target = document.getElementById(h)?.closest('.lk-deck-frame');
    if (target) go(frames.indexOf(target as HTMLElement));
  }
  window.addEventListener('hashchange', () => fromHash());

  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data !== 'object') return;
    if (presenter ? e.source !== window.opener : e.source !== peer) return;
    if (typeof e.data.libkaDeck === 'number') go(e.data.libkaDeck, true);
    if (e.data.libkaDeckReady && peer) peer.postMessage({ libkaDeck: current }, '*');
  });

  /* ---- start ---- */
  const linked = location.hash;   // read before go() rewrites it
  const theme = store.get('theme');
  const contrast = store.get('contrast');
  if (theme === 'dark' || theme === 'light') root.dataset.theme = theme;
  if (contrast === 'high' || contrast === 'standard') root.dataset.contrast = contrast;
  if (presenter) {
    deck.dataset.presenter = 'true';
    next.hidden = false;
    timer.hidden = false;
    btn('presenter').hidden = true;
    const started = Date.now();
    const tick = () => {
      const s = Math.floor((Date.now() - started) / 1000);
      timer.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };
    tick();
    setInterval(tick, 1000);
    toggleNotes(true);
    peer?.postMessage({ libkaDeckReady: true }, '*');
  }
  syncToggles();
  setMode('slides');
  go(0, true);
  fromHash(linked);
  new ResizeObserver(fit).observe(viewport);
  (window as unknown as { libkaDeck: object }).libkaDeck = {
    go: (n: number) => go(n),
    /** Every slide visible at full size, one after another: used by Guard and handy for review. */
    showAll: () => setMode('all'),
    get current() { return current; },
    total,
  };
}
