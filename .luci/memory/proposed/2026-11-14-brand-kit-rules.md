# Luci UI follows the brand kit

- What happened: the user handed over the Luci brand kit (now `brand/`, read-only); its guide asks to save the key rules into project memory so every session applies them.
- Proposed:
  - Every Luci interface follows `brand/BRAND.md`, `brand/DESIGN.md` and `brand/CLAUDE-CODE-GUIDE.md`. Never edit `brand/`; run `pnpm brand:sync` to regenerate `packages/ui` tokens and art.
  - Colours, sizes and motion come only from `@luci/ui` tokens (`var(--luci-*)`); no hex values outside `packages/ui/src/tokens.ts` and the generated art.
  - No coloured or Charcoal strokes on components (only `stroke-subtle`, `stroke-strong` on input hover, and the focus ring); no shadow plus border on one element.
  - Copy: short, factual, no exclamation marks, emoji, "oops", "yay" or "buddy". Mascot pose per BRAND.md section 5, one per screen.
  - Never invent icons, colours, poses or patterns: describe what is missing and ask.
- Belongs in: rules.md
