/**
 * What can be picked (FR4). A picture on its own is not picked: img, picture, video, canvas and an
 * SVG <image> point to the component around it, whose file describes how the picture is shown
 * (its Images section). An element with a background photo is picked like any other. Inline SVG and
 * components are allowed. The whole page body redirects to the page-wide system outputs.
 */

export type Eligibility =
  | { status: 'allowed' }
  | { status: 'blocked'; reason: string }
  | { status: 'redirected'; reason: string };

export interface EligibilityInput {
  tag: string;
}

/** What a bare picture says: pick the component around it. */
export const PICK_AROUND = 'Pick the component around it (↑ Wider): its file describes how the image is shown.';

const BLOCKED: Readonly<Record<string, string>> = {
  img: `This is an image. ${PICK_AROUND}`,
  picture: `This is an image. ${PICK_AROUND}`,
  image: `This is an image. ${PICK_AROUND}`,
  video: `This is a video. ${PICK_AROUND}`,
  canvas: `This is a canvas drawing. ${PICK_AROUND}`,
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
    return { status: 'redirected', reason: 'This is the whole page. Use "The whole system" to capture its typography, colors or spacing.' };
  }
  const blocked = BLOCKED[tag];
  if (blocked) return { status: 'blocked', reason: blocked };
  return { status: 'allowed' };
}
