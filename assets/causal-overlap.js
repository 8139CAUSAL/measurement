import { quantile, seededRandom } from "./experiment-stats.js";

const random = seededRandom(1927);
const plot = document.getElementById("overlap-plot");
const buttons = document.querySelectorAll("[data-overlap]");
const scenarios = {
  poor: { treated: [0.8, 0.10], comparison: [0.2, 0.15] },
  good: { treated: [0.55, 0.15], comparison: [0.45, 0.15] },
};

function boxData(mean, spread) {
  const points = [];
  for (let i = 0; i < 60; i++) {
    const normal = Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
    points.push(Math.max(0.01, Math.min(0.99, mean + normal * spread)));
  }
  points.sort((a, b) => a - b);
  const lowerQuartile = quantile(points, 0.25);
  const median = quantile(points, 0.5);
  const upperQuartile = quantile(points, 0.75);
  const iqr = upperQuartile - lowerQuartile;
  const lowerWhisker = Math.max(points[0], lowerQuartile - 1.5 * iqr);
  const upperWhisker = Math.min(points.at(-1), upperQuartile + 1.5 * iqr);
  return { points, lowerQuartile, median, upperQuartile, lowerWhisker, upperWhisker };
}

function svgElement(tag, attributes) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function drawBox(group, data, y, color) {
  const scoreToX = score => 70 + 510 * score;
  const left = scoreToX(data.lowerWhisker);
  const right = scoreToX(data.upperWhisker);
  const boxStart = scoreToX(data.lowerQuartile);
  const median = scoreToX(data.median);
  group.replaceChildren(
    svgElement("line", { x1: left, y1: y, x2: right, y2: y, stroke: color, class: "whisker" }),
    svgElement("line", { x1: left, y1: y - 10, x2: left, y2: y + 10, stroke: color, "stroke-width": 2 }),
    svgElement("line", { x1: right, y1: y - 10, x2: right, y2: y + 10, stroke: color, "stroke-width": 2 }),
    svgElement("rect", {
      x: boxStart, y: y - 20, width: scoreToX(data.upperQuartile) - boxStart, height: 40,
      fill: color, "fill-opacity": 0.15, stroke: color, class: "box-rect", rx: 3,
    }),
    svgElement("line", { x1: median, y1: y - 20, x2: median, y2: y + 20, stroke: color, "stroke-width": 2.5 }),
  );
  for (const score of data.points) {
    group.append(svgElement("circle", {
      cx: scoreToX(score), cy: y + (random() - 0.5) * 28, r: 2.5,
      fill: color, "fill-opacity": 0.45,
    }));
  }
}

function drawOverlap(scenario) {
  const treated = boxData(...scenarios[scenario].treated);
  const comparison = boxData(...scenarios[scenario].comparison);
  drawBox(document.getElementById("overlap-treated"), treated, 105, "#B91C1C");
  drawBox(document.getElementById("overlap-comparison"), comparison, 210, "#2563EB");
  plot.setAttribute("aria-label", `Box plot showing ${scenario} overlap in propensity scores between treated and comparison groups`);
  for (const button of buttons) {
    const selected = button.dataset.overlap === scenario;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

for (const button of buttons) {
  button.addEventListener("click", () => drawOverlap(button.dataset.overlap));
}
drawOverlap("poor");
