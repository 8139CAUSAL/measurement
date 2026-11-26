import { $, axis, blue, chart, decimal, gold, mint, muted, percent, series, table } from "./experiment-tools.js";
import { pretrendExample } from "./causal-pretrends-data.js";

const { periods, estimates, covariance, pointwise, simultaneous, power, sensitivity } = pretrendExample;
const drift = $("#pretrend-drift");
const test = $("#pretrend-test");
const bound = $("#pretrend-bound");
const eventChart = $("#pretrend-chart");
const range = limits => limits.map(value => decimal(value)).join(" to ");
const byEvent = (values, offset = 0) => periods.flatMap((event, i) => [
  { x: event + offset, y: values[i][0] },
  { x: event + offset, y: values[i][1] },
  { x: event + offset, y: null },
]);

function showTest() {
  const slope = Number(drift.value);
  const selected = power[test.value];
  $("#pretrend-status").textContent = `At ${decimal(slope)} outcome units of drift per period, detection probability is ${percent(selected.detection[slope])}. Under zero drift this test rejects ${percent(selected.detection[0])} of the time. The 80% minimum detectable violation is ${decimal(selected.minimum, 3)} outcome units per period.`;
  const points = periods.map((x, i) => ({ x, y: estimates[i] }));
  points.splice(3, 0, { x: -1, y: 0 });
  chart(eventChart, {
    legend: true,
    x: { title: axis("Event time (periods)"), ticks: { stepSize: 1 } },
    y: { title: axis("Outcome units"), suggestedMin: -5 },
    datasets: [
      series("Simultaneous 95% bands", byEvent(simultaneous, .07), blue, { borderDash: [4, 3] }),
      series("Pointwise 95% intervals", byEvent(pointwise), mint),
      series("Event-study estimates", points, muted, { showLine: false, pointRadius: 5 }),
      series("Proposed untreated pre-trend", points.filter(point => point.x <= -1)
        .map(({ x }) => ({ x, y: (x + 1) * slope })), gold, { borderDash: [7, 4], pointRadius: 3, pointStyle: "triangle" }),
    ],
  });
  const rows = periods.map((period, i) => [
    period, decimal(estimates[i]), range(pointwise[i]), range(simultaneous[i]),
    period < -1 ? decimal((period + 1) * slope) : "—",
  ]);
  rows.splice(3, 0, [-1, "0 (reference)", "—", "—", "0"]);
  $("#pretrend-event-table").innerHTML = table(
    ["Event time", "Estimate", "Pointwise 95% interval", "Simultaneous 95% band", "Hypothesized pre-trend"], rows,
    "Fixed event study (outcome units)",
  );
}

function showSensitivity() {
  const smoothness = Number(bound.value);
  const { range: identified, interval } = sensitivity[smoothness];
  $("#sensitivity-status").textContent = `At smoothness bound M = ${decimal(smoothness)}, the robust interval for the event-time 0 effect is ${range(interval)} outcome units.`;
  $("#sensitivity-table").innerHTML = table(["Event-time 0 effect", "Limits (outcome units)"], [
    ["Plug-in identified range", range(identified)],
    ["HonestDiD fixed-length 95% uncertainty interval", range(interval)],
  ]);
}

$("#pretrend-covariance").innerHTML = table(["Event time", ...periods],
  periods.map((period, i) => [period, ...covariance[i].map(number => decimal(number, 6))]),
  "Covariance of the five estimated coefficients (outcome units squared)",
);
drift.addEventListener("change", showTest);
test.addEventListener("change", showTest);
bound.addEventListener("change", showSensitivity);
showTest();
showSensitivity();
