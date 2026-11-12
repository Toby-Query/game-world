/**
 * Tiny synthesised UI sounds (no audio files yet). Everything routes through one master gain,
 * which the volume setting controls; future game audio should connect to `master` too.
 */
export class Sound {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private level: number;

  constructor(volume: number) {
    this.level = volume;
  }

  set volume(v: number) {
    this.level = v;
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  get volume(): number {
    return this.level;
  }

  /** The master output node, created on first use (browsers need a user gesture first). */
  get master(): GainNode | null {
    if (!this.context) {
      const Ctor = window.AudioContext as typeof AudioContext | undefined;
      if (!Ctor) return null;
      this.context = new Ctor();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.level;
      this.masterGain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume();
    return this.masterGain;
  }

  /** Short soft blip for buttons; `pitch` > 1 is higher. */
  blip(pitch = 1, length = 0.08): void {
    const out = this.master;
    if (!out || !this.context || this.level <= 0) return;
    const t = this.context.currentTime;
    const osc = this.context.createOscillator();
    const env = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(880 * pitch, t + length);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }
}
