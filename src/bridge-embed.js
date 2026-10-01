// Host-page helper for the embedded Bridge to Housing dashboard: sizes each
// embed/bridge iframe to fit its content, so there's no inner scrollbar or
// blank space as viewers switch tabs and filters.
//
//   <iframe src="https://hmisguru.github.io/baltimore/embed/bridge"
//     title="Bridge to Housing Dashboard" width="100%" height="1600" style="border:0"></iframe>
//   <script type="module" src="https://hmisguru.github.io/baltimore/bridge-embed.js"></script>
//
// Published at a stable URL via dynamicPaths in observablehq.config.js.

const ORIGIN = new URL(import.meta.url).origin;
const HEIGHT = "baltimore:bridge-height";
const AUTOSIZE = "baltimore:bridge-autosize";

addEventListener("message", (event) => {
  // Only messages from this site's own pages, and only a sane height.
  if (event.origin !== ORIGIN || event.data?.type !== HEIGHT) return;
  const height = Number(event.data.height);
  if (!Number.isFinite(height) || height <= 0 || height > 100000) return;
  for (const iframe of document.querySelectorAll("iframe")) {
    if (iframe.contentWindow !== event.source) continue;
    iframe.style.height = `${Math.ceil(height)}px`;
    event.source.postMessage({type: AUTOSIZE}, ORIGIN);
  }
});
