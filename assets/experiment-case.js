import { binaryContrast, blockContrast, missingBounds, normalP, normalQuantile, smd } from "./experiment-stats.js";
import { $, blue, count, gold, integer, interval, intervalChart, mint, percent, points, probability, signed, sizingForm, table } from "./experiment-tools.js";
import { arms, bands, simulateCase, summarize } from "./experiment-case-data.js";

const design = $("#case-design");
const readSize = sizingForm(design);
const feedback = $("#design-feedback");
const log = $("#case-log");
const challenge = $("#case-challenge");
const original = signature();
let run = null;
let seed = 724713;

function signature() {
  return JSON.stringify([...new FormData(design)].map(([name, value]) =>
    design.elements[name].type === "number" ? Number(value) : value));
}

function updateDecisionPower() {
  const size = readSize();
  const threshold = design.elements.threshold.valueAsNumber / 100;
  const target = $("#case-decision-power");
  if (!size || !(threshold >= -1 && threshold <= 1)) {
    target.textContent = "Enter a valid design and break-even threshold.";
    return;
  }
  const [n0, n1] = size.outcomes;
  const p0 = size.baseline;
  const critical = normalQuantile(1 - size.alpha / 2);
  const effects = [...new Set([0, size.mde, threshold, threshold + .025, threshold + .05])].sort((a, b) => a - b);
  const rows = effects.map(effect => {
    const p1 = p0 + effect;
    if (!(p1 >= 0 && p1 <= 1)) return [points(effect), "Outside the feasible range"];
    if (Math.min(p0, 1 - p0) * n0 < 10 || Math.min(p1, 1 - p1) * n1 < 10) {
      return [points(effect), "Too sparse for this approximation"];
    }
    const se = Math.sqrt(p0 * (1 - p0) / n0 + p1 * (1 - p1) / n1);
    const z = (threshold - effect) / se + critical;
    const probability = normalP(z) / 2;
    return [points(effect), percent(z >= 0 ? probability : 1 - probability)];
  });
  target.innerHTML = table(["Assumed true lift", "Probability lower limit exceeds break-even"], rows);
}

design.addEventListener("input", updateDecisionPower);
design.addEventListener("reset", () => requestAnimationFrame(updateDecisionPower));
updateDecisionPower();

function showResults(enabled) {
  $("[data-case-gate]").hidden = enabled;
  for (const section of document.querySelectorAll("[data-case-content]")) section.hidden = !enabled;
}

function clearRun() {
  run = null;
  showResults(false);
  for (const id of ["locked-design", "case-audit-summary", "case-audit-table", "case-balance", "case-ledger",
    "case-conversions", "case-analysis-summary", "case-estimates", "case-challenge-summary", "case-challenge-result",
    "case-benchmarks", "case-report-facts", "case-report-draft", "case-band-effects", "case-replay-status"]) {
    document.getElementById(id).replaceChildren();
  }
  log.value = "intact";
  challenge.value = "assigned";
  $("#case-replay-actions").hidden = true;
}

function lock() {
  const size = readSize();
  const threshold = design.elements.threshold.valueAsNumber / 100;
  if (!size || !(threshold >= -1 && threshold <= 1)) {
    feedback.textContent = "Enter a valid design and a break-even threshold between −100 and +100 points.";
    return false;
  }
  if (size.enrollment[0] < 2 || size.total > 50000) {
    feedback.textContent = "This simulation needs at least two accounts per arm for two activity bands and supports up to 50,000 accounts. The sizing estimate above still applies to larger designs, and the Binary outcomes tab on Sample Size & Power uses the same calculation.";
    return false;
  }
  clearRun();
  const worked = signature() === original;
  const plan = { ...size, threshold, primary: design.elements.primary.value, worked };
  run = { plan, rows: simulateCase(plan, worked, seed++) };
  showResults(true);
  feedback.textContent = worked ? "Fixed worked example." : "New simulated trial.";
  $("#locked-design").innerHTML = table(["Commitment", "Locked plan"], [
    ["Population and outcome", "Eligible enrolled accounts, 30-day conversion from assignment"],
    ["Planning baseline, MDE and break-even", `${percent(plan.baseline)}, ${points(plan.mde)} MDE, ${points(threshold)} break-even`],
    ["Two-sided alpha and target power", `${percent(plan.alpha)} and ${percent(plan.power)}`],
    ["Enrollment", `${integer(plan.enrollment[0])} per arm, ${integer(plan.total)} total, ${percent(plan.loss)} expected missing`],
    ["Allocation and stopping", `1:1 within each baseline activity band. Recruit to target (about ${count(plan.recruitment, "day")}), then finish 30-day follow-up.`],
    ["Primary analysis", primaryName(plan)],
  ]);
  analyze();
  return true;
}

function primaryName(plan) {
  return plan.primary === "block" ? "Block-adjusted linear probability model (HC2)" : "Unadjusted Newcombe risk difference";
}

design.addEventListener("submit", event => {
  event.preventDefault();
  lock();
});
design.addEventListener("input", () => {
  if (!run) return;
  clearRun();
  feedback.textContent = "Run the simulation to use the edited design.";
});
design.addEventListener("reset", () => {
  clearRun();
  requestAnimationFrame(lock);
});

function audit() {
  if (!run) return;
  const { rows } = run;
  const replay = log.value === "dropped";
  const dropped = replay ? rows.filter(row => row.arm === 1 && row.block === 1).slice(0, 6) : [];
  const droppedIds = new Set(dropped.map(row => row.id));
  const logged = rows.filter(row => !droppedIds.has(row.id));
  const status = $("#case-audit-summary");
  status.textContent = replay
    ? `${integer(dropped.length)} of ${integer(rows.length)} assigned accounts are missing from the assignment log, all in the higher-activity offer group. The ledger still lists every assignment, so the estimates below are unchanged.`
    : `All ${integer(rows.length)} assigned accounts appear in the assignment log. There are no duplicate IDs or discrepancies with the ledger.`;
  const ledgerCounts = [];
  for (let block = 0; block < bands.length; block++) {
    const assigned = summarize(rows.filter(row => row.block === block));
    const seen = summarize(logged.filter(row => row.block === block));
    ledgerCounts.push([bands[block], ...arms.map((_, arm) => `${integer(seen[arm].n)} / ${integer(assigned[arm].n)}`)]);
  }
  const assignedTotal = summarize(rows);
  const loggedTotal = summarize(logged);
  ledgerCounts.push(["All", ...arms.map((_, arm) => `${integer(loggedTotal[arm].n)} / ${integer(assignedTotal[arm].n)}`)]);
  $("#case-audit-table").innerHTML = table(["Baseline activity", "Control logged / ledger", "Offer logged / ledger"], ledgerCounts);
  const traits = [["Higher activity (indicator)", row => row.block], ["Prior spend", row => row.spend], ["Tenure (months)", row => row.tenure]];
  $("#case-balance").innerHTML = table(["Baseline trait", "Offer − control SMD"],
    traits.map(([label, trait]) => {
      const value = smd(...arms.map((_, arm) => rows.filter(row => row.arm === arm).map(trait)));
      return [label, value === null ? "Undefined" : signed(value, 3)];
    }), "Composition on the full assignment ledger");
  $("#case-ledger").innerHTML = replay ? table(["Account ID", "Baseline activity", "Assigned arm", "Prior spend", "Tenure (months)"],
    dropped.map(row => [row.id, bands[row.block], arms[row.arm], row.spend, row.tenure]),
    "Assignments missing from the log", { layout: "stack" }) : "";
}
log.addEventListener("change", audit);

function conversionTable(rows, caption) {
  return table(["Activity and arm", "Assigned", "Opened offer", "Observed", "Converted", "Missing"],
    [...bands, "All"].flatMap((label, block) => summarize(rows.filter(row => block === bands.length || row.block === block)).map(
      (arm, i) => [`${label} · ${arms[i]}`, ...[arm.n, arm.uptake, arm.observed, arm.successes, arm.missing].map(integer)],
    )), caption);
}

function estimateTrial(rows, plan) {
  const totals = summarize(rows);
  const [c, t] = totals;
  const hasMissing = c.missing + t.missing > 0;
  let crude = null;
  let blocked = null;
  if (c.observed && t.observed) crude = binaryContrast(c.successes, c.observed, t.successes, t.observed, plan.alpha);
  const strata = bands.map((_, i) => summarize(rows.filter(row => row.block === i)).map(arm => ({
    n: arm.observed, x: arm.successes,
  })));
  if (strata.every(cell => cell.every(arm => arm.n > 0))) {
    blocked = blockContrast(strata.map(([left, right]) => ({ n0: left.n, n1: right.n, x0: left.x, x1: right.x })), plan.alpha).fixed;
  }
  const primary = plan.primary === "block" ? blocked : crude;
  const hasInterval = primary && Number.isFinite(primary.low) && Number.isFinite(primary.high) && (plan.primary !== "block" || primary.se > 0);
  return { totals, hasMissing, crude, blocked, strata, primary: hasInterval ? primary : null };
}

function analyze() {
  const { plan, rows } = run;
  const results = estimateTrial(rows, plan);
  const { totals: [c, t], hasMissing, crude, blocked, primary, strata } = results;
  run.results = results;
  audit();

  const level = confidence(plan);
  $("#case-conversions").innerHTML = conversionTable(rows, hasMissing ? "Missing outcomes have no follow-up record" : "Complete 30-day follow-up");
  const estimateRows = [];
  if (crude) {
    estimateRows.push(
      ["Control conversion", percent(crude.control.rate), interval(crude.control) + "%", "—", "Wilson"],
      ["Offer conversion", percent(crude.offer.rate), interval(crude.offer) + "%", "—", "Wilson"],
    );
  }
  const contrastRows = [
    ["Block-adjusted difference", blocked, "HC2 normal", plan.primary === "block"],
    ["Unadjusted difference", crude, "Newcombe CI / pooled z-test", plan.primary === "crude"],
  ];
  for (const [label, result, method, chosen] of contrastRows) {
    const usable = result && Number.isFinite(result.low) && (method !== "HC2 normal" || result.se > 0);
    estimateRows.push([label + (chosen ? " (primary)" : ""), result ? points(result.effect) : "—",
      usable ? interval(result) + " pp" : "Unavailable", usable ? probability(result.p) : "—", method]);
  }
  $("#case-estimates").innerHTML = table(["Quantity", "Estimate", `${level} interval`, "Two-sided p", "Method"], estimateRows);
  $("#case-analysis-summary").textContent = hasMissing
    ? "Some assigned accounts have unobserved outcomes. These observed-case calculations can target a different population, even when arm completeness looks similar. Use the full-cohort bounds in Threats to the estimate."
    : `Analyze all ${integer(c.n + t.n)} assigned accounts. ${primary ? `The primary ITT estimate is ${points(primary.effect)} (${level} CI ${interval(primary)} pp).` : "The primary method cannot supply an interval for these data."}`;
  renderBands(strata, plan, hasMissing);
  runChallenge();
  renderReport();
}

function renderBands(strata, plan, hasMissing) {
  const comparisons = strata.map(([c, t]) => c.n && t.n ? binaryContrast(c.x, c.n, t.x, t.n, plan.alpha) : null);
  const rows = comparisons.map((contrast, i) => [bands[i] + " activity",
    contrast ? points(contrast.effect) : "Unavailable", contrast ? interval(contrast) + " pp · Newcombe" : "An arm has no observed outcomes"]);
  if (strata.flat().every(cell => cell.n > 1)) {
    const effect = comparisons[1].effect - comparisons[0].effect;
    const variance = strata.flat().reduce((sum, { x, n }) => {
      const rate = x / n;
      return sum + rate * (1 - rate) / (n - 1);
    }, 0);
    const margin = normalQuantile(1 - plan.alpha / 2) * Math.sqrt(variance);
    rows.push(["Higher − lower activity effects", points(effect),
      margin > 0 ? interval({ low: effect - margin, high: effect + margin }) + " pp · normal" : "Unavailable · estimated variance is zero"]);
  } else {
    rows.push(["Higher − lower activity effects", "Unavailable", "An arm has fewer than two outcomes"]);
  }
  $("#case-band-effects").innerHTML = table(["Exploratory comparison", "Estimate", `${confidence(plan)} interval`],
    rows, hasMissing ? "Observed-case differences by baseline band" : "Assignment effects by baseline band");
}

function confidence(plan) {
  return `${+(100 * (1 - plan.alpha)).toFixed(4)}%`;
}

function completeRate(arm) {
  return arm.observed ? percent(arm.successes / arm.observed) : "Unavailable";
}

function runChallenge() {
  if (!run?.results) return;
  const { rows, results } = run;
  const result = $("#case-challenge-result");
  const summary = $("#case-challenge-summary");
  const mode = challenge.value;
  $("#case-replay-actions").hidden = mode !== "missing" && !run.reportReplay;
  $("#case-report-replay").hidden = mode !== "missing" || Boolean(run.reportReplay);
  $("#case-report-original").hidden = !run.reportReplay;
  if (mode === "assigned") {
    const [control, offer] = results.totals;
    const first = offer.uptake / offer.n - control.uptake / control.n;
    summary.textContent = `Opening increases by ${points(first)} across assigned arms (the first stage). Opening is downstream of assignment. Which accounts would be excluded if you analyzed only those who opened the offer?`;
    result.innerHTML = conversionTable(rows, "Uptake and follow-up are tracked separately");
    return;
  }
  if (mode === "takers") {
    const [control, takers] = summarize(rows.filter(row => row.arm === 0 || row.uptake));
    const contrast = control.observed && takers.observed ? points(takers.successes / takers.observed - control.successes / control.observed) : "unavailable";
    summary.textContent = `Takers versus controls gives ${contrast}. Selecting takers changes the offer arm and can open a path through baseline propensity to take the offer and convert. Which population does that comparison describe?`;
    result.innerHTML = table(["Group", "Accounts", "Observed", "Conversions", "Observed rate"],
      [["All controls", control], ["Offer takers", takers]].map(([name, counts]) =>
        [name, counts.n, counts.observed, counts.successes, completeRate(counts)]));
    return;
  }
  if (mode === "missing") {
    let counter = 0;
    const copy = rows.map(row => {
      if (row.arm !== 1 || row.converted !== 1) return row;
      counter++;
      return counter % 3 === 1 ? { ...row, converted: null, reason: "Offer conversion record hidden" } : row;
    });
    run.missingReplay = estimateTrial(copy, run.plan);
    const [c, t] = run.missingReplay.totals;
    const bound = missingBounds(c.successes, c.n, c.missing, t.successes, t.n, t.missing);
    const observed = c.observed && t.observed ? points(t.successes / t.observed - c.successes / c.observed) : "unavailable";
    summary.textContent = `Hide every third recorded offer conversion, starting with the first. The observed-case difference is ${observed}. Equal missingness rates can also hide selection, and differing rates alone do not tell you the direction of bias.`;
    result.innerHTML = conversionTable(copy, "Replay reasons: hidden offer conversions and any original unavailable follow-up") +
      table(["Missing-outcome scenario", "Full-cohort lift"],
        [["All missing control accounts convert, all missing offer accounts do not", points(bound.low)],
          ["All missing offer accounts convert, all missing control accounts do not", points(bound.high)]],
        "Without further outcome assumptions, these two cases bound the risk difference");
    return;
  }
  const copy = rows.map(row => ({ ...row }));
  const shared = copy.filter(row => row.arm === 0 && row.converted === 0).slice(0, Math.ceil(results.totals[0].n * .025));
  shared.forEach(row => { row.converted = 1; });
  const [c, t] = summarize(copy);
  const difference = c.observed && t.observed ? points(t.successes / t.observed - c.successes / c.observed) : "unavailable";
  summary.textContent = `In this replay, ${count(shared.length, "control account")} ${shared.length === 1 ? "converts" : "convert"} after receiving a shared link from another account. The observed contrast becomes ${difference}. How would exposure differ under full rollout? Beneficial or competitive spillovers can change the comparison in either direction depending on which accounts are affected.`;
  result.innerHTML = conversionTable(copy, "Simulated exposure to other accounts’ offers");
}
challenge.addEventListener("change", runChallenge);

function changeReport(replay) {
  run.reportReplay = replay ? run.missingReplay : null;
  $("#case-replay-status").textContent = replay ? "Report now uses a copy with selectively missing outcomes." : "Report restored to the original assigned cohort and follow-up.";
  runChallenge();
  renderReport();
  $(replay ? "#case-report-original" : "#case-challenge").focus();
}
$("#case-report-replay").addEventListener("click", () => changeReport(true));
$("#case-report-original").addEventListener("click", () => changeReport(false));

const position = (estimate, benchmark) => !estimate ? "unavailable"
  : estimate.low > benchmark ? "positive" : estimate.high < benchmark ? "negative" : "uncertain";

const reportSentences = [
  {
    positive: "The interval supports an increase in conversion.",
    negative: "The interval supports a decrease in conversion.",
    uncertain: "The interval includes zero, so the direction remains uncertain.",
    unavailable: "The primary interval is unavailable for judging an effect against zero.",
  },
  {
    positive: "The interval supports clearing break-even.",
    negative: "The interval lies below break-even.",
    uncertain: "The interval includes break-even and leaves the decision unresolved.",
    unavailable: "The primary interval is also unavailable for judging break-even.",
  },
];

const boundSentences = [
  {
    positive: "All full-cohort values allowed by the bounds are positive.",
    negative: "All full-cohort values allowed by the bounds are negative.",
    uncertain: "The direction of the full-cohort difference remains unresolved.",
  },
  {
    positive: "All full-cohort values allowed by the bounds clear break-even.",
    negative: "All full-cohort values allowed by the bounds fall short of break-even.",
    uncertain: "The full-cohort break-even decision remains unresolved.",
  },
];

function reportEvidence() {
  const results = run.reportReplay ?? run.results;
  const { totals: [c, t], hasMissing } = results;
  const bounds = hasMissing ? missingBounds(c.successes, c.n, c.missing, t.successes, t.n, t.missing) : null;
  return { ...results, bounds };
}

function renderReport() {
  const { plan } = run;
  const { totals: [c, t], hasMissing, primary, bounds } = reportEvidence();
  const level = confidence(plan);
  const label = hasMissing ? "Observed-case interval" : "Primary interval";
  $("#case-report-chart").hidden = !primary;
  $("#case-benchmarks").textContent = primary
    ? `${label}. The dotted amber marker is zero effect. The dashed violet marker is break-even at ${points(plan.threshold)}.`
    : `${label} unavailable.`;
  if (primary) {
    intervalChart($("#case-interval"), [{
      label: hasMissing ? "Observed case" : "Primary", estimate: primary.effect * 100, low: primary.low * 100, high: primary.high * 100, color: mint,
    }], [{ label: "Zero", value: 0, color: gold, dash: [2, 3] },
      { label: "Break-even", value: plan.threshold * 100, color: blue, dash: [7, 4] }]);
  }
  $("#case-report-facts").innerHTML = table(["Report field", "Control", "Offer", "Total"], [
    ["Planned enrollment", ...plan.enrollment.map(integer), integer(plan.total)],
    ["Actual enrollment", integer(c.n), integer(t.n), integer(c.n + t.n)],
    ["Observed 30-day outcomes", integer(c.observed), integer(t.observed), integer(c.observed + t.observed)],
    ["Observed conversions", integer(c.successes), integer(t.successes), integer(c.successes + t.successes)],
    ["Observed conversion", completeRate(c), completeRate(t), "—"],
  ]);
  let draft = `Among ${integer(c.n + t.n)} enrolled eligible accounts, ${integer(c.observed + t.observed)} had 30-day follow-up. ${completeRate(t)} of offer accounts with observed outcomes converted, compared with ${completeRate(c)} of controls.`;
  if (!hasMissing && c.observed && t.observed) {
    draft = `Among ${integer(c.n + t.n)} enrolled accounts with complete 30-day follow-up, ${completeRate(t)} of accounts offered the promotion converted, compared with ${completeRate(c)} of controls.`;
  }
  if (primary) {
    const description = plan.primary === "block" ? "block-adjusted" : "unadjusted Newcombe";
    draft += ` The estimated ${hasMissing ? "observed-case difference" : "ITT"} was ${signed(primary.effect * 100)} percentage points (${description} ${level} CI ${interval(primary)}, two-sided ${plan.primary === "crude" ? "pooled z-test " : ""}p ${primary.p !== null && primary.p < .0001 ? "" : "= "}${probability(primary.p)}).`;
  }
  if (run.reportReplay) draft = "Missing-outcome replay. " + draft;
  const intervalConclusion = reportSentences[0][position(primary, 0)] + " " + reportSentences[1][position(primary, plan.threshold)];
  draft += hasMissing ? " Among accounts with observed outcomes, " + intervalConclusion[0].toLowerCase() + intervalConclusion.slice(1)
    : " " + intervalConclusion;
  if (bounds) {
    draft += ` The observed-case comparison describes accounts with recorded outcomes. Extending it to the enrolled cohort would require assumptions about the missing outcomes. Binary bounds for the realized full-cohort difference run from ${points(bounds.low)} to ${points(bounds.high)} and carry no population sampling confidence level.`;
  }
  if (bounds) {
    draft += " " + boundSentences[0][position(bounds, 0)] + " " + boundSentences[1][position(bounds, plan.threshold)];
  }
  $("#case-report-draft").textContent = draft;
}

lock();
