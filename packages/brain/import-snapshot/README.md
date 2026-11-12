# Import snapshot

What the earlier prototype shipped, at its commit 5276a50: the project memory templates (`templates/`) and the Global Brain defaults (`brain/`). The files are unchanged copies.

Only `luci import` (B13) reads them, to tell text the prototype wrote from text a person wrote: a section or file that still matches the prototype's version is replaced by Luci's, and anything else is carried over. Nothing else in Luci uses these files, so they keep the prototype's names.
