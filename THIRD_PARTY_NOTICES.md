# Third-party notices

Luci is MIT licensed (see `LICENSE`). It bundles the following third-party work in the toolbar, the
dev toolbar and the browser extension.

## Lucide icons

`lucide-preact` (https://lucide.dev), used through `packages/ui/src/icons.ts`.

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

Some Lucide icons (among those Luci uses: `download`, `info`, `minus`, `plus`, `trash-2`, `type`,
`x`) are derived from the Feather project:

```
The MIT License (MIT)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## GitHub's mark (Octicons)

`brand/icons/github-mark.svg`, the `mark-github` icon from Octicons (https://primer.style/octicons),
used unaltered to link to Luci's repository. The GitHub mark is a trademark of GitHub, Inc., used as
GitHub's logo guidelines allow for linking to GitHub.

```
MIT License

Copyright (c) 2026 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Fonts (SIL Open Font License 1.1)

Bundled as woff2 (Latin, variable weight) from Fontsource 5.3.0, in `packages/ui/src/fonts/`. Each
font's full licence is next to it.

| Font | Copyright | Licence file |
| --- | --- | --- |
| Fredoka | Copyright 2016 The Fredoka Project Authors | `packages/ui/src/fonts/fredoka-OFL.txt` |
| Inter | Copyright 2016 The Inter Project Authors | `packages/ui/src/fonts/inter-OFL.txt` |
| JetBrains Mono | Copyright 2020 The JetBrains Mono Project Authors | `packages/ui/src/fonts/jetbrains-mono-OFL.txt` |

## Formats Luci writes

Luci can export captures as DESIGN.md in the open format of [google-labs-code/design.md](https://github.com/google-labs-code/design.md) (Apache License 2.0, version "alpha"), the format Google Stitch reads. Luci contains none of that project's code: it writes files that follow its specification.

## Tools Luci can install and run (not bundled)

Luci's code map is powered by Graphify. Luci contains no Graphify or uv code: with the person's
consent, `luci map --install` installs them from their own sources, and Luci runs Graphify as a
separate program and reads the files it writes (`graphify-out/graph.json`, `GRAPH_REPORT.md`). The
code map is optional; Luci works without it.

| Tool | What Luci uses it for | Source | Licence |
| --- | --- | --- | --- |
| Graphify (`graphifyy` on PyPI), Copyright 2026 Safi Shamsi and the Graphify contributors | The code map: a graph of the project's code that agents query instead of reading whole files | https://github.com/Graphify-Labs/graphify, https://graphify.com | Apache License 2.0 (parts contributed earlier remain under the MIT License, as its NOTICE says) |
| uv, by Astral | Installs Graphify (`uv tool install graphifyy`) | https://github.com/astral-sh/uv | MIT or Apache License 2.0, at your option |
