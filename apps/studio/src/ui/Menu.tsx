/** A drop-down menu on a native details element: Escape closes it and returns focus, a click outside closes it. */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export interface MenuProps {
  id: string;
  className?: string;
  summary: ComponentChildren;
  summaryClass?: string;
  listClass?: string;
  label?: string;
  children: ComponentChildren;
}

export function Menu(p: MenuProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const outside = (e: MouseEvent) => { if (el.open && !el.contains(e.target as Node)) el.open = false; };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && el.open) { el.open = false; el.querySelector('summary')!.focus(); } };
    document.addEventListener('click', outside);
    el.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', outside); el.removeEventListener('keydown', key); };
  }, []);
  // a choice in the menu closes it
  const close = (e: MouseEvent) => { if ((e.target as HTMLElement).closest('button')) ref.current!.open = false; };
  return (
    <details class={`st-menu ${p.className ?? ''}`} id={p.id} ref={ref}>
      <summary class={p.summaryClass}>{p.summary}</summary>
      <div class={`st-menu-list ${p.listClass ?? ''}`} role="group" aria-label={p.label} onClick={close}>{p.children}</div>
    </details>
  );
}
