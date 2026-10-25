#!/usr/bin/env python3
"""Build the self-contained, temporary-editing Builda sandbox preview."""
from pathlib import Path
import re
from tilemap import build_offline

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / 'builda-preview' / 'index.html'
build_offline(out)
html = out.read_text(encoding='utf-8')
# Restrict transformations to executable scripts, never the embedded asset data.
def adapt(match):
    js = match.group(1)
    if js.startswith('globalThis.__TILEMAP_OFFLINE__='):
        return match.group(0)
    js = re.sub(r'\bsessionStorage\b', 'globalThis.__previewSession', js)
    js = re.sub(r'\blocalStorage\b', 'globalThis.__previewLocal', js)
    # Match global dialogs only, never actions.confirm() or object methods.
    js = re.sub(r'(?<![\w$.])confirm\(', 'globalThis.__previewConfirm(', js)
    js = re.sub(r'(?<![\w$.])alert\(', 'globalThis.__previewNotice(', js)
    js = js.replace('location.reload()', 'globalThis.__previewReload()')
    return '<script>' + js + '</script>'
html = re.sub(r'<script>(.*?)</script>', adapt, html, flags=re.S)
adapter = '''<script>
(() => {
  const memory = (entries = []) => {
    const values = new Map(entries);
    return {getItem:k => values.get(String(k)) ?? null,
      setItem:(k,v) => values.set(String(k),String(v)),
      removeItem:k => values.delete(String(k)), clear:() => values.clear(),
      entries:() => [...values]};
  };
  // Carry state only across an editor-requested reload, without browser storage.
  // Reading consumes the handoff, so an ordinary refresh resets the demo.
  const carryPrefix = 'tilemap-preview-reload:';
  let carried = [];
  try {
    if (window.name.startsWith(carryPrefix)) {
      const entries = JSON.parse(window.name.slice(carryPrefix.length));
      if (Array.isArray(entries) && entries.every(e => Array.isArray(e) && e.length === 2 && e.every(v => typeof v === 'string'))) carried = entries;
      window.name = '';
    }
  } catch { window.name = ''; }
  globalThis.__previewSession = memory(carried);
  globalThis.__previewLocal = memory();
  globalThis.__previewReload = () => {
    window.name = carryPrefix + JSON.stringify(globalThis.__previewSession.entries());
    location.reload();
  };
  const note = document.createElement('div');
  note.id = 'builda-preview-note';
  note.hidden = true;
  note.setAttribute('role', 'status');
  note.setAttribute('aria-live', 'polite');
  note.setAttribute('popover', 'manual');
  Object.assign(note.style, {position:'fixed',top:'50%',left:'50%',
    transform:'translate(-50%, -50%)',width:'max-content',maxWidth:'calc(100vw - 48px)',padding:'18px 24px',
    background:'rgba(15,18,24,.92)',color:'#fff',borderRadius:'14px',fontSize:'14px',
    boxShadow:'0 12px 48px #0006',lineHeight:'1.6',margin:'0',border:'1px solid #ffffff18',
    zIndex:'10000',textAlign:'center',pointerEvents:'none'});
  document.body.append(note);
  let noticeTimer;
  globalThis.__previewNotice = message => {
    note.textContent = message;
    note.hidden = false;
    // A popover stays above the editor's modal settings dialogs as well.
    if (typeof note.showPopover === 'function') {
      if (note.matches(':popover-open')) note.hidePopover();
      note.showPopover();
    }
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      if (note.matches(':popover-open')) note.hidePopover();
      note.hidden = true;
    }, 4000);
  };
  // Temporary edits only: skip native discard dialogs in the sandbox.
  globalThis.__previewConfirm = () => true;
  const notice = () => globalThis.__previewNotice('在线预览不支持保存或导出，请下载完整项目后使用。');
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {
    if (this.hasAttribute('download')) { notice(); return; }
    return originalClick.call(this);
  };
  document.addEventListener('click', event => {
    const target = event.target.closest?.('[data-file-action="save"], a[download]');
    if (target) {event.preventDefault();event.stopImmediatePropagation();notice();}
  }, true);
  const mark = () => document.querySelectorAll('[data-file-action="save"]').forEach(b => {
    if (b.title !== '下载完整项目后保存') { b.title = '下载完整项目后保存'; b.setAttribute('aria-label', b.title); }
  });
  new MutationObserver(mark).observe(document.body, {childList:true,subtree:true});
})();
</script>'''
html = html.replace('<div id="press-ring"></div>', '<div id="press-ring"></div>' + adapter)
out.write_text(html, encoding='utf-8')
print('Builda preview ready:', out)
