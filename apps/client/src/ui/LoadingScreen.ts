/** Progress bar shown while the engine, renderer and world load. Lives in index.html. */
export class LoadingScreen {
  private readonly root = document.getElementById('loading');
  private readonly bar = document.getElementById('loading-bar');
  private readonly text = document.getElementById('loading-text');

  set(progress: number, message: string): void {
    if (this.bar) this.bar.style.width = `${Math.round(progress * 100)}%`;
    if (this.text) this.text.textContent = message;
    this.root?.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
  }

  hide(): void {
    this.root?.classList.add('done');
    setTimeout(() => this.root?.remove(), 600);
  }
}
