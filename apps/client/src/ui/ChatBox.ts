import { CHAT, CHANNELS, type Channel, type ChatMessage } from '@the-world/shared';
import './ui.css';

export interface ChatBoxOptions {
  send(channel: Channel, text: string): void;
  /** Whether the player may open chat now (not in a menu). */
  canOpen(): boolean;
  /** Told when the text box opens or closes, so game keys and Esc behave. */
  onTyping(typing: boolean): void;
}

const LABEL: Record<Channel, string> = { nearby: 'Nearby', global: 'Global' };

/** Chat log and input, bottom left. Enter (or T) to talk, Tab to switch channel, Esc to cancel. */
export class ChatBox {
  private readonly root = document.createElement('div');
  private readonly log = document.createElement('ol');
  private readonly form = document.createElement('form');
  private readonly channelButton = document.createElement('button');
  private readonly input = document.createElement('input');
  private channel: Channel = 'nearby';

  constructor(private readonly opts: ChatBoxOptions) {
    this.root.className = 'tw-chat';
    this.root.dataset.testid = 'chat';
    this.log.className = 'tw-chat-log';
    this.log.dataset.testid = 'chat-log';
    this.channelButton.type = 'button';
    this.channelButton.className = 'tw-chat-channel';
    this.channelButton.addEventListener('click', () => this.toggleChannel());
    this.input.name = 'chat';
    this.input.maxLength = CHAT.maxLength;
    this.input.autocomplete = 'off';
    this.input.placeholder = 'Say something… (Tab: channel)';
    this.form.className = 'tw-chat-form';
    this.form.hidden = true;
    this.form.append(this.channelButton, this.input);
    this.root.append(this.log, this.form);
    document.body.append(this.root);
    this.renderChannel();

    window.addEventListener('keydown', this.onWindowKey);
    this.input.addEventListener('keydown', this.onInputKey);
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (text) this.opts.send(this.channel, text);
      this.close();
    });
  }

  get open(): boolean {
    return !this.form.hidden;
  }

  add(message: ChatMessage, mine: boolean): void {
    const item = document.createElement('li');
    item.dataset.channel = message.channel;
    const tag = document.createElement('span');
    tag.className = 'tw-chat-tag';
    tag.textContent = LABEL[message.channel];
    const name = document.createElement('strong');
    name.textContent = mine ? `${message.name} (you)` : message.name;
    const text = document.createElement('span');
    text.textContent = message.text;
    item.append(tag, name, document.createTextNode(': '), text);
    this.push(item);
  }

  notice(text: string): void {
    const item = document.createElement('li');
    item.className = 'tw-chat-notice';
    item.textContent = text;
    this.push(item);
  }

  private push(item: HTMLLIElement): void {
    this.log.append(item);
    while (this.log.children.length > CHAT.logSize) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  private openInput(): void {
    this.form.hidden = false;
    this.root.classList.add('typing');
    this.opts.onTyping(true);
    this.input.focus();
  }

  private close(): void {
    this.input.value = '';
    this.input.blur();
    this.form.hidden = true;
    this.root.classList.remove('typing');
    this.opts.onTyping(false);
  }

  private toggleChannel(): void {
    const i = CHANNELS.indexOf(this.channel);
    this.channel = CHANNELS[(i + 1) % CHANNELS.length]!;
    this.renderChannel();
    this.input.focus();
  }

  private renderChannel(): void {
    this.channelButton.textContent = LABEL[this.channel];
    this.channelButton.dataset.channel = this.channel;
    this.form.dataset.channel = this.channel;
  }

  private readonly onWindowKey = (e: KeyboardEvent): void => {
    if (this.open || e.repeat) return;
    if ((e.code === 'Enter' || e.code === 'KeyT') && this.opts.canOpen()) {
      e.preventDefault();
      this.openInput();
    }
  };

  private readonly onInputKey = (e: KeyboardEvent): void => {
    // Keep these keys to the chat box: Esc must not also open the pause menu.
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    } else if (e.code === 'Tab') {
      e.preventDefault();
      this.toggleChannel();
    }
  };
}
