/**
 * Checks that work for a document of another window too (v0.3.4: responsive capture reads the page
 * in a hidden frame). `instanceof CSSStyleRule` is false for a frame's rules, which are made by the
 * frame's own CSSStyleRule, and the global matchMedia answers for this window, not the frame's.
 */

type RuleKind = 'CSSStyleRule' | 'CSSMediaRule' | 'CSSSupportsRule';
const kind = (rule: CSSRule, name: RuleKind) => rule.constructor?.name === name;

export const isStyleRule = (rule: CSSRule): rule is CSSStyleRule => kind(rule, 'CSSStyleRule');
export const isMediaRule = (rule: CSSRule): rule is CSSMediaRule => kind(rule, 'CSSMediaRule');
export const isSupportsRule = (rule: CSSRule): rule is CSSSupportsRule => kind(rule, 'CSSSupportsRule');
/** A rule that holds other rules (@layer, @container, @scope...). */
export const hasRules = (rule: CSSRule): rule is CSSGroupingRule => 'cssRules' in rule && Boolean((rule as CSSGroupingRule).cssRules);

export const isDocument = (node: Node): node is Document => node.nodeType === 9;
export const isShadowRoot = (node: Node): node is ShadowRoot => node.nodeType === 11 && 'host' in node;

/** The window a document or shadow root lives in. */
export const windowOf = (root: Document | ShadowRoot): Window => (isDocument(root) ? root : root.ownerDocument).defaultView ?? window;
/** Does a media condition apply in this window (the frame's own width)? */
export const mediaMatches = (win: Window, condition: string) => win.matchMedia(condition).matches;
