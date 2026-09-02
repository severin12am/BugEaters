/**
 * Minimal DOM text prompt in the Mono look. `window.prompt` is blocked inside
 * the Telegram WebView, so any "paste a URL / address" step goes through this.
 */
export interface DomPromptOptions {
  title: string;
  hint?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  /** Return a message to block submission, or null when the value is fine. */
  validate?: (value: string) => string | null;
}

export function promptText(options: DomPromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.setAttribute('role', 'dialog');
    root.style.cssText =
      'position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,.78);padding:20px;font-family:Inter,system-ui,sans-serif;';

    const panel = document.createElement('div');
    panel.style.cssText =
      'width:100%;max-width:420px;background:#111;border:1px solid #2a2a2a;border-radius:12px;' +
      'padding:20px;color:#f2f2f2;box-shadow:0 12px 40px rgba(0,0,0,.6)';

    const title = document.createElement('div');
    title.textContent = options.title;
    title.style.cssText = 'font:600 16px Inter,system-ui,sans-serif;margin-bottom:6px';

    const hint = document.createElement('div');
    hint.textContent = options.hint ?? '';
    hint.style.cssText = 'font:12px Inter,system-ui,sans-serif;color:#9a9a9a;margin-bottom:14px;line-height:1.4';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = options.initialValue ?? '';
    input.placeholder = options.placeholder ?? '';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.cssText =
      'width:100%;padding:12px;border-radius:8px;border:1px solid #333;background:#080808;color:#fff;' +
      "font:14px 'Space Mono',monospace;outline:none;margin-bottom:8px";

    const error = document.createElement('div');
    error.style.cssText = 'min-height:16px;font:12px Inter,system-ui,sans-serif;color:#ff6666;margin-bottom:12px';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.style.cssText =
      'padding:10px 16px;border-radius:8px;border:1px solid #333;background:transparent;color:#ddd;font:600 13px Inter,system-ui,sans-serif';

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.textContent = options.confirmLabel ?? 'Save';
    confirm.style.cssText =
      'padding:10px 16px;border-radius:8px;border:1px solid #fff;background:#fff;color:#080808;font:600 13px Inter,system-ui,sans-serif';

    const close = (value: string | null): void => {
      root.remove();
      resolve(value);
    };
    cancel.onclick = () => close(null);
    confirm.onclick = () => {
      const value = input.value.trim();
      const problem = options.validate?.(value) ?? (value.length === 0 ? 'Enter a value' : null);
      if (problem) {
        error.textContent = problem;
        return;
      }
      close(value);
    };
    input.onkeydown = (event) => {
      if (event.key === 'Enter') {
        confirm.click();
      } else if (event.key === 'Escape') {
        cancel.click();
      }
    };
    root.onclick = (event) => {
      if (event.target === root) {
        close(null);
      }
    };

    row.append(cancel, confirm);
    panel.append(title, hint, input, error, row);
    root.append(panel);
    document.body.append(root);
    input.focus();
  });
}

/** Opens a URL the Telegram way when inside the Mini App, else a new tab. */
export function openExternalLink(url: string): void {
  const tg = window.Telegram?.WebApp;
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}
