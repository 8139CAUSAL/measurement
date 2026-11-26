import { normalQuantile } from "./experiment-stats.js";
import { $, interval, percent, points, table } from "./experiment-tools.js";

export function encouragement(compliers, direct) {
  const types = [
    { label: "Always-takers", n: 100, receipt: [1, 1] },
    { label: "Compliers", n: compliers * 10, receipt: [0, 1] },
    { label: "Never-takers", n: 900 - compliers * 10, receipt: [0, 0] },
  ];
  const arms = [0, 1].map(z => {
    const records = types.map(({ label, n, receipt }) => {
      const received = receipt[z];
      const risk = .20 + .20 * received + (z && direct ? .04 : 0);
      return { label, n, received: received * n, events: Math.round(n * risk) };
    });
    const receive = records.reduce((sum, row) => sum + row.received, 0);
    const events = records.reduce((sum, row) => sum + row.events, 0);
    const joint = records.reduce((sum, row) => sum + (row.received ? row.events : 0), 0);
    const p = receive / 1000;
    const y = events / 1000;
    return {
      records, receive, events, p, y,
      varD: p * (1 - p) / 999, varY: y * (1 - y) / 999, cov: (joint / 1000 - p * y) / 999,
    };
  });
  const first = arms[1].p - arms[0].p;
  const itt = arms[1].y - arms[0].y;
  const z = normalQuantile(.975);
  const d = arms[0].varD + arms[1].varD;
  const y = arms[0].varY + arms[1].varY;
  const cov = arms[0].cov + arms[1].cov;
  const margin = z * Math.sqrt(d);
  const coefficients = [first ** 2 - z * z * d, -2 * (itt * first - z * z * cov), itt ** 2 - z * z * y];
  return { arms, first, itt, wald: first ? itt / first : null, firstInterval: { low: first - margin, high: first + margin }, coefficients };
}

function confidenceSet([a, b, c]) {
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) return c <= 0 ? "all real values" : "empty";
    const cutoff = points(-c / b);
    return b > 0 ? `at or below ${cutoff}` : `at or above ${cutoff}`;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return a < 0 ? "all real values" : "empty";
  const roots = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)].sort((l, r) => l - r);
  return a < 0
    ? `at or below ${points(roots[0])}, or at or above ${points(roots[1])} (unbounded)`
    : `${points(roots[0])} to ${points(roots[1])}`;
}

const compliance = $("#iv-compliance");
const direct = $("#iv-direct");
function update() {
  const hasDirect = direct.value === "yes";
  const { arms, first, itt, wald, firstInterval, coefficients } = encouragement(Number(compliance.value), hasDirect);
  const labels = ["No encouragement", "Encouragement"];
  $("#iv-arms").innerHTML = table(["Assigned arm", "Assigned and observed", "Received", "Outcomes"],
    arms.map(({ receive, events, p, y }, z) => [labels[z], "1,000", `${receive} (${percent(p)})`, `${events} (${percent(y)})`]),
    "Assigned encouragement, actual receipt and binary outcome");
  const waldText = wald === null ? "Wald ratio unavailable because the first stage is zero."
    : `Wald ratio ${points(wald)}. ${hasDirect ? "The direct path violates exclusion, so the ratio has no complier-effect interpretation."
      : "Under the stated IV assumptions, the ratio estimates the effect of receipt among compliers."}`;
  $("#iv-summary").textContent = `First stage ${points(first)}. Outcome ITT ${points(itt)}. ${waldText}`;
  $("#iv-uncertainty").textContent = `First-stage approximate 95% interval ${interval(firstInterval)} pp. ` +
    (hasDirect ? "A complier interval is unavailable under this direct-effect design."
      : `Approximate 95% Anderson–Rubin set for the effect of receipt: ${confidenceSet(coefficients)}.`);
  $("#iv-types").innerHTML = table(["Assignment and latent type", "Units", "Received", "Outcomes"],
    arms.flatMap(({ records }, z) => records.map(({ label, n, received, events }) => [`${labels[z]} · ${label}`, n, received, events])),
    "Linked synthetic counts. Individual compliance types would be hidden in a real trial.");
}
compliance.addEventListener("change", update);
direct.addEventListener("change", update);
update();
