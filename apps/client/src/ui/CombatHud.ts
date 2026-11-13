import * as THREE from 'three/webgpu';
import { COMBAT, type Vec3 } from '@the-world/shared';
import './ui.css';

interface Floater {
  el: HTMLDivElement;
  at: THREE.Vector3;
  life: number;
}

/** Health bar, floating damage numbers and the death screen. */
export class CombatHud {
  private readonly health = document.createElement('div');
  private readonly bar = document.createElement('div');
  private readonly healthText = document.createElement('span');
  private readonly death = document.createElement('div');
  private readonly deathText = document.createElement('p');
  private readonly floaters: Floater[] = [];
  private respawnAt = 0;
  private readonly v = new THREE.Vector3();

  constructor() {
    this.health.className = 'tw-health';
    this.health.dataset.testid = 'health';
    const track = document.createElement('div');
    track.className = 'tw-health-track';
    track.append(this.bar);
    this.health.append(track, this.healthText);
    this.death.className = 'tw-death';
    this.death.dataset.testid = 'death-screen';
    this.death.hidden = true;
    const title = document.createElement('h2');
    title.textContent = 'You fell';
    this.death.append(title, this.deathText);
    document.body.append(this.health, this.death);
    this.setHealth(COMBAT.maxHealth);
  }

  setHealth(hp: number): void {
    this.bar.style.width = `${(hp / COMBAT.maxHealth) * 100}%`;
    this.bar.dataset.low = String(hp <= COMBAT.maxHealth * 0.3);
    this.healthText.textContent = `${hp} / ${COMBAT.maxHealth}`;
  }

  showDeath(byName: string, respawnAt: number, serverNow: number): void {
    // Countdown in local time: how long the server will wait.
    this.respawnAt = performance.now() + (respawnAt - serverNow);
    this.death.hidden = false;
    this.deathText.dataset.by = byName;
  }

  hideDeath(): void {
    this.death.hidden = true;
  }

  /** A number that floats up from a point in the world. */
  damage(at: Vec3, amount: number, mine: boolean): void {
    const el = document.createElement('div');
    el.className = mine ? 'tw-damage mine' : 'tw-damage';
    el.textContent = `-${amount}`;
    document.body.append(el);
    this.floaters.push({ el, at: new THREE.Vector3(at.x, at.y + 2, at.z), life: 1 });
  }

  update(dt: number, camera: THREE.Camera, width: number, height: number): void {
    if (!this.death.hidden) {
      const seconds = Math.max(0, Math.ceil((this.respawnAt - performance.now()) / 1000));
      this.deathText.textContent = `Defeated by ${this.deathText.dataset.by ?? 'someone'}. Back at the Archive in ${seconds}s.`;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]!;
      f.life -= dt;
      f.at.y += dt * 0.8;
      this.v.copy(f.at).project(camera);
      const visible = f.life > 0 && this.v.z < 1;
      f.el.style.opacity = String(Math.max(0, Math.min(1, f.life * 2)));
      f.el.style.transform = `translate(${((this.v.x + 1) / 2) * width}px, ${((1 - this.v.y) / 2) * height}px)`;
      if (!visible) {
        f.el.remove();
        this.floaters.splice(i, 1);
      }
    }
  }
}
