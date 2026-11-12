/** How a player's character looks. Stored as JSON locally now and on the server later. */
export interface Appearance {
  name: string;
  /** 0.85 .. 1.15, overall height scale. */
  height: number;
  /** 0.8 .. 1.25, shoulder and limb thickness. */
  build: number;
  /** 0.9 .. 1.2, head size relative to body (stylized proportions). */
  headSize: number;
  skinColor: string;
  hairColor: string;
  outfitColor: string;
  accentColor: string;
}

export const DEFAULT_APPEARANCE: Appearance = {
  name: 'Salvager',
  height: 1,
  build: 1,
  headSize: 1.05,
  skinColor: '#8d5a3b',
  hairColor: '#1d1410',
  outfitColor: '#2f5d8a',
  accentColor: '#e7b54a',
};
