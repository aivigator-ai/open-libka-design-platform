/** The Studio's frame: the top bar, the library or the workspace, the status bar, dialogs and the hidden check frames. */
import { axeVersion, buildId, tokensVersion } from 'studio:assets';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { bridge } from '../app/project.ts';
import { Library } from './Library.tsx';
import { TopBar } from './TopBar.tsx';
import { Workspace } from './Workspace.tsx';
import { DialogHost, Toast } from './Dialogs.tsx';
import { Tour } from './Tour.tsx';

function StatusBar() {
  const text = s.source.value;
  const body = text.replace(/^---[\s\S]*?\n---\n/, '');
  const words = (body.match(/[\p{L}\p{N}]+/gu) ?? []).length;
  const editor = s.view.value === 'editor';
  return (
    <footer class="st-statusbar">
      {editor ? <>
        <span id="sb-position">{t('status.position', { line: s.cursor.value.line, col: s.cursor.value.col })}</span>
        <span id="sb-words">{t('status.words', { n: words })}</span>
        <span id="sb-read">{t('status.read', { n: Math.max(1, Math.round(words / 200)) })}</span>
        <span id="sb-blocks">{t('status.blocks', { n: s.doc.value?.blocks.length ?? 0 })}</span>
      </> : <span>{t('status.projects', { n: s.projects.value.length })}</span>}
      <span class="st-sb-spacer" />
      <span id="sb-tokens">{t('status.tokens', { v: tokensVersion })}</span>
      <span id="sb-axe">{`axe-core ${axeVersion}`}</span>
      <span id="sb-build">{t('status.build', { v: buildId })}</span>
    </footer>
  );
}

function UpdateBanner() {
  if (!s.updateReady.value) return null;
  return (
    <div class="st-update" role="status">
      <span>{t('update.ready')}</span>
      <button type="button" class="st-btn st-btn--primary" onClick={() => void navigator.serviceWorker?.getRegistration().then((r) => r?.waiting?.postMessage('activate'))}>{t('update.reload')}</button>
    </div>
  );
}

export function App() {
  const library = s.view.value === 'library';
  return (
    <>
      <a class="st-skip" href={library ? '#library' : '#editor'} onClick={(e) => {
        e.preventDefault();
        if (library) document.getElementById('library-title')?.focus(); else bridge.editor?.focus();
      }}>{t(library ? 'skip.library' : 'skip.editor')}</a>
      <TopBar />
      {library ? <Library /> : null}
      <div class="st-workspace" hidden={library}><Workspace /></div>
      <StatusBar />
      <UpdateBanner />
      <Toast />
      <div class="st-visually-hidden" aria-live="polite" id="announcer">{s.announcement.value}</div>
      <DialogHost />
      <Tour />
      {/* Guard, slide fitting and Word pictures render here, unseen: in the viewport (so the browser lays them out and paints them) but transparent and inert */}
      <div class="st-offstage" aria-hidden="true">
        <iframe id="guard-frame" title="Guard" tabIndex={-1} />
        <iframe id="fit-frame" title="Slide fitting" tabIndex={-1} />
        <iframe id="docx-frame" title="Word pictures" tabIndex={-1} />
      </div>
    </>
  );
}
