# Shared names and agent markers live in the format package

- Date: 2026-11-12
- Status: accepted
- Area: Architecture

## What
Shared names and agent markers live in the format package

## Why
PRODUCT (names, folders, LUCI_HOME), the memory layout constants, the precedence list and the agent file markers are defined once in packages/format, so the CLI, the agent files, the MCP server and later the extension never disagree. The prototype kept these in core/product.js and scattered string literals.

## Alternatives considered
_Not recorded._
