import {
  APPEARANCE_RANGES,
  BOTTOMS,
  HAIR_STYLES,
  NAME_MAX_LENGTH,
  SHOES,
  TOPS,
  sanitizeAppearance,
  type Appearance,
} from '@the-world/shared';
import './ui.css';

export interface CreatorOptions {
  initial: Appearance;
  /** Called on every change so the 3D character can update live. */
  onChange(appearance: Appearance): void;
  /** Called when the player confirms. */
  onDone(appearance: Appearance): void;
}

const SKIN_TONES = ['#f1c9a5', '#d9a07a', '#b97a56', '#8d5a3b', '#6b4029', '#3f2618'];

/** Full-height panel on the left of the screen; the live character stands on the right. */
export class CharacterCreator {
  private readonly root: HTMLDivElement;
  private value: Appearance;

  constructor(private readonly options: CreatorOptions) {
    this.value = sanitizeAppearance(options.initial);
    this.root = document.createElement('div');
    this.root.className = 'tw-creator';
    this.root.dataset.testid = 'character-creator';
    this.render();
    document.body.append(this.root);
    this.root.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
  }

  close(): void {
    this.root.remove();
  }

  private update(patch: Partial<Appearance>): void {
    this.value = sanitizeAppearance({ ...this.value, ...patch });
    this.options.onChange(this.value);
  }

  private render(): void {
    const r = this.root;
    r.replaceChildren();

    const title = document.createElement('h1');
    title.textContent = 'Create your salvager';
    const intro = document.createElement('p');
    intro.className = 'tw-creator-intro';
    intro.textContent = 'You woke up in the Archive with no memory. Decide who you are.';
    r.append(title, intro);

    // Name.
    const name = document.createElement('input');
    name.name = 'name';
    name.maxLength = NAME_MAX_LENGTH;
    name.value = this.value.name;
    name.autocomplete = 'off';
    name.addEventListener('input', () => this.update({ name: name.value }));
    r.append(field('Name', name));

    // Body sliders.
    const sliders: [keyof typeof APPEARANCE_RANGES, string][] = [
      ['height', 'Height'],
      ['build', 'Build'],
      ['headSize', 'Head size'],
    ];
    for (const [key, label] of sliders) {
      const input = document.createElement('input');
      input.type = 'range';
      input.name = key;
      input.min = String(APPEARANCE_RANGES[key].min);
      input.max = String(APPEARANCE_RANGES[key].max);
      input.step = '0.01';
      input.value = String(this.value[key]);
      input.addEventListener('input', () => this.update({ [key]: Number(input.value) }));
      r.append(field(label, input));
    }

    // Modular parts.
    r.append(this.cycler('Hair', 'hair', HAIR_STYLES));
    r.append(this.cycler('Top', 'top', TOPS));
    r.append(this.cycler('Bottom', 'bottom', BOTTOMS));
    r.append(this.cycler('Shoes', 'shoes', SHOES));

    // Skin tone swatches plus colour pickers.
    const swatches = document.createElement('div');
    swatches.className = 'tw-swatches';
    for (const tone of SKIN_TONES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tw-swatch';
      b.style.background = tone;
      b.ariaLabel = `Skin tone ${tone}`;
      b.addEventListener('click', () => {
        this.update({ skinColor: tone });
        skin.value = tone;
      });
      swatches.append(b);
    }
    const skin = colourInput('skinColor', this.value.skinColor, (c) =>
      this.update({ skinColor: c }),
    );
    swatches.append(skin);
    r.append(field('Skin', swatches));
    const colours: [keyof Appearance, string][] = [
      ['hairColor', 'Hair colour'],
      ['outfitColor', 'Outfit'],
      ['accentColor', 'Accent'],
    ];
    for (const [key, label] of colours) {
      r.append(
        field(
          label,
          colourInput(key, this.value[key] as string, (c) => this.update({ [key]: c })),
        ),
      );
    }

    // Actions.
    const actions = document.createElement('div');
    actions.className = 'tw-creator-actions';
    const random = document.createElement('button');
    random.type = 'button';
    random.className = 'tw-button secondary';
    random.textContent = 'Randomise';
    random.addEventListener('click', () => {
      this.value = randomAppearance(this.value.name);
      this.options.onChange(this.value);
      this.render();
    });
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'tw-button';
    done.textContent = 'Enter the Archive';
    done.addEventListener('click', () => this.options.onDone(this.value));
    actions.append(random, done);
    r.append(actions);
  }

  private cycler<K extends 'hair' | 'top' | 'bottom' | 'shoes'>(
    label: string,
    key: K,
    options: readonly Appearance[K][],
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'tw-cycler';
    const prev = document.createElement('button');
    const next = document.createElement('button');
    const value = document.createElement('span');
    prev.type = next.type = 'button';
    prev.textContent = '‹';
    next.textContent = '›';
    prev.ariaLabel = `Previous ${label.toLowerCase()}`;
    next.ariaLabel = `Next ${label.toLowerCase()}`;
    value.dataset.testid = `part-${key}`;
    const show = (): void => {
      value.textContent = capitalise(this.value[key]);
    };
    const step = (dir: number): void => {
      const i = options.indexOf(this.value[key]);
      const nextValue = options[(i + dir + options.length) % options.length]!;
      this.update({ [key]: nextValue } as Partial<Appearance>);
      show();
    };
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    show();
    wrap.append(prev, value, next);
    return field(label, wrap);
  }
}

function field(label: string, control: HTMLElement): HTMLElement {
  const row = document.createElement('label');
  row.className = 'tw-field';
  const text = document.createElement('span');
  text.textContent = label;
  row.append(text, control);
  return row;
}

function colourInput(name: string, value: string, onInput: (c: string) => void): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'color';
  input.name = name;
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pickOne<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randomColour(): string {
  return `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`;
}

function randomAppearance(name: string): Appearance {
  const r = (key: keyof typeof APPEARANCE_RANGES): number => {
    const { min, max } = APPEARANCE_RANGES[key];
    return Math.round((min + Math.random() * (max - min)) * 100) / 100;
  };
  return sanitizeAppearance({
    name,
    height: r('height'),
    build: r('build'),
    headSize: r('headSize'),
    hair: pickOne(HAIR_STYLES),
    top: pickOne(TOPS),
    bottom: pickOne(BOTTOMS),
    shoes: pickOne(SHOES),
    skinColor: pickOne(SKIN_TONES),
    hairColor: randomColour(),
    outfitColor: randomColour(),
    accentColor: randomColour(),
  });
}
