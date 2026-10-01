---
title: Coordinated Entry Line (prototype)
toc: false
---

<link rel="stylesheet" href="../components/coordinated-entry.css">

```js
import {renderRows, renderFootnote} from "../components/coordinated-entry.js";
const doc = FileAttachment("../data/coordinated-entry.json").json();
```

<div class="ce-header">
  <p class="ce-eyebrow">Prototype</p>
  <h1>${doc.name}</h1>
  <p class="ce-lede">${doc.description}</p>
</div>

```js
display(renderRows(doc));
```

```js
display(renderFootnote(doc));
```
