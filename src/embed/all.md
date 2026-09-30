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
const theme = new URLSearchParams(location.search).get("theme") ?? undefined;
display(renderKpiGrid(spm, undefined, {theme}));
```

<style>
#observablehq-main, #observablehq-center { margin: 0; padding: 0; max-width: none; }
body { background: transparent; }
</style>
