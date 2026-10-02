---
title: Housing Inventory (prototype)
toc: false
---

<link rel="stylesheet" href="../components/inventory.css">

```js
import {inventoryInputs, renderRows, renderFootnote} from "../components/inventory.js";
const doc = FileAttachment("../data/inventory.json").json();
```

<div class="inv-header">
  <p class="inv-eyebrow">Prototype</p>
  <h1>${doc.name}</h1>
  <p class="inv-lede">${doc.description}</p>
</div>

```js
const inputs = inventoryInputs(doc);
const householdValue = Generators.input(inputs.household);
const participationValue = Generators.input(inputs.participation);
display(inputs.controls);
```

```js
display(renderRows(doc, [householdValue, participationValue]));
```

```js
display(renderFootnote(doc));
```
