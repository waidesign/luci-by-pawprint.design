import { describe, expect, it } from 'vitest';
import { PRODUCT } from '@luci-dev/format';

describe('PRODUCT', () => {
  it('uses Luci names only', () => {
    expect(PRODUCT.name).toBe('Luci');
    expect(PRODUCT.command).toBe('luci');
    expect(PRODUCT.projectDir).toBe('.luci');
    expect(PRODUCT.homeEnv).toBe('LUCI_HOME');
    expect(JSON.stringify(PRODUCT).toLowerCase()).not.toMatch(/gaw|guided/);
  });
});
