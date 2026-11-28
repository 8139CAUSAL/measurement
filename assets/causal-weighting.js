import { $, decimal, percent, points, signed, table } from "./experiment-tools.js";

const strata = [
  { label: "Low", arms: [{ n: 80, y: 8 }, { n: 20, y: 4 }], working: [.12, .22] },
  { label: "High", arms: [{ n: 20, y: 8 }, { n: 80, y: 48 }], working: [.36, .55] },
];
const sum = values => values.reduce((total, value) => total + value, 0);

function armCells(rows, arm) {
  return rows.map((row, i) => ({ ...row.arms[arm], high: i, share: row.share, working: row.working[arm] }));
}

function weightedSummary(cells, weight, field) {
  const weights = cells.map(weight);
  const totals = cells.map((cell, i) => cell[field] * weights[i]);
  const denominator = sum(totals);
  if (!denominator) return null;
  return {
    mean: sum(cells.map((cell, i) => cell.yObserved * weights[i])) / denominator,
    high: sum(cells.map((cell, i) => cell.high * totals[i])) / denominator,
    ess: denominator ** 2 / sum(cells.map((cell, i) => totals[i] * weights[i])),
  };
}

export function weighting(target, followup, cutoff) {
  const rows = strata.map(({ label, arms, working }, stratum) => {
    const n = sum(arms.map(cell => cell.n));
    const e = arms[1].n / n;
    const raw = target === "att" ? [e / (1 - e), 1] : [1 / (1 - e), 1 / e];
    const retention = followup === "complete" ? 1 : [.5, .75][stratum];
    const share = target === "att" ? arms[1].n / 100 : n / 200;
    return { label, share, e, working, arms: arms.map(({ n, y }, arm) => {
      const yObserved = y * (followup === "mnar" && arm === 1 ? .25 : retention);
      const observed = (n - y) * retention + yObserved;
      const pi = observed / n;
      return { n, y, observed, yObserved, pi, raw: raw[arm], weight: Math.min(cutoff, raw[arm]), joint: raw[arm] / pi };
    }) };
  });
  const results = [0, 1].map(arm => {
    const cells = armCells(rows, arm);
    const complete = weightedSummary(cells, () => 1, "observed");
    const treatment = weightedSummary(cells, cell => cell.weight, "observed");
    const joint = weightedSummary(cells, cell => Math.min(cutoff, cell.joint), "observed");
    const unweightedHigh = cells[1].n / sum(cells.map(cell => cell.n));
    const weighted = weightedSummary(cells, cell => cell.weight, "n");
    const augmented = sum(cells.map(cell => cell.share * cell.working)) +
      sum(cells.map(cell => cell.joint * (cell.yObserved - cell.observed * cell.working))) / (target === "att" ? 100 : 200);
    return {
      complete, treatment, joint, augmented, unweightedHigh, weighted,
      truth: sum(cells.map(cell => cell.share * cell.y / cell.n)),
      clipped: sum(cells.map(cell => cell.raw > cutoff ? cell.n : 0)),
      jointClipped: sum(cells.map(cell => cell.joint > cutoff ? cell.observed : 0)),
      max: Math.max(...cells.map(cell => cell.weight)),
      maxJoint: Math.max(...cells.map(cell => Math.min(cutoff, cell.joint))),
      assigned: sum(cells.map(cell => cell.n)),
      observed: sum(cells.map(cell => cell.observed)),
    };
  });
  const high = results.map(result => result.unweightedHigh);
  const scale = Math.sqrt(sum(high.map(p => p * (1 - p))) / 2);
  const smdBefore = (high[1] - high[0]) / scale;
  const smdAfter = (results[1].weighted.high - results[0].weighted.high) / scale;
  return { rows, results, smdBefore, smdAfter };
}

const target = $("#weight-target");
const followup = $("#weight-followup");
const clip = $("#weight-cutoff");
const number = value => decimal(value, 0);

function update() {
  const cutoff = Number(clip.value);
  const { rows, results, smdBefore, smdAfter } = weighting(target.value, followup.value, cutoff);
  const [control, treated] = results;
  $("#weight-cohort").innerHTML = table(
    ["Stratum and arm", "Assigned units", "Observed / assigned", "Observed events", "Treatment weight per unit", "Joint weight per observed unit"],
    rows.flatMap(({ label, e, arms }) => arms.map((cell, arm) => [
      `${label} · ${arm ? "Treated" : "Control"} (e = ${decimal(e, 1)})`,
      number(cell.n), `${number(cell.observed)} / ${number(cell.n)}`, number(cell.yObserved),
      `${decimal(cell.raw)} → ${decimal(cell.weight)}`, `${decimal(cell.joint)} → ${decimal(Math.min(cutoff, cell.joint))}`,
    ])), "Synthetic cohort · 200 eligible units. Weights before → after clipping");
  $("#weight-diagnostics").innerHTML = table(["Diagnostic", "Control", "Treated", "Treated − control"], [
    ["High stratum before treatment weighting", ...results.map(r => percent(r.unweightedHigh)), signed(smdBefore, 3) + " SMD"],
    ["High stratum after treatment weighting", ...results.map(r => percent(r.weighted.high)), signed(smdAfter, 3) + " SMD"],
    ["Treatment weight ESS (assigned)", ...results.map(r => decimal(r.weighted.ess, 1)), "—"],
    ["Joint weight ESS (observed)", ...results.map(r => decimal(r.joint.ess, 1)), "—"],
    ["Treatment weight maximum after clipping", ...results.map(r => decimal(r.max)), "—"],
    ["Joint weight maximum after clipping", ...results.map(r => decimal(r.maxJoint)), "—"],
    ["Assigned / observed with weight clipped", ...results.map(r => `${r.clipped} / ${r.jointClipped}`), "—"],
  ], "Weighted diagnostics");
  const targetName = target.value.toUpperCase();
  $("#weight-summary").textContent =
    `Target ${targetName}. ${treated.assigned} treated of 200 eligible and ${control.observed + treated.observed} outcomes observed. ` +
    `Raw observed gap ${points(treated.complete.mean - control.complete.mean)}. Treatment-weighted gap ${points(treated.treatment.mean - control.treatment.mean)}. ` +
    (Number.isFinite(cutoff) ? `Weights capped at ${cutoff}.` : "Weights are uncapped.");
  const estimates = [
    ["Complete-case raw gap", ...results.map(r => r.complete.mean)],
    ["Treatment weighting only", ...results.map(r => r.treatment.mean)],
    ["Joint treatment and observation weighting", ...results.map(r => r.joint.mean)],
    ["Augmented mean · uncapped probabilities", ...results.map(r => r.augmented)],
    [`Known ${targetName} · simulation only`, ...results.map(r => r.truth)],
  ];
  $("#weight-missing").innerHTML = table(["Estimator", "Control mean", "Treated mean", "Difference"],
    estimates.map(([name, c, t]) => [name, percent(c), percent(t), points(t - c)]),
    `Arm means and contrasts for the ${targetName} exercise`);
  $("#weight-missing-status").textContent = `${control.observed + treated.observed} of 200 eligible outcomes observed. ` + ({
    complete: "Everyone is observed. Joint and treatment weights are identical.",
    mar: "Observation varies with baseline stratum and is independent of outcome within each arm and stratum. The uncapped joint and augmented estimates recover the known contrast.",
    mnar: "Among treated units, outcomes are less often observed after an event. The baseline-only observation probabilities cannot recover the missing event risks. Consider bounds or an explicit sensitivity model.",
  })[followup.value];
}
for (const input of [target, followup, clip]) input.addEventListener("change", update);
update();
