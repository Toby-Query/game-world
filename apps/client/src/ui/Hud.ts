import './ui.css';

/** On-screen prompt ("E  Read plaque") and the side panel used for plaques and similar text. */
export class Hud {
  private readonly prompt: HTMLDivElement;
  private readonly promptText: HTMLSpanElement;
  private readonly panel: HTMLDivElement;

  constructor(root: HTMLElement = document.body) {
    this.prompt = el('div', 'tw-prompt');
    const key = el('span', 'tw-key');
    key.textContent = 'E';
    this.promptText = el('span', '');
    this.prompt.append(key, this.promptText);

    this.panel = el('div', 'tw-panel');
    this.panel.setAttribute('role', 'dialog');
    this.panel.dataset.testid = 'plaque';
    root.append(this.prompt, this.panel);
  }

  showPrompt(text: string | null): void {
    this.promptText.textContent = text ?? '';
    this.prompt.classList.toggle('visible', text !== null && !this.panelOpen);
  }

  get panelOpen(): boolean {
    return this.panel.classList.contains('visible');
  }

  /** Opens the side panel. Text is set with textContent, never as HTML. */
  openPanel(content: { kicker: string; title: string; meta: string; body: string }): void {
    this.panel.replaceChildren();
    const kicker = el('div', 'tw-kicker');
    kicker.textContent = content.kicker;
    const title = el('h2', '');
    title.textContent = content.title;
    const meta = el('div', 'tw-meta');
    meta.textContent = content.meta;
    const body = el('p', '');
    body.textContent = content.body;
    const hint = el('div', 'tw-hint');
    hint.textContent = 'Press E or Esc to close';
    this.panel.append(kicker, title, meta, body, hint);
    this.panel.classList.add('visible');
    this.prompt.classList.remove('visible');
  }

  closePanel(): void {
    this.panel.classList.remove('visible');
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
