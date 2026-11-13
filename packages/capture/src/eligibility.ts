/**
 * What can be picked (FR4). Images (img, picture, video, canvas and photo backgrounds) are picked
 * with the Image tool, which records how they are shown, never the image itself; the other tools
 * point to it. Inline SVG and components are allowed everywhere. The whole page body redirects to
 * the page-wide system outputs. Embedded pages stay blocked.
 */

export type Eligibility =
  | { status: 'allowed' }
  | { status: 'blocked'; reason: string }
  | { status: 'redirected'; reason: string };

export interface EligibilityInput {
  tag: string;
  /** Computed background-image. */
  backgroundImage?: string;
}

export interface EligibilityOptions {
  /** The Image tool is picking: images are allowed, everything else is not. */
  imageTool?: boolean;
}

const EMBEDDED: Readonly<Record<string, string>> = {
  iframe: 'Embedded pages cannot be captured from here.',
  embed: 'Embedded content cannot be captured.',
  object: 'Embedded content cannot be captured.'
};

/** Tags the Image tool takes (an inline svg as an illustration too). */
const IMAGE_TAGS = new Set(['img', 'picture', 'video', 'canvas', 'svg']);
/** Tags the other tools send to the Image tool. */
const IMAGE_ONLY: Readonly<Record<string, string>> = {
  img: 'This is an image.',
  picture: 'This is an image.',
  video: 'This is a video.',
  canvas: 'This is a canvas drawing.'
};
export const USE_IMAGE_TOOL = 'Use the Image tool for how it is shown (size, crop, corners, effects).';
export const NOT_AN_IMAGE = 'Not an image. Pick a photo, video, canvas, illustration or an element with a background image.';

/** A background made of an image file (url(...)), not only gradients. */
export function hasPhotoBackground(backgroundImage: string | undefined): boolean {
  return Boolean(backgroundImage && /url\(/i.test(backgroundImage));
}

/** Whether the Image tool can take this element. */
export const isImageLike = (el: EligibilityInput) => IMAGE_TAGS.has(el.tag.toLowerCase()) || hasPhotoBackground(el.backgroundImage);

export function eligibility(el: EligibilityInput, options: EligibilityOptions = {}): Eligibility {
  const tag = el.tag.toLowerCase();
  const embedded = EMBEDDED[tag];
  if (embedded) return { status: 'blocked', reason: embedded };
  if (options.imageTool) return isImageLike(el) ? { status: 'allowed' } : { status: 'blocked', reason: NOT_AN_IMAGE };
  if (tag === 'html' || tag === 'body') {
    return { status: 'redirected', reason: 'This is the whole page. Use "The whole system" to capture its typography, colors or spacing.' };
  }
  const image = IMAGE_ONLY[tag];
  if (image) return { status: 'blocked', reason: `${image} ${USE_IMAGE_TOOL}` };
  if (hasPhotoBackground(el.backgroundImage)) return { status: 'blocked', reason: `This element shows a background image. ${USE_IMAGE_TOOL}` };
  return { status: 'allowed' };
}
