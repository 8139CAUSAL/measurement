import { binarySize } from "./experiment-stats.js";

export const $ = (selector, root = document) => root.querySelector(selector);
export const all = (selector, root = document) => [...root.querySelectorAll(selector)];
export const integer = value => value.toLocaleString("en-US");
export const decimal = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : "Undefined";
export const signed = (value, digits = 2) => {
  const absolute = decimal(Math.abs(value), digits);
  return Number.isFinite(value) ? (Number(absolute) === 0 ? "" : value > 0 ? "+" : "−") + absolute : "Undefined";
};
export const percent = value => decimal(100 * value) + "%";
export const points = value => signed(100 * value) + " pp";
export const interval = (result, factor = 100) => `${decimal(factor * result.low)} to ${decimal(factor * result.high)}`;
export const probability = value => value === null ? "undefined" : value < .0001 ? "< .0001" : value.toFixed(4);
export const mint = "#81f0d4";
export const blue = "#9ec9ff";
export const gold = "#ffd384";
export const muted = "#c2cfe6";

export function table(headers, rows, caption = "") {
  return `<div class="ex-table"><table>${caption ? `<caption>${caption}</caption>` : ""}
    <thead><tr>${headers.map(text => `<th scope="col">${text}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(([label, ...cells]) => `<tr><th scope="row">${label}</th>${cells.map(text => `<td>${text}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

export function initializeTabs(root = document) {
  for (const list of all(".ex-tabs", root)) {
    list.addEventListener("click", event => {
      const tab = event.target.closest("[data-guide-tab]");
      if (!tab) return;
      for (const button of all("[data-guide-tab]", list)) {
        const active = button === tab;
        button.classList.toggle("active", active);
        document.getElementById(button.dataset.guideTab).hidden = !active;
      }
    });
  }
}

export function sizingForm(form) {
  const fields = form.elements;
  const result = $("[data-size-result]", form);
  const status = $("[data-size-status]", form);
  const read = () => ({
    baseline: fields.baseline.valueAsNumber / 100,
    mde: fields.mde.valueAsNumber / 100,
    alpha: fields.alpha.valueAsNumber / 100,
    power: fields.power.valueAsNumber / 100,
    ratio: fields.ratio.valueAsNumber,
    loss: fields.loss.valueAsNumber / 100,
    daily: fields.daily.valueAsNumber,
    followup: fields.followup.valueAsNumber,
  });
  const update = () => {
    try {
      const plan = read();
      const size = binarySize(plan);
      result.innerHTML = table(["Requirement", "Control", "Offer", "Total"], [
        ["Expected conversion", percent(plan.baseline), percent(size.target), "—"],
        ["Required observed outcomes", ...size.outcomes.map(integer), integer(size.outcomes[0] + size.outcomes[1])],
        ["Required enrollment", ...size.enrollment.map(integer), integer(size.total)],
      ]);
      const sparse = [plan.baseline, size.target].some((p, arm) => Math.min(p, 1 - p) * size.outcomes[arm] < 10);
      status.textContent = `Cohen’s h = ${signed(size.h, 4)}. Recruit for ${integer(size.recruitment)} day(s). Allow ${integer(size.followup)} additional day(s) after the last enrollment for follow-up.${sparse ? " Expected successes or failures are sparse. Check power with a design-specific exact calculation or simulation." : ""}`;
      return { ...plan, ...size };
    } catch (error) {
      result.replaceChildren();
      status.textContent = error.message;
      return null;
    }
  };
  form.addEventListener("input", update);
  update();
  return update;
}

export function chart(canvas, { type = "line", datasets, x = {}, y = {}, legend = false, labels }) {
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    parsing: false,
    scales: {
      x: { type: "linear", grid: { color: "#354b6d" }, ticks: { color: muted, maxTicksLimit: 7 }, ...x },
      y: { grid: { color: "#354b6d" }, ticks: { color: muted, maxTicksLimit: 6 }, ...y },
    },
    plugins: { legend: { display: legend, labels: { color: muted, usePointStyle: true, boxWidth: 10 } } },
  };
  const data = { labels, datasets };
  const existing = Chart.getChart(canvas);
  if (existing && existing.config.type === type) {
    existing.data = data;
    existing.options = options;
    existing.update("none");
  } else {
    existing?.destroy();
    new Chart(canvas, { type, data, options });
  }
}

export const axis = text => ({ display: true, text, color: muted });

export function series(label, data, color, options = {}) {
  return {
    label, data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, ...options,
  };
}

export function intervalChart(canvas, rows, marks = [], x = {}) {
  const numbers = [...rows.flatMap(row => [row.low, row.high]), ...marks.map(mark => mark.value)];
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const padding = Math.max((max - min) * .08, .05);
  chart(canvas, {
    datasets: [
      ...marks.map(({ label, value, color, dash }) => series(label,
        [{ x: value, y: .5 }, { x: value, y: rows.length + .5 }], color, { borderDash: dash })),
      ...rows.flatMap(({ label, estimate, low, high, color, style = "circle" }, i) => [
        series(label, [{ x: low, y: i + 1 }, { x: high, y: i + 1 }], color),
        series(label, [{ x: estimate, y: i + 1 }], color, { pointRadius: 6, pointStyle: style }),
      ]),
    ],
    x: { suggestedMin: min - padding, suggestedMax: max + padding,
      title: axis(canvas.dataset.units || "Percentage points"), ...x },
    y: { min: .5, max: rows.length + .5, ticks: { stepSize: .5, color: muted, callback: index => rows[index - 1]?.label || "" } },
  });
}
