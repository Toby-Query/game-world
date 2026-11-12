import { describe, expect, it } from 'vitest';
import { reconnectDelay, resolveServerUrl } from './serverUrl';

describe('resolveServerUrl', () => {
  const page = { hostname: 'localhost', protocol: 'http:' };

  it('uses the configured URL when there is one', () => {
    expect(resolveServerUrl(' wss://game.example.com ', page)).toBe('wss://game.example.com');
  });

  it('defaults to the page host on the default port', () => {
    expect(resolveServerUrl(undefined, page)).toBe('ws://localhost:2567');
    expect(resolveServerUrl('', { hostname: '192.168.1.5', protocol: 'http:' })).toBe(
      'ws://192.168.1.5:2567',
    );
  });

  it('uses wss on https pages', () => {
    expect(resolveServerUrl(undefined, { hostname: 'x.dev', protocol: 'https:' })).toBe(
      'wss://x.dev:2567',
    );
  });
});

describe('reconnectDelay', () => {
  it('backs off exponentially up to a cap', () => {
    expect([0, 1, 2, 3].map(reconnectDelay)).toEqual([1000, 2000, 4000, 8000]);
    expect(reconnectDelay(10)).toBe(15_000);
  });
});
