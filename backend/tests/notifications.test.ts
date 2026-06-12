import { publicKey } from '../src/utils/vapid';

describe('Notifications & VAPID Config', () => {
  it('should resolve and export VAPID public key', () => {
    expect(typeof publicKey).toBe('string');
    expect(publicKey.length).toBeGreaterThan(20);
  });

  it('should contain valid VAPID public key prefix format', () => {
    // VAPID keys are raw public keys encoded in base64 URL format (usually starting with B)
    expect(publicKey.charAt(0)).toBe('B');
  });
});
