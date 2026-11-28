import { binaryContrast } from "./experiment-stats.js";
import { $, points, probability, table } from "./experiment-tools.js";

const family = $("#comparison-family");
const adjustment = $("#comparison-adjustment");
const alpha = .05;

function update() {
  const comparisons = [
    ["Offer A − control", binaryContrast(200, 1000, 242, 1000)],
    ["Offer B − control", binaryContrast(200, 1000, 252, 1000)],
  ];
  if (family.value === "all") comparisons.push(["Offer B − Offer A", binaryContrast(242, 1000, 252, 1000)]);
  const count = comparisons.length;
  const sorted = [...comparisons].sort((a, b) => a[1].p - b[1].p);
  const adjusted = new Map();
  let running = 0;
  sorted.forEach(([label, result], i) => {
    const multiplier = adjustment.value === "holm" ? count - i : count;
    running = Math.max(running, Math.min(1, result.p * multiplier));
    adjusted.set(label, running);
  });
  $("#comparison-summary").textContent = adjustment.value === "holm"
    ? `${count} contrasts. Holm starts with ${(100 * alpha / count).toFixed(3)}% for the smallest p-value and relaxes the cutoff step by step if each preceding comparison rejects.`
    : `${count} contrasts. Bonferroni tests each at ${(100 * alpha / count).toFixed(3)}%.`;
  $("#comparison-results").innerHTML = table(["Contrast", "Rate lift", "Raw p", "Raw decision", "Adjusted p", "Adjusted decision"],
    comparisons.map(([label, result]) => [
      label, points(result.effect), probability(result.p), result.p <= alpha ? "Reject" : "Retain",
      probability(adjusted.get(label)), adjusted.get(label) <= alpha ? "Reject" : "Retain",
    ]));
}

family.addEventListener("change", update);
adjustment.addEventListener("change", update);
update();
