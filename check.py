#!/usr/bin/env python3
"""LibKa check: one command that tells you whether the workspace is healthy.

Stages
  1. Build chain   unit tests (tests/), the TypeScript type check and tests, then generate.py and
                   any extra build steps check.extra.json lists. Stops at the first failure.
  2. Generated     Did the build change any files?
                   - clean tree before the build: any change means committed
                     generated files were stale -> FAIL
                   - uncommitted work in progress: lists the files the build
                     regenerated so you commit them with your change
                   - --ci: any change -> FAIL
  3. Browser       Opens the self-check page check.extra.json names (if any) in headless Chrome
                   or Edge, once with standard and once with forced colors (Windows
                   high contrast): every contrast check must pass and the visible
                   page must keep its theme (measurement happens in a hidden frame).
                   Without such a page the stage is skipped: the TypeScript tests check
                   every page in Chrome.

Usage
  .venv\\Scripts\\python.exe check.py              (Windows)
  .venv/bin/python check.py                        (macOS / Linux)
  options: --ci  strict mode for automation (stale files fail, browser required)
           --no-browser  skip stage 3
  Browser lookup: LIBKA_BROWSER env var, then standard Chrome / Edge / Chromium paths.

Exit code 0 = healthy, 1 = something failed.
"""
import argparse, hashlib, html, json, os, pathlib, re, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent
# check.extra.json (optional): more build steps after generate.py, and a browser self-check page.
EXTRA = json.loads((ROOT / 'check.extra.json').read_text(encoding='utf-8')) if (ROOT / 'check.extra.json').exists() else {}
BUILD_CHAIN = ['generate.py', *EXTRA.get('build', [])]
SELF_CHECK = ROOT / EXTRA['selfCheck'] if EXTRA.get('selfCheck') else None

try:
    sys.stdout.reconfigure(encoding='utf-8')
except (AttributeError, ValueError):
    pass
OK, BAD, SKIP = '✓', '✗', '–'


def say(mark, text):
    print(f'  {mark} {text}')


# ---- stage 1: build chain -------------------------------------------------
def run_unit_tests():
    proc = subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests'], cwd=ROOT,
                          capture_output=True, text=True, encoding='utf-8', errors='replace')
    out = (proc.stdout + proc.stderr).strip().splitlines()
    ran = next((l for l in out if l.startswith('Ran ')), 'no tests ran')
    if proc.returncode != 0:
        say(BAD, f'unit tests failed ({ran}):')
        for line in out[-30:]:
            print(f'      {line}')
        return False
    say(OK, f'unit tests: {ran.lower()}, all passed')
    return True


def run_typescript():
    """Type check and test the TypeScript workspace when it is installed (CI runs it separately)."""
    if not (ROOT / 'package.json').is_file():
        return True
    if not (ROOT / 'node_modules').is_dir():
        say(SKIP, 'TypeScript workspace not installed; run `npx pnpm install` once to include it '
                  '(CI checks it in its own job)')
        return True
    npx = shutil.which('npx')
    if not npx:
        say(SKIP, 'TypeScript workspace skipped: Node.js (npx) not found')
        return True
    import json
    pm = json.loads((ROOT / 'package.json').read_text(encoding='utf-8')).get('packageManager', 'pnpm')
    # every PDF a test builds must pass veraPDF's PDF/UA-1 check (docs/admin/verapdf.md)
    env = {**os.environ, 'LIBKA_REQUIRE_VERAPDF': '1'}
    for task in ('typecheck', 'test'):
        proc = subprocess.run([npx, '--yes', pm, task], cwd=ROOT, capture_output=True, text=True,
                              encoding='utf-8', errors='replace', env=env)
        out = (proc.stdout + proc.stderr).strip().splitlines()
        if proc.returncode != 0:
            say(BAD, f'TypeScript {task} failed:')
            for line in out[-25:]:
                print(f'      {line}')
            return False
        summary = next((l.strip() for l in out if l.strip().startswith('Tests ')), '')
        say(OK, f'TypeScript {task}: passed' + (f' ({" ".join(summary.split())})' if summary else ''))
    return True


def run_build_chain():
    if not run_unit_tests():
        return False
    if not run_typescript():
        return False
    for script in BUILD_CHAIN:
        proc = subprocess.run([sys.executable, str(ROOT / script)], cwd=ROOT,
                              capture_output=True, text=True, encoding='utf-8', errors='replace')
        out = (proc.stdout + proc.stderr).strip().splitlines()
        if proc.returncode != 0:
            say(BAD, f'{script} failed (exit {proc.returncode}):')
            for line in out:
                print(f'      {line}')
            return False
        passed = [l for l in out if 'PASSED' in l]
        say(OK, f'{script}: ' + ('; '.join(passed) if passed else 'ok'))
    return True


# ---- stage 2: generated files ---------------------------------------------
def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True,
                          encoding='utf-8', errors='replace')


def dirty_files():
    """{path: content hash} for every modified or untracked file git reports."""
    proc = git('status', '--porcelain=v1', '-z', '--untracked-files=all')
    if proc.returncode != 0:
        return None
    entries, files = proc.stdout.split('\0'), {}
    i = 0
    while i < len(entries):
        entry = entries[i]
        if len(entry) > 3:
            path = entry[3:]
            if entry[0] in 'RC':          # rename/copy: next field is the source path
                i += 1
            p = ROOT / path
            files[path] = hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
        i += 1
    return files


def report_drift(before, after, ci):
    changed = sorted(p for p in after if before.get(p, 'absent') != after[p])
    if not changed:
        say(OK, 'the build changed no files: generated files match their sources')
        return True
    if not before or ci:
        reason = ('the committed generated files were stale' if not before
                  else '--ci treats any file the build changes as a failure')
        say(BAD, f'the build changed {len(changed)} file(s); {reason}:')
        for p in changed:
            print(f'      {p}')
        print('      Review with `git diff`, then commit them.')
        return False
    say(OK, f'the build regenerated {len(changed)} file(s) from your uncommitted changes; '
            'commit them together:')
    for p in changed:
        print(f'      {p}')
    return True


# ---- stage 3: browser self-check ------------------------------------------
def find_browser():
    env = os.environ.get('LIBKA_BROWSER')
    if env:
        return env if pathlib.Path(env).is_file() else None
    candidates = []
    for base in (os.environ.get('PROGRAMFILES'), os.environ.get('PROGRAMFILES(X86)'),
                 os.environ.get('LOCALAPPDATA')):
        if base:
            candidates += [pathlib.Path(base, 'Google/Chrome/Application/chrome.exe'),
                           pathlib.Path(base, 'Microsoft/Edge/Application/msedge.exe')]
    candidates += [pathlib.Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
                   pathlib.Path('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')]
    for c in candidates:
        if c.is_file():
            return str(c)
    for name in ('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
                 'chrome', 'microsoft-edge', 'msedge'):
        found = shutil.which(name)
        if found:
            return found
    return None


def text_of(fragment):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', fragment))).strip()


# Each mode loads the page once; forced colors (Windows high contrast) must not break measuring.
BROWSER_MODES = [('standard colors', []), ('forced colors', ['--force-high-contrast'])]


def run_browser_check(browser, artifacts=None, mode='standard colors', extra_flags=()):
    profile = tempfile.mkdtemp(prefix='libka-check-')
    flags = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
             f'--user-data-dir={profile}', '--virtual-time-budget=8000']
    # Linux CI runners may block Chrome's sandbox (user namespaces); the page is our own file.
    if os.environ.get('CI') and sys.platform.startswith('linux'):
        flags.append('--no-sandbox')
    flags += list(extra_flags)
    try:
        proc = subprocess.run([browser, *flags, '--dump-dom', SELF_CHECK.as_uri()],
                              capture_output=True, timeout=90)
    except subprocess.TimeoutExpired:
        say(BAD, f'{mode}: the browser did not finish within 90 s')
        return False
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    dom = proc.stdout.decode('utf-8', errors='replace')
    if artifacts:
        artifacts.mkdir(parents=True, exist_ok=True)
        slug = mode.replace(' ', '-')
        (artifacts / f'self-check-dom-{slug}.html').write_text(dom, encoding='utf-8')
        (artifacts / f'browser-stderr-{slug}.txt').write_bytes(proc.stderr)
    # results only: drop comments first (they may mention "<script>"), then page code
    body = re.sub(r'<!--.*?-->', '', dom, flags=re.S)
    body = re.sub(r'<script\b.*?</script>', '', body, flags=re.S)
    summary = re.search(r'id="summary">(.*?)</div>\s*<h2', body, re.S)
    numbers = [int(n) for n in re.findall(r'class="n[^"]*">(\d+)</div>', summary.group(1))] if summary else []
    if len(numbers) < 3:
        say(BAD, f'{mode}: the self-check page produced no results (did its scripts run?)')
        return False
    total, passed, failed = numbers[:3]
    ok = True
    if failed:
        say(BAD, f'{mode}: {failed} of {total} contrast checks failed:')
        for section in ('contrast-light', 'contrast-dark'):
            block = re.search(r'id="%s">(.*?)</p>' % section, body, re.S)
            for row in re.findall(r'<tr>(.*?)</tr>', block.group(1), re.S) if block else []:
                if 'p-fail' in row:
                    print(f'      {section.split("-")[1]}: {text_of(row)}')
        missing = re.search(r'id="resolve-result">(.*?)</div>', body, re.S)
        if missing and 'p-fail' in missing.group(1):
            print(f'      unresolved tokens: {text_of(missing.group(1))}')
        # raw values the page measured (from the swatches), to tell a real contrast
        # failure from a measurement problem such as unloaded styles
        samples = re.findall(r'class="sw" style="background:\s*([^";]*);?"></span>([\w-]+)', body)
        if samples:
            print('      measured values: ' + ', '.join(f'{n}={v or "(empty)"}' for v, n in samples[:6]))
        ok = False
    else:
        say(OK, f'{mode}: {passed} of {total} contrast and token checks pass (light, dark, high contrast)')
    root = re.search(r'<html\b[^>]*>', dom)
    if root and 'data-theme=' in root.group(0):
        say(BAD, f'{mode}: the visible page changed theme during measurement (it must stay untouched)')
        ok = False
    elif root:
        say(OK, f'{mode}: the visible page kept its theme while measuring')
    return ok


# ---- main ------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description='Check that the LibKa workspace is healthy.')
    ap.add_argument('--ci', action='store_true', help='strict mode: stale files fail, browser required')
    ap.add_argument('--no-browser', action='store_true', help='skip the headless browser self-check')
    ap.add_argument('--artifacts', type=pathlib.Path, metavar='DIR',
                    help='save the browser result (page DOM, browser stderr) to DIR for diagnosis')
    args = ap.parse_args()

    results = []
    print('LibKa check\n')

    print('[1/3] Build chain')
    before = dirty_files()
    built = run_build_chain()
    results.append(('Build chain', built))

    print('\n[2/3] Generated files')
    if not built:
        say(SKIP, 'skipped: the build failed')
        results.append(('Generated files', None))
    elif before is None:
        say(SKIP, 'skipped: not a git repository or git is not installed')
        results.append(('Generated files', False if args.ci else None))
    else:
        results.append(('Generated files', report_drift(before, dirty_files(), args.ci)))

    print('\n[3/3] Browser self-check')
    if args.no_browser:
        say(SKIP, 'skipped (--no-browser)')
        results.append(('Browser self-check', None))
    elif SELF_CHECK is None:
        say(SKIP, 'skipped: no self-check page configured; the TypeScript tests check every page in Chrome')
        results.append(('Browser self-check', None))
    elif not built:
        say(SKIP, 'skipped: the build failed')
        results.append(('Browser self-check', None))
    else:
        browser = find_browser()
        if not browser:
            say(BAD if args.ci else SKIP,
                'no Chrome, Edge or Chromium found; set LIBKA_BROWSER to its executable')
            results.append(('Browser self-check', False if args.ci else None))
        else:
            results.append(('Browser self-check', all(
                [run_browser_check(browser, args.artifacts, mode, flags) for mode, flags in BROWSER_MODES])))

    print('\nSummary')
    for name, ok in results:
        mark = OK if ok else (SKIP if ok is None else BAD)
        state = 'pass' if ok else ('skipped' if ok is None else 'FAIL')
        print(f'  {mark} {name}: {state}')
    healthy = all(ok is not False for _, ok in results)
    print('\n' + ('HEALTHY: everything passed.' if healthy else 'NOT HEALTHY: fix the failures above.'))
    return 0 if healthy else 1


if __name__ == '__main__':
    sys.exit(main())
