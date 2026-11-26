/**
 * Screenshot mode (v0.4): a color system estimated from an image, every value marked estimated.
 */
import { describe, expect, it } from 'vitest';
import { estimatePalette, formatCapture, guessRoles, imageColorSystem, imageFileName, parseCapture } from '../src/capture/index.js';

/** A fake screenshot: a white page, a near-black heading, a blue button, a light gray rule, a little anti-aliasing. */
function screenshot(): Uint8ClampedArray {
  const px: number[] = [];
  const add = (rgb: number[], n: number, alpha = 255) => { for (let i = 0; i < n; i++) px.push(rgb[0]!, rgb[1]!, rgb[2]!, alpha); };
  add([0, 0, 0], 50, 0); // transparent: never counted
  add([255, 255, 255], 7000);
  add([250, 250, 250], 400); // compression noise on white: the same color
  add([22, 22, 22], 1200);
  add([15, 98, 254], 900);
  add([224, 224, 224], 300);
  add([128, 140, 200], 10); // anti-aliasing at the button's edge: too little to count
  return new Uint8ClampedArray(px);
}

describe('estimating a palette', () => {
  const palette = estimatePalette(screenshot());

  it('merges near-copies, leaves out tiny areas and transparent pixels, largest first', () => {
    expect(palette.map(p => p.rgb)).toEqual([[255, 255, 255], [22, 22, 22], [15, 98, 254], [224, 224, 224]]);
    expect(palette[0]!.share).toBeCloseTo(7400 / 9810, 2);
  });

  it('guesses each color\'s role from how it sits against the background', () => {
    expect(guessRoles(palette).map(r => r.role)).toEqual(['background', 'text', 'accent', 'border']);
  });

  it('is empty for an empty or fully transparent image', () => {
    expect(estimatePalette(new Uint8ClampedArray([0, 0, 0, 0]))).toEqual([]);
    expect(imageColorSystem([], { file: 'x.png', captured: '2026-11-15' })).toBeNull();
  });
});

describe('the estimated file', () => {
  const sys = imageColorSystem(estimatePalette(screenshot()), { file: 'Checkout Screen.png', captured: '2026-11-15' })!;

  it('is a color system marked estimated, from the image\'s name only', () => {
    expect(sys.meta).toEqual({ name: 'image-checkout-screen', scope: 'system', type: 'color', source: 'file:///Checkout%20Screen.png', captured: '2026-11-15', method: 'estimated' });
    expect(imageFileName('Checkout Screen.png')).toBe('image-checkout-screen.system.color.design.md');
  });

  it('writes each color\'s share of the picture, and says what an image cannot give', () => {
    const md = formatCapture(sys);
    expect(md).toContain('method: estimated');
    expect(md).toContain('| Role | Value | Share |');
    expect(md).toContain('| background | #ffffff | 75% |');
    expect(md).toContain('| accent | #0f62fe |');
    expect(md).toContain('Text styles and spacing cannot be read from an image.');
    expect(parseCapture(md).ok).toBe(true);
  });
});
