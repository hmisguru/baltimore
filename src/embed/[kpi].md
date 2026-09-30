---
title: KPI
header: false
footer: false
sidebar: false
toc: false
pager: false
---

```js
import {findKpi, renderKpi, scopeData} from "../components/kpi.js";
const spm = FileAttachment("../data/spm.json").json();
```

```js
const params = new URLSearchParams(location.search);
const theme = params.get("theme") ?? undefined;
// ?mohs=1 limits the figures to MOHS-funded projects.
const data = scopeData(spm, {mohsFunded: ["1", "true"].includes(params.get("mohs"))});
display(renderKpi(data, findKpi(data, observable.params.kpi), {theme}));
```

<style>
#observablehq-main, #observablehq-center { margin: 0; padding: 0; max-width: none; }
body { background: transparent; }
</style>
