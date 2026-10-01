---
title: Bridge to Housing Dashboard
header: false
footer: false
sidebar: false
toc: false
pager: false
---

<link rel="stylesheet" href="../components/bridge.css">

```js
import {bridgeInputs, renderAbout, renderFootnote, renderTab} from "../components/bridge.js";
const bridge = FileAttachment("../data/bridge.json").json();
```

```js
display(renderAbout(bridge));
```

```js
// ?tab=, ?project= and ?household= pick the starting tab and filters (loosely
// matched: ?tab=system-engagement, ?project=rrh). Anything else is ignored.
const params = new URLSearchParams(location.search);
const inputs = bridgeInputs(bridge, {tab: params.get("tab"), household: params.get("household"), project: params.get("project")});
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

```js
// Auto-height: report the content height to the host page whenever it changes
// (tab or filter switch, resize, fonts). /bridge-embed.js on the host page
// applies it to this iframe and replies, and only then is this page's own
// scrollbar turned off, so an iframe without that script still scrolls.
const HEIGHT = "baltimore:bridge-height", AUTOSIZE = "baltimore:bridge-autosize";
const main = document.querySelector("#observablehq-main");
const report = () => window.parent.postMessage({type: HEIGHT, height: Math.ceil(main.getBoundingClientRect().bottom + scrollY)}, "*");
const observer = new ResizeObserver(report);
observer.observe(main);
const onMessage = (event) => {
  if (event.source === window.parent && event.data?.type === AUTOSIZE) document.documentElement.classList.add("bridge-autosize");
};
addEventListener("message", onMessage);
invalidation.then(() => (observer.disconnect(), removeEventListener("message", onMessage)));
```

<style>
#observablehq-main, #observablehq-center { margin: 0; padding: 0 1px; max-width: none; min-height: 0; }
#observablehq-main > :last-child { margin-bottom: 0; }
body { background: transparent; }
html.bridge-autosize { overflow: hidden; }
</style>
