import { binaryContrast, blockContrast, missingBounds, normalQuantile, smd } from "./experiment-stats.js";
import { $, all, blue, gold, integer, interval, intervalChart, mint, percent, points, probability, signed, sizingForm, table } from "./experiment-tools.js";
import { arms, bands, simulateCase, summarize } from "./experiment-case-data.js";

const design = $("#case-design");
const readSize = sizingForm(design);
const feedback = $("#design-feedback");
const log = $("#case-log");
const lookup = $("#case-id");
const challenge = $("#case-challenge");
const reportForm = $("#case-report-form");
const checkReport = $("#case-report-result");
const original = signature();
let run = null;
let seed = 724713;

const prompts = {
  estimand: ["assignment", "Carry the enrolled offer ITT into the design. It includes accounts that never open the offer.",
    "The historical ATT describes takers under a different intervention. Opening also happens after offer assignment. Choose the effect of offering to the full enrolled population."],
  sizing: ["zero", "This planning calculation powers a comparison against zero at the specified MDE. Check break-even separately in the report.",
    "The MDE is the assumed alternative for a test against zero. Power to establish lift above break-even would require a design that treats break-even as the null benchmark."],
  audit: ["known", "Use the known assignment probability and reconcile the log with the ledger. Any residual baseline differences can occur by chance.",
    "The ledger establishes the randomized probability. Fitting a propensity to a damaged log can obscure a recording defect."],
};

function updatePrompt(input) {
  const key = input.dataset.casePrompt;
  const [answer, correct, incorrect] = prompts[key];
  document.getElementById(`case-prompt-${key}`).textContent = input.value ? input.value === answer ? correct : incorrect : "";
}
for (const input of all("[data-case-prompt]")) input.addEventListener("change", () => updatePrompt(input));

function signature() {
  return JSON.stringify([...new FormData(design)].map(([name, value]) =>
    design.elements[name].type === "number" ? Number(value) : value));
}

function setStep(step, enabled) {
  $("[data-case-gate=" + step + "]").hidden = enabled;
  $("[data-case-content=" + step + "]").hidden = !enabled;
}

function clearRun() {
  run = null;
  for (const step of ["audit", "analysis", "challenge", "report"]) setStep(step, false);
  for (const id of ["locked-design", "case-audit-summary", "case-audit-table", "case-balance", "case-ledger",
    "case-conversions", "case-analysis-summary", "case-estimates", "case-challenge-summary", "case-challenge-result",
    "case-benchmarks", "case-report-facts", "case-report-draft", "case-report-result", "case-band-effects",
    "case-assumption-feedback", "case-replay-status"]) {
    document.getElementById(id).replaceChildren();
  }
  reportForm.reset();
  $("#media-transfer-form").reset();
  $("#media-transfer-result").replaceChildren();
  log.value = "intact";
  lookup.value = "";
  challenge.value = "assigned";
  $("#case-challenge-assumption").value = "";
  $("#case-replay-actions").hidden = true;
  const auditPrompt = $("[data-case-prompt=audit]");
  auditPrompt.value = "";
  updatePrompt(auditPrompt);
  $("#reveal-outcomes").disabled = false;
}

function lock() {
  const size = readSize();
  const threshold = design.elements.threshold.valueAsNumber / 100;
  if (!size || !(threshold >= -1 && threshold <= 1)) {
    feedback.textContent = "Enter a valid design and a break-even threshold between −100 and +100 points.";
    return false;
  }
  if (design.elements.stopping.value !== "fixed") {
    feedback.textContent = "This experiment uses fixed-horizon inference. Choose the enrollment target and finish follow-up before analysis. Outcome-triggered stopping requires a prespecified sequential design.";
    return false;
  }
  if (size.enrollment[0] < 2 || size.total > 50000) {
    feedback.textContent = "This simulation needs at least two accounts per arm for two activity bands and supports up to 50,000 accounts. The sizing tab can show larger planning estimates.";
    return false;
  }
  clearRun();
  const worked = signature() === original;
  const plan = { ...size, threshold, primary: design.elements.primary.value, worked };
  run = { plan, rows: simulateCase(plan, worked, seed++), revealed: false };
  setStep("audit", true);
  feedback.textContent = worked ? "Worked trial locked. The same accounts and assignments are restored on every reset." : "Fresh simulated trial locked and assigned.";
  $("#locked-design").innerHTML = table(["Commitment", "Locked plan"], [
    ["Population and outcome", "Eligible enrolled accounts, 30-day conversion from assignment"],
    ["Planning baseline, MDE and break-even", `${percent(plan.baseline)}, ${points(plan.mde)} MDE, ${points(threshold)} break-even`],
    ["Two-sided alpha and target power", `${percent(plan.alpha)} and ${percent(plan.power)}`],
    ["Enrollment", `${integer(plan.enrollment[0])} per arm, ${integer(plan.total)} total, ${percent(plan.loss)} expected missing`],
    ["Allocation and stopping", `1:1 within each baseline activity band. Recruit to target (about ${integer(plan.recruitment)} days), then finish 30-day follow-up.`],
    ["Primary analysis", primaryName(plan)],
  ]);
  audit();
  return true;
}

function primaryName(plan) {
  return plan.primary === "block" ? "Block-adjusted linear probability model (HC2)" : "Unadjusted Newcombe risk difference";
}

function classify() {
  const activity = $("#classify-activity").value;
  const uptake = $("#classify-uptake").value;
  $("#comparison-feedback").textContent = !activity || !uptake ? ""
    : activity === "baseline" && uptake === "post"
      ? "Correct. Pre-assignment activity can define blocks. Uptake happens after assignment and can change which accounts enter a comparison."
      : "Use the timing of assignment. Prior activity is available at enrollment. Opening the new offer can happen only after assignment.";
}
for (const input of all("#define-comparison select")) input.addEventListener("change", classify);

design.addEventListener("submit", event => {
  event.preventDefault();
  if (lock()) $("#case-log").focus();
});
design.addEventListener("input", () => {
  if (!run) return;
  clearRun();
  feedback.textContent = "Design edited. Lock it to create a fresh trial.";
});
design.addEventListener("reset", () => {
  clearRun();
  for (const input of all("#define-comparison select")) input.selectedIndex = 0;
  for (const input of all("[data-case-prompt]")) {
    input.value = "";
    updatePrompt(input);
  }
  classify();
  requestAnimationFrame(() => {
    if (lock()) feedback.textContent = "Worked trial restored. Audit its original assignment before revealing outcomes.";
  });
});

function audit() {
  if (!run) return;
  const { rows, revealed } = run;
  const replay = log.value === "dropped";
  const dropped = replay ? rows.filter(row => row.arm === 1 && row.block === 1).slice(0, 6) : [];
  const droppedIds = new Set(dropped.map(row => row.id));
  const logged = rows.filter(row => !droppedIds.has(row.id));
  const ids = new Set(logged.map(row => row.id));
  const status = $("#case-audit-summary");
  status.textContent = replay
    ? `${integer(rows.length)} entries in the allocation ledger. The logging replay lost ${integer(dropped.length)} distinct higher-band offer IDs (${dropped[0]?.id ?? "—"} is the first). The eligibility list and allocation ledger still agree. Which join or delivery step could have dropped them? Trace the logging discrepancy before relying on a causal comparison.`
    : `${integer(ids.size)} distinct logged IDs for ${integer(rows.length)} eligible assigned accounts. No duplicates. Counts meet the ledger quotas in both bands.`;
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
  const query = lookup.value.trim().toUpperCase();
  const visible = query ? rows.filter(row => row.id === query) : rows.filter((_, i) => i < 4 || i >= rows.length - 4);
  $("#case-ledger").innerHTML = visible.length ? table(["Account ID", "Band", "Assigned arm", "In log?", "Baseline spend", "Tenure"],
    visible.map(row => [row.id, bands[row.block], arms[row.arm], ids.has(row.id) ? "Yes" : "Missing", row.spend, row.tenure]),
    query ? "Matching assignment" : "First and last four assignments") : "<p>No account matches that ID.</p>";
  if (query) $("#case-ledger").closest("details").open = true;
  $("#reveal-outcomes").disabled = replay || revealed;
}
log.addEventListener("change", audit);
lookup.addEventListener("input", audit);

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
  if (!run || log.value !== "intact" || run.revealed) return;
  const { plan, rows } = run;
  const results = estimateTrial(rows, plan);
  const { totals: [c, t], hasMissing, crude, blocked, primary, strata } = results;
  run.revealed = true;
  run.results = results;
  for (const step of ["analysis", "challenge", "report"]) setStep(step, true);
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
    ? "Some assigned accounts have unobserved outcomes. These observed-case calculations can target a different population, even when arm completeness looks similar. Use full-cohort bounds in the challenges."
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
  if (!run?.revealed) return;
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
  summary.textContent = `In this replay, ${integer(shared.length)} control accounts convert after receiving a shared link from another account. The observed contrast becomes ${difference}. How would exposure differ under full rollout? Beneficial or competitive spillovers can change the comparison in either direction depending on which accounts are affected.`;
  result.innerHTML = conversionTable(copy, "Simulated exposure to other accounts’ offers");
}
challenge.addEventListener("change", () => {
  $("#case-challenge-assumption").value = "";
  $("#case-assumption-feedback").replaceChildren();
  runChallenge();
});

const assumptions = {
  assigned: ["none", "Assignment still defines the arms. Accounts remain in those arms even when they never open the offer."],
  takers: ["population", "The offer group is restricted to openers, a post-assignment selection. Randomization supplies comparability between assigned arms."],
  missing: ["observation", "The assigned cohort is unchanged. The replay removes outcome records based on conversion, violating missing at random given assignment and baseline."],
  spillover: ["interference", "Another account’s assigned offer can affect a control account’s outcome, violating the no-interference assumption."],
};
$("#case-challenge-assumption").addEventListener("change", event => {
  const [answer, feedback] = assumptions[challenge.value];
  $("#case-assumption-feedback").textContent = event.target.value
    ? event.target.value === answer ? feedback : "Check which records or outcomes changed in this view." : "";
});

function changeReport(replay) {
  run.reportReplay = replay ? run.missingReplay : null;
  reportForm.reset();
  checkReport.replaceChildren();
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
    negative: "The interval puts the break-even threshold above the plausible lift.",
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

const threats = {
  selection: "Restricting the offer arm to openers can select accounts with different baseline conversion chances.",
  missing: "Selective loss of conversion records can change the full-cohort lift and the break-even decision.",
  spillover: "Offer sharing can change control outcomes and alter the effect expected under full rollout.",
};

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
  $("#case-label-zero").textContent = `${label} vs. zero`;
  $("#case-label-threshold").textContent = `${label} vs. break-even`;
  $("#case-report-bounds").hidden = !hasMissing;
  $("#case-report-bounds").disabled = !hasMissing;
  $("#case-report-chart").hidden = !primary;
  $("#case-benchmarks").textContent = primary
    ? `${label}. The dotted amber marker is zero effect. The dashed blue marker is break-even at ${points(plan.threshold)}.`
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
  if (bounds) {
    draft += ` The observed-case comparison describes accounts with recorded outcomes. Extending it to the enrolled cohort would require assumptions about the missing outcomes. Binary bounds for the realized full-cohort difference run from ${points(bounds.low)} to ${points(bounds.high)} and carry no population sampling confidence level.`;
  }
  if (run.reportReplay) draft = "Missing-outcome replay. " + draft;
  run.reportDraft = draft;
  $("#case-report-draft").textContent = run.reportDraft;
}

reportForm.addEventListener("change", () => {
  checkReport.textContent = "";
  $("#case-report-draft").textContent = run.reportDraft;
});
reportForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!run?.revealed) return;
  const { primary, bounds } = reportEvidence();
  const threshold = run.plan.threshold;
  const intervalLabel = bounds ? "Observed-case interval" : "Primary interval";
  const checks = [
    ["zero", 0, "zero", primary, intervalLabel, reportSentences[0]],
    ["breakEven", threshold, "break-even", primary, intervalLabel, reportSentences[1]],
  ];
  if (bounds) checks.push(
    ["fullZero", 0, "zero", bounds, "Full-cohort bounds", boundSentences[0]],
    ["fullBreakEven", threshold, "break-even", bounds, "Full-cohort bounds", boundSentences[1]],
  );
  const feedback = [];
  const conclusions = checks.map(([field, benchmark, name, limits, label, sentences]) => {
    const answer = position(limits, benchmark);
    if (reportForm.elements[field].value !== answer) {
      feedback.push(limits ? `${label} vs. ${name} (${points(benchmark)}): compare both ends (${interval(limits)} pp).` : `${label} is unavailable.`);
    }
    return sentences[answer];
  });
  const threat = threats[reportForm.elements.threat.value];
  if (!threat) feedback.push("Choose one threat to include in the report.");
  if (feedback.length) {
    checkReport.textContent = feedback.join("\n");
    return;
  }
  const intervalConclusion = (bounds ? "Observed-case interpretation. " : "") + conclusions.slice(0, 2).join(" ");
  const fullCohort = bounds ? ` ${conclusions.slice(2).join(" ")}` : "";
  $("#case-report-draft").textContent = `${run.reportDraft}\n\n${intervalConclusion}${fullCohort} ${threat}`;
  checkReport.textContent = `Report complete. ${intervalConclusion}${fullCohort}`;
});

$("#reveal-outcomes").addEventListener("click", () => {
  analyze();
  $("#estimate-effect h2").tabIndex = -1;
  $("#estimate-effect h2").focus();
});

const direct = location.hash.slice(1);
if (["assign-and-audit", "estimate-effect", "challenge-conclusion", "report-decision"].includes(direct) && lock()) {
  if (direct !== "assign-and-audit") analyze();
}
