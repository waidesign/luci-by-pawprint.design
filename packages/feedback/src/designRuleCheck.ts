/**
 * Design-rule check for placed Team Feedback notes in Builder.
 *
 * Reuses Luci's existing design-check engine (`checkAgainst` / `checkComponent` / `readComponentFile` /
 * `sameValue` / `colorKey`) against both saved component captures (`*.component.*.design.md`) and
 * project baseline token files (`project.system.{typography,color,spacing}.design.md`) in `.luci/design/`.
 *
 * Classifies each placed note as:
 * - `supports-rule`: the built element differs from the design rule on a related property (likely a real bug)
 * - `conflicts-rule`: the built element already matches the design rule on that property (designer decides)
 * - `no-rule`: no matching design rule found
 */
import { checkAgainst, liveSnapshot, type LiveSnapshot } from '@luci-dev/capture';
import {
  BASELINE_FILES,
  colorKey,
  readComponentFile,
  sameValue,
  type ComponentSpec
} from '@luci-dev/format/capture';
import type { FeedbackBackend, SavedCapture } from './backend.js';
import { frameworkInfo } from './target.js';
import type { RuleAssessment } from './ui/builder.js';

export type NoteTopic = 'typography' | 'color' | 'spacing' | 'radius' | 'size';

export interface ParsedBaselineRules {
  typographyFile?: string;
  fontSizes: string[];
  fontFamilies: string[];
  colorFile?: string;
  colors: { key: string; label: string }[];
  spacingFile?: string;
  spacings: string[];
}

export interface LoadedDesignRules {
  components: { file: string; label: string; markdown: string; spec: ComponentSpec }[];
  baseline: ParsedBaselineRules;
}

const TOPIC_PATTERNS: readonly [NoteTopic, RegExp][] = [
  ['typography', /\b(font|text|type|typeface|size|small|smaller|tiny|big|bigger|large|larger|bold|weight|leading|line[- ]?height|letter[- ]?spacing)\b/i],
  ['color', /\b(colou?r|contrast|dark|darker|light|lighter|bright|faint|pale|background|bg|readable|readability)\b/i],
  ['spacing', /\b(spac(?:e|ing)|padding|margin|gap|tight|cramped|crowded|breathe|room|close)\b/i],
  ['radius', /\b(radius|corner|corners|round|rounded|rounder|sharp|sharper|square|pill)\b/i],
  ['size', /\b(height|width|tall|short|wide|narrow|tap target|target size)\b/i]
];

const TOPIC_PROPS: Readonly<Record<NoteTopic, readonly string[]>> = {
  typography: ['font-size', 'font-family', 'font-weight', 'line-height', 'letter-spacing'],
  color: ['color', 'background-color', 'border-color', 'text contrast'],
  spacing: ['padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'gap', 'row-gap', 'column-gap'],
  radius: ['border-radius'],
  size: ['width', 'height', 'min-height', 'min-width', 'target size']
};

/** Detect which visual topics a reviewer's plain-English note refers to. */
export function detectNoteTopics(noteText: string): NoteTopic[] {
  const found: NoteTopic[] = [];
  for (const [topic, rx] of TOPIC_PATTERNS) {
    if (rx.test(noteText)) found.push(topic);
  }
  return found;
}

function sectionBody(markdown: string, heading: string): string {
  const rx = new RegExp(`^##\\s+${heading}\\s*$`, 'im');
  const m = rx.exec(markdown);
  if (!m) return '';
  const start = m.index + m[0].length;
  const next = /\n##\s+/.exec(markdown.slice(start));
  return markdown.slice(start, next ? start + next.index : undefined).trim();
}

function tableRows(section: string): string[][] {
  const lines = section.split('\n').filter(l => l.trim().startsWith('|'));
  return lines.slice(2).map(l =>
    l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'))
  );
}

/** Parse Luci's baseline markdown files (typography, color, spacing) into checkable token sets. */
export function parseBaselineFiles(files: { file: string; markdown: string }[]): ParsedBaselineRules {
  const out: ParsedBaselineRules = { fontSizes: [], fontFamilies: [], colors: [], spacings: [] };
  const seenSizes = new Set<string>();
  const seenFamilies = new Set<string>();
  const seenColors = new Set<string>();
  const seenSpacings = new Set<string>();

  for (const { file, markdown } of files) {
    if (file === BASELINE_FILES.typography || /\.system\.(?:site-)?typography\.design\.md$/i.test(file)) {
      out.typographyFile ??= file;
      for (const row of tableRows(sectionBody(markdown, 'Families'))) {
        const fam = row[0]?.trim();
        if (fam && !seenFamilies.has(fam.toLowerCase())) {
          seenFamilies.add(fam.toLowerCase());
          out.fontFamilies.push(fam);
        }
      }
      for (const row of tableRows(sectionBody(markdown, 'Scale'))) {
        const sz = row[0]?.replace(/\s*\([^)]*\)$/, '').trim();
        if (sz && !seenSizes.has(sz.toLowerCase())) {
          seenSizes.add(sz.toLowerCase());
          out.fontSizes.push(sz);
        }
      }
      for (const row of tableRows(sectionBody(markdown, 'Roles'))) {
        const sz = row[2]?.replace(/\s*\([^)]*\)$/, '').trim();
        if (sz && !seenSizes.has(sz.toLowerCase())) {
          seenSizes.add(sz.toLowerCase());
          out.fontSizes.push(sz);
        }
      }
    } else if (file === BASELINE_FILES.color || /\.system\.(?:site-)?color\.design\.md$/i.test(file)) {
      out.colorFile ??= file;
      for (const sec of ['Roles', 'Tokens']) {
        for (const row of tableRows(sectionBody(markdown, sec))) {
          const val = (sec === 'Roles' ? row[1] : row[1])?.replace(/\s*\([^)]*\)$/, '').trim();
          if (!val) continue;
          const k = colorKey(val);
          if (k && !seenColors.has(k)) {
            seenColors.add(k);
            out.colors.push({ key: k, label: val });
          }
        }
      }
    } else if (file === BASELINE_FILES.spacing || /\.system\.(?:site-)?spacing\.design\.md$/i.test(file)) {
      out.spacingFile ??= file;
      for (const row of tableRows(sectionBody(markdown, 'Scale'))) {
        const val = row[0]?.replace(/\s*\([^)]*\)$/, '').trim();
        if (val && !seenSpacings.has(val.toLowerCase())) {
          seenSpacings.add(val.toLowerCase());
          out.spacings.push(val);
        }
      }
    }
  }
  return out;
}

/** Load component captures and baseline system files from the connected project (`.luci/design/`). */
export async function loadDesignRules(backend: FeedbackBackend): Promise<LoadedDesignRules> {
  if (!backend.listCaptures || !backend.readCapture) {
    return { components: [], baseline: { fontSizes: [], fontFamilies: [], colors: [], spacings: [] } };
  }
  let list: SavedCapture[];
  try {
    list = await backend.listCaptures();
  } catch {
    return { components: [], baseline: { fontSizes: [], fontFamilies: [], colors: [], spacings: [] } };
  }

  const componentFiles = list.filter(c => c.scope === 'component');
  const systemFiles = list.filter(c => c.scope === 'system' && /^(typography|color|spacing)$/i.test(c.type));

  const components: LoadedDesignRules['components'] = [];
  await Promise.all(componentFiles.map(async c => {
    try {
      const markdown = await backend.readCapture!(c.file);
      const parsed = readComponentFile(markdown);
      if (parsed.ok) {
        components.push({
          file: c.file,
          label: `${c.name} (${c.type})`,
          markdown,
          spec: parsed.value
        });
      }
    } catch { /* ignore unreadable capture */ }
  }));

  const rawSystems: { file: string; markdown: string }[] = [];
  await Promise.all(systemFiles.map(async c => {
    try {
      const markdown = await backend.readCapture!(c.file);
      rawSystems.push({ file: c.file, markdown });
    } catch { /* ignore unreadable file */ }
  }));

  return {
    components,
    baseline: parseBaselineFiles(rawSystems)
  };
}

function elementMatchesSpec(el: Element, spec: ComponentSpec): number {
  let score = 0;
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role')?.toLowerCase() ?? '';
  const type = spec.meta.type.toLowerCase();
  const name = spec.meta.name.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (spec.meta.selector) {
    try {
      if (el.matches(spec.meta.selector)) score += 40;
    } catch { /* ignore non-matching selector */ }
  }
  const comps = frameworkInfo(el)?.components ?? [];
  if (comps.some(c => {
    const norm = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    return norm === name || (name.length >= 4 && (norm.includes(name) || name.includes(norm)));
  })) {
    score += 35;
  }
  if (type === 'button' && (tag === 'button' || role === 'button' || (tag === 'a' && /btn|button/i.test(el.className || '')))) score += 20;
  else if (type === 'card' && (tag === 'article' || /card|plan/i.test(el.className || ''))) score += 20;
  else if ((type === 'field' || type === 'input') && (tag === 'input' || tag === 'textarea' || tag === 'select')) score += 20;
  else if (type === 'nav' && (tag === 'nav' || role === 'navigation')) score += 20;
  else if (type === 'badge' && /badge|pill|chip|tag/i.test(el.className || '')) score += 20;
  else if (type === tag) score += 15;

  return score;
}

const propMatchesTopics = (property: string, topics: readonly NoteTopic[]): boolean => {
  if (!topics.length) return true;
  const lower = property.toLowerCase();
  return topics.some(t => TOPIC_PROPS[t].some(p => lower === p || lower.startsWith(`${p}-`) || lower.includes(p)));
};

function checkAgainstBaseline(el: Element, win: Window, topics: readonly NoteTopic[], baseline: ParsedBaselineRules): RuleAssessment | null {
  if (!topics.length) return null;
  const cs = win.getComputedStyle(el);
  let conflict: RuleAssessment | null = null;

  for (const topic of topics) {
    if (topic === 'typography' && baseline.fontSizes.length) {
      const actualSize = cs.fontSize.trim();
      const matched = baseline.fontSizes.some(sz => sameValue('font-size', actualSize, sz));
      if (!matched) {
        return {
          status: 'supports-rule',
          label: 'Supports the rule',
          detail: `font-size is ${actualSize}, which is outside ${baseline.typographyFile ?? BASELINE_FILES.typography} (${baseline.fontSizes.slice(0, 5).join(', ')}).`,
          designFile: baseline.typographyFile
        };
      }
      conflict ??= {
        status: 'conflicts-rule',
        label: 'Conflicts with the rule',
        detail: `font-size is ${actualSize}, which already matches ${baseline.typographyFile ?? BASELINE_FILES.typography}.`,
        designFile: baseline.typographyFile
      };
    }

    if (topic === 'color' && baseline.colors.length) {
      const fgKey = colorKey(cs.color);
      const bgKey = colorKey(cs.backgroundColor);
      const hasBg = cs.backgroundColor && !/^rgba\(0,\s*0,\s*0,\s*0\)$/.test(cs.backgroundColor) && cs.backgroundColor !== 'transparent';
      const allowed = new Set(baseline.colors.map(c => c.key));
      if (fgKey && !allowed.has(fgKey)) {
        return {
          status: 'supports-rule',
          label: 'Supports the rule',
          detail: `color (${cs.color}) is not in ${baseline.colorFile ?? BASELINE_FILES.color}.`,
          designFile: baseline.colorFile
        };
      }
      if (hasBg && bgKey && !allowed.has(bgKey)) {
        return {
          status: 'supports-rule',
          label: 'Supports the rule',
          detail: `background-color (${cs.backgroundColor}) is not in ${baseline.colorFile ?? BASELINE_FILES.color}.`,
          designFile: baseline.colorFile
        };
      }
      if (fgKey && allowed.has(fgKey)) {
        conflict ??= {
          status: 'conflicts-rule',
          label: 'Conflicts with the rule',
          detail: `Element colors already match ${baseline.colorFile ?? BASELINE_FILES.color}.`,
          designFile: baseline.colorFile
        };
      }
    }

    if (topic === 'spacing' && baseline.spacings.length) {
      const vals = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft, cs.gap]
        .map(v => v?.trim() ?? '')
        .filter(v => v && v !== '0px' && v !== 'normal' && v !== 'auto');
      if (vals.length) {
        const off = vals.find(v => !baseline.spacings.some(s => sameValue('padding', v, s)));
        if (off) {
          return {
            status: 'supports-rule',
            label: 'Supports the rule',
            detail: `Spacing value ${off} is not on the scale in ${baseline.spacingFile ?? BASELINE_FILES.spacing} (${baseline.spacings.slice(0, 6).join(', ')}).`,
            designFile: baseline.spacingFile
          };
        }
        conflict ??= {
          status: 'conflicts-rule',
          label: 'Conflicts with the rule',
          detail: `Element spacing (${vals[0]}) already matches ${baseline.spacingFile ?? BASELINE_FILES.spacing}.`,
          designFile: baseline.spacingFile
        };
      }
    }
  }
  return conflict;
}

/**
 * Evaluate one placed review note against the project's saved design rules (component captures
 * first via existing `checkAgainst`/`checkComponent`, then project baseline tokens via `sameValue`/`colorKey`).
 */
export async function assessNoteAgainstDesignRules(
  doc: Document,
  el: Element,
  noteText: string,
  rules: LoadedDesignRules,
  live?: LiveSnapshot
): Promise<RuleAssessment> {
  const win = doc.defaultView ?? window;
  const topics = detectNoteTopics(noteText);

  // 1. Check against best matching component capture using existing checkAgainst / checkComponent
  if (rules.components.length) {
    const ranked = rules.components
      .map(c => ({ c, score: elementMatchesSpec(el, c.spec) }))
      .filter(x => x.score >= 20)
      .sort((a, b) => b.score - a.score);

    const best = ranked[0]?.c;
    if (best) {
      const snap = live ?? liveSnapshot(doc);
      const entry = snap.entryFor(el);
      if (entry) {
        const outcome = await checkAgainst(snap, entry, { label: best.label, file: best.file, markdown: best.markdown });
        if (outcome.ok) {
          const relevantDiffs = outcome.result.differences.filter(d => propMatchesTopics(d.property, topics));
          if (relevantDiffs.length) {
            const first = relevantDiffs[0]!;
            return {
              status: 'supports-rule',
              label: 'Supports the rule',
              detail: `${best.file}: ${first.property} is ${first.actual}; design says ${first.expected}.`,
              designFile: best.file
            };
          }
          if (topics.length) {
            const matchedProp = outcome.result.matches.find(m => {
              const prop = m.split(' ').slice(-1)[0] ?? m;
              return propMatchesTopics(prop, topics);
            });
            if (matchedProp) {
              return {
                status: 'conflicts-rule',
                label: 'Conflicts with the rule',
                detail: `${best.file}: ${matchedProp} already matches the design rule.`,
                designFile: best.file
              };
            }
          }
        }
      }
    }
  }

  // 2. Check against project baseline tokens (typography, color, spacing)
  const baselineResult = checkAgainstBaseline(el, win, topics, rules.baseline);
  if (baselineResult) return baselineResult;

  return {
    status: 'no-rule',
    label: 'No rule',
    detail: rules.components.length || rules.baseline.fontSizes.length || rules.baseline.colors.length || rules.baseline.spacings.length
      ? 'No design rule in .luci/design/ covers this note.'
      : 'No design files in .luci/design/ yet.'
  };
}
