---
title: KPIs
header: false
footer: false
sidebar: false
toc: false
pager: false
---

```js
import {renderKpiGrid} from "../components/kpi.js";
const spm = FileAttachment("../data/spm.json").json();
```

```js
const params = new URLSearchParams(location.search);
const theme = params.get("theme") ?? undefined;
const flag = (name) => ["1", "true"].includes(params.get(name));
// ?mohs=1 starts on MOHS-funded projects only; ?toggle=1 shows the switch.
display(renderKpiGrid(spm, undefined, {theme, mohsFunded: flag("mohs"), toggle: flag("toggle")}));
// The switch label and source line sit outside the tiles, on the page
// background, so a dark-themed iframe paints its own dark background rather
// than relying on the host page behind it being dark.
const dark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.classList.toggle("bkpi-dark-page", dark);
```

<style>
#observablehq-main, #observablehq-center { margin: 0; padding: 0; max-width: none; }
body { background: transparent; }
html.bkpi-dark-page, html.bkpi-dark-page body { background: #1b1024; }
</style>
