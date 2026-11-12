import { expect, it } from 'vitest';
import { PRODUCT } from '../src/index.js';

it('cli resolves brain through the workspace', () => {
  expect(PRODUCT.command).toBe('luci');
});
