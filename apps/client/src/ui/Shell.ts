import { DEFAULT_APPEARANCE, GAME_TITLE, type Appearance } from '@the-world/shared';
import { saveAppearance } from '../game/character/characterStore';
import type { Game } from '../game/Game';
import {
  QUALITIES,
  SENSITIVITY_RANGE,
  controlsSeen,
  markControlsSeen,
  saveSettings,
  type Quality,
  type Settings,
} from '../settings/settings';
import type { AccountClient } from '../net/account';
import { CharacterCreator } from './CharacterCreator';
import type { Sound } from './sound';
import './ui.css';

export interface ShellOptions {
  game: Game;
  settings: Settings;
  sound: Sound;
  /** The saved character, or null for a new player. */
  saved: Appearance | null;
  /** Open the creator even for a returning player (?creator=1). */
  forceCreator: boolean;
  /** Called each time the player enters the world, with the character they play. */
  onEnterWorld?: (appearance: Appearance) => void;
  /** Accounts on the game server; null when playing offline. */
  account?: AccountClient | null;
}

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look (click the world to capture the mouse)'],
  ['Space', 'Jump'],
  ['Shift', 'Sprint'],
  ['E', 'Read, use, interact'],
  ['Wheel', 'Zoom the camera'],
  ['Esc', 'Pause menu and settings'],
];

/**
 * Everything around the game itself: title screen, character creator hand-off, first-launch
 * controls overlay, pause menu and settings. Screens are plain DOM over the live 3D scene.
 */
export class Shell {
  private readonly game: Game;
  private settings: Settings;
  private readonly sound: Sound;
  private screen: HTMLElement | null = null;
  private paused = false;
  private lockLostAt = 0;

  constructor(private readonly opts: ShellOptions) {
    this.game = opts.game;
    this.settings = opts.settings;
    this.sound = opts.sound;
    window.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  /** Shows the title screen over the Archive fly-by. */
  showTitle(): void {
    this.paused = false;
    this.game.setMenuOpen(false);
    this.game.setMode('title');
    document.body.classList.add('tw-in-menu');
    const root = this.open('tw-title', 'title-screen');
    const logo = el('h1', 'tw-logo');
    logo.textContent = GAME_TITLE;
    const tagline = el('p', 'tw-tagline');
    tagline.textContent = 'An endless ocean of myths. One museum keeping count.';
    const menu = el('div', 'tw-menu');
    menu.append(
      this.button('Play', 'title-play', () => this.play()),
      this.button(
        'Settings',
        'title-settings',
        () => this.showSettings(() => this.showTitle()),
        true,
      ),
    );
    root.append(logo, tagline, menu);
    if (this.opts.account) root.append(this.accountLine(this.opts.account));
  }

  /** "Signed in as …" or the guest prompt to sign in, under the title menu. */
  private accountLine(account: AccountClient): HTMLElement {
    const line = el('div', 'tw-account');
    line.dataset.testid = 'account-status';
    const text = el('span', '');
    const action = el('button', '');
    action.type = 'button';
    if (account.me) {
      text.textContent = `Signed in as ${account.me.email}`;
      action.textContent = 'Sign out';
      action.dataset.testid = 'title-signout';
      action.addEventListener('click', () => {
        void account.signOut().then(() => {
          this.opts.saved = null;
          this.showTitle();
        });
      });
    } else {
      text.textContent = 'Playing as a guest.';
      action.textContent = 'Sign in to save your progress';
      action.dataset.testid = 'title-signin';
      action.addEventListener('click', () => this.showSignIn(account));
    }
    line.append(text, action);
    return line;
  }

  /** Email in, sign-in link out. Locally there's no email: the link is shown here instead. */
  private showSignIn(account: AccountClient): void {
    const root = this.open('tw-card-screen', 'signin-panel');
    const card = el('div', 'tw-card');
    const title = el('h2', '');
    title.textContent = 'Sign in';
    const intro = el('p', '');
    intro.textContent = 'We send you a sign-in link. No password needed.';
    const email = document.createElement('input');
    email.type = 'email';
    email.name = 'email';
    email.placeholder = 'you@example.com';
    email.autocomplete = 'email';
    const status = el('p', '');
    const send = this.button('Send link', 'signin-send', () => {
      send.disabled = true;
      status.className = '';
      status.textContent = 'Sending…';
      account
        .startSignIn(email.value)
        .then((result) => {
          status.textContent = `Check ${email.value.trim()} for your sign-in link.`;
          if (result.devLink) {
            const note = el('p', '');
            note.textContent = 'This local server sends no email, so here is your link:';
            const link = el('a', '');
            link.href = result.devLink;
            link.textContent = 'Open the sign-in link';
            link.dataset.testid = 'dev-login-link';
            note.append(document.createElement('br'), link);
            status.after(note);
          }
        })
        .catch((error: unknown) => {
          send.disabled = false;
          status.className = 'tw-error';
          status.textContent = error instanceof Error ? error.message : 'Could not send the link';
        });
    });
    card.append(
      title,
      intro,
      email,
      status,
      send,
      this.button('Back', 'signin-back', () => this.showTitle(), true),
    );
    root.append(card);
    email.focus();
  }

  /** Drops straight into the world (used by ?autostart=1). */
  enterWorld(): void {
    this.close();
    document.body.classList.remove('tw-in-menu');
    this.paused = false;
    this.game.setMenuOpen(false);
    this.game.setMode('play');
    this.opts.onEnterWorld?.(this.opts.saved ?? DEFAULT_APPEARANCE);
  }

  private play(): void {
    if (this.opts.saved === null || this.opts.forceCreator) {
      this.startCreator();
    } else {
      this.afterCreator();
    }
  }

  private startCreator(): void {
    this.close();
    this.game.setMode('creator');
    const creator = new CharacterCreator({
      initial: this.opts.saved ?? DEFAULT_APPEARANCE,
      onChange: (appearance) => this.game.setAppearance(appearance),
      onDone: (appearance) => {
        this.sound.blip(1.2);
        saveAppearance(appearance);
        void this.opts.account?.saveCharacter(appearance).catch(() => undefined);
        this.opts.saved = appearance;
        this.opts.forceCreator = false;
        creator.close();
        this.afterCreator();
      },
    });
  }

  private afterCreator(): void {
    // Cut to the player first so the controls overlay sits over the world, not the fly-by.
    this.game.setMenuOpen(true);
    this.game.setMode('play');
    document.body.classList.remove('tw-in-menu');
    if (controlsSeen()) {
      this.enterWorld();
    } else {
      this.showControls(() => {
        markControlsSeen();
        this.enterWorld();
      });
    }
  }

  private showControls(done: () => void): void {
    this.game.setMenuOpen(true);
    const root = this.open('tw-card-screen', 'controls-overlay');
    const card = el('div', 'tw-card');
    const title = el('h2', '');
    title.textContent = 'Controls';
    const list = el('dl', 'tw-controls');
    for (const [key, action] of CONTROLS) {
      const dt = el('dt', '');
      dt.textContent = key;
      const dd = el('dd', '');
      dd.textContent = action;
      list.append(dt, dd);
    }
    card.append(title, list, this.button('Got it', 'controls-done', done));
    root.append(card);
  }

  private pause(): void {
    if (this.paused || this.game.currentMode !== 'play') return;
    this.paused = true;
    this.game.setMenuOpen(true);
    this.showPauseMenu();
  }

  private resume(): void {
    this.paused = false;
    this.close();
    this.game.setMenuOpen(false);
    // Clicking Resume is a user gesture, so the mouse can be captured again straight away.
    this.game.input.requestPointerLock();
  }

  private showPauseMenu(): void {
    const root = this.open('tw-card-screen', 'pause-menu');
    const card = el('div', 'tw-card');
    const title = el('h2', '');
    title.textContent = 'Paused';
    const menu = el('div', 'tw-menu');
    menu.append(
      this.button('Resume', 'pause-resume', () => this.resume()),
      this.button(
        'Settings',
        'pause-settings',
        () => this.showSettings(() => this.showPauseMenu()),
        true,
      ),
      this.button(
        'Controls',
        'pause-controls',
        () => this.showControls(() => this.showPauseMenu()),
        true,
      ),
      this.button('Quit to title', 'pause-quit', () => this.showTitle(), true),
    );
    card.append(title, menu);
    root.append(card);
  }

  private showSettings(back: () => void): void {
    const root = this.open('tw-card-screen', 'settings-panel');
    const card = el('div', 'tw-card');
    const title = el('h2', '');
    title.textContent = 'Settings';

    const change = (patch: Partial<Settings>): void => {
      this.settings = { ...this.settings, ...patch };
      saveSettings(this.settings);
      this.game.applySettings(this.settings);
      this.sound.volume = this.settings.volume;
    };

    const sensitivity = range('sensitivity', SENSITIVITY_RANGE.min, SENSITIVITY_RANGE.max, 0.05);
    sensitivity.value = String(this.settings.sensitivity);
    sensitivity.addEventListener('input', () => change({ sensitivity: Number(sensitivity.value) }));

    const invert = document.createElement('input');
    invert.type = 'checkbox';
    invert.name = 'invertY';
    invert.checked = this.settings.invertY;
    invert.addEventListener('change', () => change({ invertY: invert.checked }));

    const volume = range('volume', 0, 1, 0.05);
    volume.value = String(this.settings.volume);
    volume.addEventListener('input', () => change({ volume: Number(volume.value) }));
    volume.addEventListener('change', () => this.sound.blip());

    const quality = document.createElement('select');
    quality.name = 'quality';
    for (const q of QUALITIES) {
      const option = document.createElement('option');
      option.value = q;
      option.textContent = q.charAt(0).toUpperCase() + q.slice(1);
      quality.append(option);
    }
    quality.value = this.settings.quality;
    quality.addEventListener('change', () => change({ quality: quality.value as Quality }));

    card.append(
      title,
      field('Mouse sensitivity', sensitivity),
      field('Invert Y', invert),
      field('Volume', volume),
      field('Graphics', quality),
      this.button('Back', 'settings-back', back),
    );
    root.append(card);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape' || e.repeat || this.game.textInputActive) return;
    // Some browsers deliver Esc after it already released the mouse; that's handled below.
    if (performance.now() - this.lockLostAt < 300) return;
    if (this.game.currentMode !== 'play') return;
    if (this.paused) {
      this.resume();
    } else if (!this.game.hud.panelOpen) {
      this.pause();
    }
    // With a plaque open, the game closes it on Esc.
  };

  /** Losing the mouse while playing (Esc in pointer lock) opens the pause menu. */
  private readonly onPointerLockChange = (): void => {
    if (document.pointerLockElement) return;
    this.lockLostAt = performance.now();
    if (this.game.currentMode !== 'play' || this.paused || this.game.textInputActive) return;
    if (this.game.hud.panelOpen) {
      this.game.hud.closePanel();
    } else {
      this.pause();
    }
  };

  private open(className: string, testid: string): HTMLElement {
    this.close();
    const root = el('div', `tw-screen ${className}`);
    root.dataset.testid = testid;
    document.body.append(root);
    this.screen = root;
    return root;
  }

  private close(): void {
    this.screen?.remove();
    this.screen = null;
  }

  private button(
    label: string,
    testid: string,
    onClick: () => void,
    secondary = false,
  ): HTMLButtonElement {
    const b = el('button', secondary ? 'tw-button secondary' : 'tw-button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.testid = testid;
    b.addEventListener('click', () => {
      this.sound.blip(secondary ? 0.9 : 1.1);
      onClick();
    });
    return b;
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

function range(name: string, min: number, max: number, step: number): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'range';
  input.name = name;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  return input;
}

function field(label: string, control: HTMLElement): HTMLElement {
  const row = el('label', 'tw-field');
  const text = el('span', '');
  text.textContent = label;
  row.append(text, control);
  return row;
}
