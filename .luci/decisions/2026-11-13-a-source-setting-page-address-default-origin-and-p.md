# A Source setting: "page address" (default, origin and path) or "site name only" (lattice.com) for the source line of every file and the basket export

- Date: 2026-11-13
- Status: accepted
- Area: Capture format

## What
A Source setting: "page address" (default, origin and path) or "site name only" (lattice.com) for the source line of every file and the basket export

## Why
User request 2026-11-13, after Claude explained why the source line is kept (provenance for the agent, basket grouping, file names). The setting only changes how the source is written: captures keep the full page address internally, so the basket still groups by page and file names still come from the site. Site name = host without "www.", with the port for a local server; a page without a host (a file: URL) keeps its address. parseCapture accepts a site name as source. Also fixed: a file: URL source was written "null/..." (URL.origin is "null"); it now keeps file:// and the path.

## Alternatives considered
_Not recorded._
