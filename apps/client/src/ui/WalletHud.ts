import type { Me } from '@the-world/shared';
import './ui.css';

/** Coins and bag space, bottom right, while signed in. */
export class WalletHud {
  private readonly root = document.createElement('div');
  private readonly coins = document.createElement('span');
  private readonly bag = document.createElement('span');

  constructor() {
    this.root.className = 'tw-wallet';
    this.coins.dataset.testid = 'wallet-balance';
    this.bag.dataset.testid = 'wallet-bag';
    this.root.append(this.coins, this.bag);
    document.body.append(this.root);
    this.show(null);
  }

  show(me: Me | null): void {
    this.root.hidden = me === null;
    if (!me) return;
    this.coins.textContent = `◈ ${me.balance.toLocaleString()}`;
    this.bag.textContent = `Bag ${me.inventory.length}/${me.slots}`;
  }
}
