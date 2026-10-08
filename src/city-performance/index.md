---
title: City Performance Measures
toc: false
---

<link rel="stylesheet" href="../components/city-performance.css">

```js
import {renderMeasures, renderFootnote, renderThemeToggle, recentQuarters} from "../components/city-performance.js";
const doc = FileAttachment("../data/city-performance.json").json();
```

<div class="cpm-header">

<p class="cpm-eyebrow">Prototype</p>

# City Performance Measures

<p class="cpm-lede">A direct-from-HMIS replacement for FY27_Measures_and_Notes.xlsx's own methodology, which currently pulls these numbers from a mix of manual report exports. Covers Outreach to the Homeless and Homeless Prevention so far (5 of 17 non-PIT measures); Permanent Housing and Temporary Housing come next.</p>

```js
display(renderThemeToggle());
```

</div>

```js
// Quarter-picker: the current quarter plus the 4 before it, default
// rightmost (current) -- moving it updates every card's stat and trend-
// chart highlight at once, without refetching data (all quarters are
// already in doc).
const quarterOptions = recentQuarters(doc, 5);

const pickerLabel = document.createElement("label");
pickerLabel.textContent = "Viewing quarter:";
pickerLabel.htmlFor = "cpm-quarter-slider";

const slider = document.createElement("input");
slider.type = "range";
slider.id = "cpm-quarter-slider";
slider.min = "0";
slider.max = String(quarterOptions.length - 1);
slider.step = "1";
slider.value = String(quarterOptions.length - 1);
slider.setAttribute("aria-valuetext", quarterOptions[quarterOptions.length - 1].label);

const valueLabel = document.createElement("span");
valueLabel.className = "cpm-quarter-picker-value";
valueLabel.textContent = quarterOptions[quarterOptions.length - 1].label;

const picker = document.createElement("div");
picker.className = "cpm-quarter-picker";
picker.append(pickerLabel, slider, valueLabel);
display(picker);

const grid = document.createElement("div");
display(grid);

function renderGrid() {
  const selected = quarterOptions[Number(slider.value)];
  valueLabel.textContent = selected.label;
  slider.setAttribute("aria-valuetext", selected.label);
  grid.replaceChildren(renderMeasures(doc, selected.label));
}
slider.addEventListener("input", renderGrid);
renderGrid();
```

```js
display(renderFootnote(doc));
```

<p class="cpm-footnote">Point-in-Time count measures (unsheltered and sheltered+unsheltered counts) aren't included here and won't be: a PIT count is a single-night manual count, not continuous HMIS enrollment data, so it can't be computed the same way these can.</p>
