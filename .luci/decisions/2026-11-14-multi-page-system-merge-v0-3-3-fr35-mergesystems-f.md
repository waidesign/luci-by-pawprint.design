# Multi-page system merge (v0.3.3, FR35): mergeSystems (format, pure) merges one system type from two or more pages of a site into a site-level system (name site-<type>, file <site>.system.site-<type>.design.md, source the site root, frontmatter pages). Rows are unified by what they are, not by page-given names: text styles by look, color roles by role and colorKey, spacing by px; uses summed, tokens kept only when every page agrees, families by first font; each row has pages (a Pages column) and a Conflicts section lists text roles and tokens with different values on different pages. The basket offers "Merge into site systems", which adds (or replaces) one site item per type and keeps the page systems. findBaseUnit moved from @luci/capture to @luci/format unchanged (capture re-exports it).

- Date: 2026-11-14
- Status: accepted
- Area: architecture

## What
Multi-page system merge (v0.3.3, FR35): mergeSystems (format, pure) merges one system type from two or more pages of a site into a site-level system (name site-<type>, file <site>.system.site-<type>.design.md, source the site root, frontmatter pages). Rows are unified by what they are, not by page-given names: text styles by look, color roles by role and colorKey, spacing by px; uses summed, tokens kept only when every page agrees, families by first font; each row has pages (a Pages column) and a Conflicts section lists text roles and tokens with different values on different pages. The basket offers "Merge into site systems", which adds (or replaces) one site item per type and keeps the page systems. findBaseUnit moved from @luci/capture to @luci/format unchanged (capture re-exports it).

## Why
Role names are given per page from its headings and sizes, so unifying by name would mix different styles; unifying by look and reporting same-name differences as conflicts tells the person what to decide. A distinct file name keeps a site file from replacing a page file in .luci/design/. The merge works on basket items (structured captures), so it needs no parsing and runs in both shells.

## Alternatives considered
_Not recorded._
