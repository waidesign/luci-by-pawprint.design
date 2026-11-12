/**
 * What can be picked (FR4). Images cannot be captured: img, picture, video, canvas and photo
 * backgrounds are blocked with the reason. Inline SVG and components are allowed. The whole
 * page body redirects to the page-wide system outputs.
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

const BLOCKED: Readonly<Record<string, string>> = {
  img: 'Images cannot be captured.',
  picture: 'Images cannot be captured.',
  video: 'Video cannot be captured.',
  canvas: 'Canvas drawings cannot be captured.',
  iframe: 'Embedded pages cannot be captured from here.',
  embed: 'Embedded content cannot be captured.',
  object: 'Embedded content cannot be captured.'
};

/** A background made of an image file (url(...)), not only gradients. */
export function hasPhotoBackground(backgroundImage: string | undefined): boolean {
  return Boolean(backgroundImage && /url\(/i.test(backgroundImage));
}

export function eligibility(el: EligibilityInput): Eligibility {
  const tag = el.tag.toLowerCase();
  if (tag === 'html' || tag === 'body') {
    return { status: 'redirected', reason: 'This is the whole page. Use "The whole system" to capture its typography, colours or spacing.' };
  }
  const blocked = BLOCKED[tag];
  if (blocked) return { status: 'blocked', reason: blocked };
  if (hasPhotoBackground(el.backgroundImage)) return { status: 'blocked', reason: 'This element shows a background image, and images cannot be captured.' };
  return { status: 'allowed' };
}
