# Build every primary button like its design file

- What happened: The person made the design capture of primary-button (button, from https://example.com/pricing, captured 2026-11-12) a rule with Luci.
- Proposed: Build every primary button like `.luci/design/example-com.component.primary-button.design.md` (read it first: parts, states, motion, accessibility): background-color #0f62fe (--color-primary), border-radius 8px (--radius-md), padding 12px 20px, gap 8px; label font-size 16px, font-weight 600, line-height 24px, color #ffffff; on hover background-color #0353e9; on focus-visible outline #0f62fe solid 2px, outline-offset 2px; on active background-color #002d9c; on disabled opacity 0.5, cursor not-allowed.
- Belongs in: rules.md
