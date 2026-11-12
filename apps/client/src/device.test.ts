import { describe, expect, it } from 'vitest';
import { isDesktopDevice } from './device';

const chromeMac =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const iphone =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('isDesktopDevice', () => {
  it('accepts a desktop browser with a mouse', () => {
    expect(isDesktopDevice({ userAgent: chromeMac, maxTouchPoints: 0, coarsePointer: false })).toBe(
      true,
    );
  });

  it('accepts a touchscreen laptop whose primary pointer is a mouse', () => {
    expect(
      isDesktopDevice({ userAgent: chromeMac, maxTouchPoints: 10, coarsePointer: false }),
    ).toBe(true);
  });

  it('rejects phones', () => {
    expect(isDesktopDevice({ userAgent: iphone, maxTouchPoints: 5, coarsePointer: true })).toBe(
      false,
    );
  });

  it('rejects iPads that report a desktop user agent', () => {
    expect(isDesktopDevice({ userAgent: chromeMac, maxTouchPoints: 5, coarsePointer: true })).toBe(
      false,
    );
  });
});
