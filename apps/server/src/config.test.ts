import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_PORT } from '@the-world/shared';
import { resolvePort } from './config';

describe('resolvePort', () => {
  it('falls back to the default port', () => {
    expect(resolvePort(undefined)).toBe(DEFAULT_SERVER_PORT);
    expect(resolvePort('  ')).toBe(DEFAULT_SERVER_PORT);
  });

  it('parses a valid port', () => {
    expect(resolvePort('3000')).toBe(3000);
  });

  it('rejects invalid ports', () => {
    expect(() => resolvePort('abc')).toThrow();
    expect(() => resolvePort('0')).toThrow();
    expect(() => resolvePort('70000')).toThrow();
  });
});
