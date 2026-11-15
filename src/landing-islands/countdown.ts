/**
 * Ticks every `[data-countdown]` element toward its ISO time. A row drops out
 * when its time passes and the block when its last row has. Nothing else on the
 * page depends on it.
 */
const pad = (n: number) => String(n).padStart(2, "0");

function format(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 86400))}d ${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

function tick(): boolean {
  const now = Date.now();
  let live = false;
  for (const el of document.querySelectorAll<HTMLElement>("[data-countdown]")) {
    const left = Date.parse(el.dataset.countdown ?? "") - now;
    if (!(left > 0)) {
      const row = el.closest("[data-countdown-row]");
      const block = el.closest("[data-countdown-block]");
      row?.remove();
      if (block && !block.querySelector("[data-countdown]")) block.remove();
      continue;
    }
    el.textContent = format(left);
    live = true;
  }
  return live;
}

if (tick()) {
  const timer = setInterval(() => {
    if (!tick()) clearInterval(timer);
  }, 1000);
}
