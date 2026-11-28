import { normalQuantile } from "./experiment-stats.js";
import { $, decimal, integer, interval, percent, points, signed, table } from "./experiment-tools.js";

const profiles = ["Low activity", "High activity"];
const development = [
  [1, 0, 0, 0], [1, 0, 1, 0], [1, 1, 1, 1], [1, 1, 0, 0],
  [2, 0, 0, 0], [2, 0, 1, 1], [2, 1, 1, 1], [2, 1, 1, 0],
  [3, 0, 0, 1], [3, 0, 0, 0], [3, 1, 0, 1], [3, 1, 1, 1],
].map(([fold, profile, treatment, outcome], i) => ({ id: `D-${i + 1}`, fold, profile, treatment, outcome }));

// Frozen within-profile means from the other two folds, ordered as [e(X), m(X)].
const nuisance = [
  [[.25, .50], [.75, .75]],
  [[.25, .25], [.50, .75]],
  [[.50, .25], [.75, .50]],
];

export function foldTrace(fold) {
  return {
    trained: development.filter(row => row.fold !== fold),
    scored: development.filter(row => row.fold === fold).map(row => {
      const [e, m] = nuisance[fold - 1][row.profile];
      return { ...row, e, m };
    }),
  };
}

const heldout = [
  [
    { tenure: "Early", control: [800, 80], treated: [200, 24] },
    { tenure: "Established", control: [400, 80], treated: [600, 144] },
  ],
  [
    { tenure: "Early", control: [700, 105], treated: [300, 72] },
    { tenure: "Established", control: [300, 90], treated: [700, 315] },
  ],
];
const models = { aligned: [.035, .12], inflated: [.085, .20] };
const value = 100;
const currency = value => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function evaluateProfile(strata) {
  const total = strata.reduce((sum, { control, treated }) => sum + control[0] + treated[0], 0);
  let effect = 0;
  let variance = 0;
  for (const { control: [n0, y0], treated: [n1, y1] } of strata) {
    const share = (n0 + n1) / total;
    const p0 = y0 / n0;
    const p1 = y1 / n1;
    effect += share * (p1 - p0);
    variance += share ** 2 * (p0 * (1 - p0) / n0 + p1 * (1 - p1) / n1);
  }
  const margin = normalQuantile(.975) * Math.sqrt(variance);
  return {
    total, effect, low: effect - margin, high: effect + margin,
    minPropensity: Math.min(...strata.map(({ control, treated }) => treated[0] / (control[0] + treated[0]))),
    maxPropensity: Math.max(...strata.map(({ control, treated }) => treated[0] / (control[0] + treated[0]))),
  };
}

const fold = $("#target-fold");
const unit = $("#target-unit");
const cost = $("#target-cost");
const model = $("#target-model");

function updateTrace() {
  const selected = foldTrace(Number(fold.value)).scored.find(row => row.id === unit.value);
  const { id, profile, treatment, outcome, e, m } = selected;
  $("#target-residual").textContent = `${id}, ${profiles[profile]} (T = ${treatment}, Y = ${outcome}). ` +
    `The outcome prediction m(X) = ${decimal(m)} gives Y − m(X) = ${signed(outcome - m)}. ` +
    `The treatment prediction e(X) = ${decimal(e)} gives T − e(X) = ${signed(treatment - e)}.`;
}

function updateFold() {
  const { trained, scored } = foldTrace(Number(fold.value));
  unit.replaceChildren(...scored.map(row => new Option(row.id, row.id)));
  const rows = [...scored, ...trained].map(row => [
    row.id, row.fold, `${row.e === undefined ? "Training" : '<span class="causal-highlight">Scored</span>'}`,
    profiles[row.profile], row.treatment, row.outcome, row.e === undefined ? "—" : decimal(row.e), row.m === undefined ? "—" : decimal(row.m),
  ]);
  $("#target-training").innerHTML = table(["Unit", "Fold", "Role", "Profile", "T", "Y", "e(X)", "m(X)"], rows);
  updateTrace();
}

function updatePolicy() {
  const estimates = heldout.map(evaluateProfile);
  const predictions = models[model.value];
  const valid = cost.validity.valid && Number.isFinite(cost.valueAsNumber);
  const price = cost.valueAsNumber;
  const contact = predictions.map(prediction => valid && prediction * value > price);
  const n = estimates.reduce((sum, item) => sum + item.total, 0);
  const gain = estimates.reduce((sum, item, i) => sum + (contact[i] ? item.total / n * (item.effect * value - price) : 0), 0);
  $("#target-policy").textContent = valid
    ? `Ranking stays high activity first. Contact ${contact.filter(Boolean).length} of 2 profiles. Held-out adjusted policy value is ${currency(gain)} per eligible unit relative to contacting nobody.`
    : "Enter an intervention cost between $0 and $100.";
  $("#target-evaluation").innerHTML = table(
    ["Profile (rank)", "Held-out units", "Within-tenure treatment support", "Predicted lift", "Adjusted held-out lift (95% CI)", "Predicted net per contact", "Held-out net per contact", "Model decision"],
    [1, 0].map(i => {
      const item = estimates[i];
      return [`${profiles[i]} (${2 - i})`, integer(item.total), `${percent(item.minPropensity)}–${percent(item.maxPropensity)}`, points(predictions[i]),
        `${points(item.effect)} (${interval(item)} pp)`, valid ? currency(predictions[i] * value - price) : "—",
        valid ? currency(item.effect * value - price) : "—", valid ? (contact[i] ? "Contact" : "Skip") : "—"];
    }), "Prespecified held-out comparisons");
}

$("#target-support").innerHTML = table(["Profile and tenure", "Control outcomes / units", "Treated outcomes / units"],
  heldout.flatMap((strata, i) => strata.map(({ tenure, control: [n0, y0], treated: [n1, y1] }) =>
    [`${profiles[i]} · ${tenure}`, `${y0} / ${n0}`, `${y1} / ${n1}`])));
fold.addEventListener("change", updateFold);
unit.addEventListener("change", updateTrace);
model.addEventListener("change", updatePolicy);
cost.addEventListener("input", updatePolicy);
updateFold();
updatePolicy();
