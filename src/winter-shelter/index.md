---
title: "Winter Shelter: FY2026 Season Review (prototype)"
toc: false
footer: "Source: Baltimore City Continuum of Care (MD-501) HMIS.<br>Author: Daniel Gore, HMIS Manager"
---

<link rel="stylesheet" href="../components/winter-shelter.css">

```js
import {renderRows, renderFootnote, renderThemeToggle} from "../components/winter-shelter.js";
const doc = FileAttachment("../data/winter-shelter.json").json();
```

<div class="ws-header">
  <p class="ws-eyebrow">Prototype</p>
  <h1>${doc.name}</h1>
  <p class="ws-lede">${doc.description}</p>
</div>

```js
display(renderThemeToggle());
```

```js
display(renderRows(doc));
```

```js
display(renderFootnote(doc));
```
