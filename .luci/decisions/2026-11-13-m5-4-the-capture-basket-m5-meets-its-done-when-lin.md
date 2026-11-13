# M5.4: the capture basket; M5 meets its Done-when line (items from two sites export as one file)

- Date: 2026-11-13
- Status: accepted
- Area: Milestone

## What
M5.4: the capture basket; M5 meets its Done-when line (items from two sites export as one file)

## Why
packages/capture/src/ui/basket.ts: BasketStore (load/save) chosen by the shell; the default keeps items in page memory, the extension keeps them in chrome.storage.local so every tab and site shares them across restarts (items are validated with basketItemSchema on load). Every capture file has "Add to basket"; "Basket (n)" in the bar lists items with editable names, Export (one item, named after its basket name), Remove, "Export all as one file" (formatCollection, default name basket-YYYY-MM-DD) and a two-step "Empty basket". Done-when test packages/capture/test/basket.test.ts: two origins (127.0.0.1 and localhost) in separate pages share one store; a component and a text style from site A and a shadow-DOM colour from site B export as one collection file that parses, lists both sources and groups Components, Text, Colours. The opt-in extension test also checks the basket across two origins in real extension storage (test build may script localhost too).

## Alternatives considered
_Not recorded._
