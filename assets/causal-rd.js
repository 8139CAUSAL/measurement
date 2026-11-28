import { $, axis, blue, chart, decimal, gold, mint, series, signed, table } from "./experiment-tools.js";
import { rdExamples } from "./causal-rd-data.js";

const scenarioField = $("#rd-scenario");
const bandwidthField = $("#rd-bandwidth");
const outcomeCanvas = $("#rd-outcome");
const receiptCanvas = $("#rd-receipt");
const cutoff = 50;
const band = values => values ? values.map(x => decimal(x)).join(" to ") : "—";

function draw(canvas, bins, bandwidth, key, fit, title) {
  const values = [...bins.map(bin => bin[key]), ...fit.lines.flat()];
  if (key === "receipt") values.push(0, 100);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sides = [["Below cutoff", mint, "circle", []], ["Eligible side", blue, "triangle", [6, 4]]];
  const scores = [[cutoff - bandwidth, cutoff], [cutoff, cutoff + bandwidth]];
  chart(canvas, {
    legend: true,
    x: { title: axis("Application score"), min: cutoff - bandwidth, max: cutoff + bandwidth },
    y: { title: axis(title), suggestedMin: min, suggestedMax: max },
    datasets: [
      series("Cutoff (50)", [{ x: cutoff, y: min }, { x: cutoff, y: max }], gold, { borderDash: [4, 4] }),
      ...sides.flatMap(([label, color, pointStyle, borderDash], i) => [
        series(label + " fit", scores[i].map((x, j) => ({ x, y: fit.lines[i][j] })), color, { borderDash }),
        series(label + " bins", bins.filter(bin => (bin.score >= cutoff ? 1 : 0) === i)
          .map(bin => ({ x: bin.score, y: bin[key] })), color, { showLine: false, pointRadius: 4, pointStyle }),
      ]),
    ],
  });
}

function update() {
  const scenario = scenarioField.value;
  const bandwidth = Number(bandwidthField.value);
  const { bins, outcome, receipt, covariate, ratio, counts } = rdExamples[scenario][bandwidth];
  const receiptLink = scenario === "sharp" ? "Eligibility and receipt coincide. The effect is local to applicants at score 50."
    : scenario === "weak" ? "The score distribution has comparable support on both sides by construction. The first stage is imprecise, so a conventional receipt-effect interval is withheld."
      : "The receipt-effect contrast describes compliers at score 50 under continuity, exclusion and monotonicity.";
  $("#rd-status").textContent = `At a ${bandwidth}-point bandwidth, the outcome jumps ${signed(outcome.jump)} outcome units and receipt jumps ${signed(receipt.jump)} percentage points. ${receiptLink}`;
  $("#rd-estimates").innerHTML = table(["Contrast", "Local linear estimate", "Robust bias-corrected 95% interval"], [
    ["Eligibility effect (outcome units)", signed(outcome.jump), band(outcome.interval)],
    ["First stage (percentage points)", signed(receipt.jump), receipt.interval ? band(receipt.interval) : "Deterministic by construction"],
    ["Receipt effect (outcome units)", ratio ? signed(ratio.jump) : "Withheld", ratio ? band(ratio.interval) : "Weak first stage"],
    ["Baseline covariate jump (units)", signed(covariate.jump), band(covariate.interval)],
  ], `Estimated jumps at score 50 · ${counts[0]} below and ${counts[1]} on eligible side within bandwidth`);
  $("#rd-tables").innerHTML = table(
    ["Mean score in bin", "Score band", "Observations", "Mean outcome", "Receipt (%)", "Baseline covariate"],
    bins.map(bin => [decimal(bin.score), bin.band.join(" to "), bin.n, decimal(bin.outcome), decimal(bin.receipt), decimal(bin.covariate)]),
    "Two-point score bins within the displayed bandwidth",
  ) + table(["Fit", "Left edge", "Left limit at 50", "Right limit at 50", "Right edge"], [
    ["Outcome", ...outcome.lines.flat().map(x => decimal(x))],
    ["Receipt (%)", ...receipt.lines.flat().map(x => decimal(x))],
  ], "Endpoints of the local linear fits");
  draw(outcomeCanvas, bins, bandwidth, "outcome", outcome, "Outcome (units)");
  draw(receiptCanvas, bins, bandwidth, "receipt", receipt, "Receipt (%)");
}

scenarioField.addEventListener("change", update);
bandwidthField.addEventListener("change", update);
update();
