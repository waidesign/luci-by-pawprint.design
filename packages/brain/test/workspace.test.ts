import { expect, it } from 'vitest';
import { PRODUCT } from '@luci/brain';

it('brain resolves the format package through the workspace', () => {
  expect(PRODUCT.name).toBe('Luci');
});
