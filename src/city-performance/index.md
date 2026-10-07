---
title: City Performance Measures
toc: false
---

<link rel="stylesheet" href="../components/city-performance.css">

```js
import {renderMeasures, renderFootnote, renderThemeToggle} from "../components/city-performance.js";
const doc = FileAttachment("../data/city-performance.json").json();
```

<div class="cpm-header">

<p class="cpm-eyebrow">Prototype — Outreach to the Homeless</p>

# City Performance Measures

<p class="cpm-lede">A direct-from-HMIS replacement for FY27_Measures_and_Notes.xlsx's own methodology, which currently pulls these numbers from a mix of manual report exports. This first slice covers the "Outreach to the Homeless" service category (3 of 19 measures); the rest come next once this one is reviewed.</p>

```js
display(renderThemeToggle());
```

</div>

```js
display(renderMeasures(doc));
```

```js
display(renderFootnote(doc));
```

<p class="cpm-footnote">Point-in-Time count measures (unsheltered and sheltered+unsheltered counts) aren't included here and won't be: a PIT count is a single-night manual count, not continuous HMIS enrollment data, so it can't be computed the same way these can.</p>
