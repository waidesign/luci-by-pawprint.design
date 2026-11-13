/**
 * Reference screenshots (FR22): a cropped picture of the picked element, saved beside its file for
 * looking at only (the values in the file come from the page, not from the picture). The shell
 * takes a screenshot of the visible page with Luci hidden; this crops it to the element.
 */
import { dataUrlBytes, dataUrlType } from './zip.js';

export interface ReferenceShot {
  /** Full resolution PNG, for the download beside the design.md. */
  png: string;
  /** A small JPEG (at most 640px a side) for the basket, which lives in limited extension storage. */
  thumb: { dataUrl: string; width: number; height: number };
  width: number;
  height: number;
  /** True when only part of the element was in view (it is bigger than the window). */
  partial: boolean;
}

export const THUMB_SIZE = 640;

/** A rectangle in viewport CSS px. */
export interface Box { left: number; top: number; width: number; height: number }

/** Where a box and the viewport meet, or null when the box is out of view. */
export function visiblePart(box: Box, viewport: { width: number; height: number }): Box | null {
  const left = Math.max(0, box.left);
  const top = Math.max(0, box.top);
  const right = Math.min(viewport.width, box.left + box.width);
  const bottom = Math.min(viewport.height, box.top + box.height);
  return right - left >= 1 && bottom - top >= 1 ? { left, top, width: right - left, height: bottom - top } : null;
}

/**
 * Crop a screenshot of the viewport to a box. Decoded from its bytes, not through an <img>, which
 * a page's Content Security Policy can block. The screenshot's scale (device pixels per CSS px) is
 * its width over the viewport's.
 */
export async function cropScreenshot(doc: Document, screenshot: string, box: Box, viewport: { width: number; height: number }): Promise<ReferenceShot> {
  const part = visiblePart(box, viewport);
  if (!part) throw new Error('the element is not in view');
  const bitmap = await createImageBitmap(new Blob([dataUrlBytes(screenshot) as BlobPart], { type: dataUrlType(screenshot) }));
  try {
    const scale = bitmap.width / viewport.width;
    const sx = Math.round(part.left * scale);
    const sy = Math.round(part.top * scale);
    const width = Math.max(1, Math.min(bitmap.width - sx, Math.round(part.width * scale)));
    const height = Math.max(1, Math.min(bitmap.height - sy, Math.round(part.height * scale)));
    const draw = (w: number, h: number, type: 'image/png' | 'image/jpeg') => {
      const canvas = doc.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, sx, sy, width, height, 0, 0, w, h);
      return canvas.toDataURL(type, 0.85);
    };
    const fit = Math.min(1, THUMB_SIZE / Math.max(width, height));
    const tw = Math.max(1, Math.round(width * fit));
    const th = Math.max(1, Math.round(height * fit));
    return {
      png: draw(width, height, 'image/png'),
      thumb: { dataUrl: draw(tw, th, 'image/jpeg'), width: tw, height: th },
      width,
      height,
      partial: part.width < box.width - 1 || part.height < box.height - 1
    };
  } finally {
    bitmap.close();
  }
}

/** The reference file's name beside a capture file: "x.token.image-img-16-9.design.md" -> "x.token.image-img-16-9.png". */
export const referenceFileName = (captureFileName: string, ext: 'png' | 'jpg' = 'png') => captureFileName.replace(/\.design\.md$/, '') + `.${ext}`;
