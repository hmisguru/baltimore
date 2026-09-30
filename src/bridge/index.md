---
title: Bridge to Housing (prototype)
toc: false
---

<link rel="stylesheet" href="../components/bridge.css">

```js
import {bridgeInputs, renderAbout, renderFootnote, renderTab} from "../components/bridge.js";
const bridge = FileAttachment("../data/bridge.json").json();
```

<div class="bridge-header">
  <p class="bridge-eyebrow">Prototype</p>
  <h1>${bridge.name}</h1>
  <p class="bridge-lede">${bridge.description}</p>
</div>

```js
display(renderAbout(bridge));
```

```js
const inputs = bridgeInputs(bridge);
const householdValue = Generators.input(inputs.household);
const projectValue = Generators.input(inputs.project);
const tabValue = Generators.input(inputs.tabs);
display(inputs.controls);
display(inputs.tabs);
```

```js
display(renderTab(bridge, tabValue, [householdValue, projectValue]));
```

```js
display(renderFootnote(bridge));
```
