import { $, axis, blue, chart, gold, intervalChart, muted, series, table } from "./experiment-tools.js";
import { dot, exposureSeries, fits, gaussianSummary, money, response, responseSlope, searchColor,
  second, signedMoney, study, studyFeature, sum, summarize, truth, updateLift, meta } from "./media-model.js";
import { points, ribbon } from "./media-charts.js";
import "./media-calibration-examples.js";

const fit = fits.balanced;
const studies = [study, second];
const features = studies.map(studyFeature);
const shortContrast = gaussianSummary(fit, studyFeature({ ...study, horizon: study.active }));
const challenge = $("#media-challenge");
const evidenceChoice = $("#media-evidence-choice");
const precision = $("#media-study-precision");
const secondStudy = $("#media-second-study");
const recordCut = $("#media-record-cut");
const revealCut = $("#media-reveal-cut");
const target = $("#media-response-target");
const allocation = $("#media-budget-search");
const reveal = $("#media-reveal-study");
const budget = 4400;
const current = 2200;
const finiteReturn = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intervals = result => `${signedMoney(result.low)} to ${signedMoney(result.high)}`;
const steadySpend = Array.from({ length: 19 }, (_, i) => 500 + 250 * i);
const grid = Array.from({ length: 15 }, (_, i) => 1500 + 100 * i);
const marketWeights = geos => fit.mean.map((_, i) => geos.includes(i - 4) ? 1 / geos.length : 0);
const eligible = marketWeights(study.geos);
const untested = marketWeights(meta.geos.map((_, i) => i).filter(i => !study.geos.includes(i)));
let best = current;
let revealed = false;
let cutPrediction = null;
let cutRevealed = false;

function readoutDate(test) {
  const date = new Date(test.weeks.at(-1) + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

const [start, , , endSpend, , endFollowup] = study.weeks;
$("#media-study-dates").textContent = `Increased-spend weeks start ${start} through ${endSpend}, followed by two weeks through the week of ${endFollowup}. Planning SE from two six-week pre-test windows is ${money(study.pretestSE)}. In this replay, the result becomes available on ${readoutDate(study)}.`;
$("#media-cut-schedule").textContent =
  `The cut starts ${second.weeks[0]} at a ${money(second.reference)} reference. It assigns ${money(second.plan)} per week for four weeks, then restores ${money(second.reference)} for two weeks. The study covers the same eligible markets under fixed Social spend. Its readout becomes available on ${readoutDate(second)}.`;
$("#media-study-table").innerHTML = table(["Pair", "Search increase", "Reference", "Delivered spend (increase / reference)", "Revenue (increase / reference)", "Revenue difference"],
  study.pairs.map((pair, i) => [i + 1, meta.geos[pair.treated], meta.geos[pair.control],
    `${money(pair.treatedSpend)} / ${money(pair.controlSpend)}`,
    `${money(pair.treatedRevenue)} / ${money(pair.controlRevenue)}`,
    signedMoney(pair.treatedRevenue - pair.controlRevenue)]), "Six-week totals by randomized pair");

function studyInterval(test, se) {
  return { low: test.estimate - test.critical * se, high: test.estimate + test.critical * se };
}
const spendDifference = study.active * (study.plan - study.reference);
const revenueInterval = studyInterval(study, study.se);
$("#media-study-result").textContent = `Lift ${signedMoney(study.estimate)} per market · Paired SE ${money(study.se)} · 95% paired t confidence interval ${intervals(revenueInterval)} · Finite incremental ROAS ${(study.estimate / spendDifference).toFixed(2)} (${(revenueInterval.low / spendDifference).toFixed(2)} to ${(revenueInterval.high / spendDifference).toFixed(2)}, 7 df).`;
$("#media-study-decision").textContent = `The six-week lift of ${money(study.estimate)} on ${money(spendDifference)} of additional spend per market implies ${money(.6 * study.estimate)} in contribution before media. The paired interval supports positive revenue lift. At 60% margin, break-even ROAS is ${(1 / .6).toFixed(2)} and lies inside the interval, leaving profitability unresolved.`;

function increaseFit() {
  const intact = challenge.value === "intact";
  const useFirst = revealed && intact && evidenceChoice.value === "use";
  const se = study.se * Number(precision.value);
  return { intact, useFirst, se, fit: useFirst ? updateLift(fit, features[0], study.estimate, se, 0) : fit };
}

function renderCalibration() {
  const { intact, useFirst, se: updatedSE, fit: afterFirst } = increaseFit();
  const firstDescription = intact
    ? "The full test matches the assigned schedules and the six-week window."
    : challenge.value === "spillover"
      ? "Cross-border exposure changes what the reference markets receive. Define the exposure across borders or obtain a clean comparison before using the row."
      : `Four-week follow-up omits the washout. The model’s history-only contrast for weeks 1–4 is ${signedMoney(shortContrast.mean)} (${intervals(shortContrast)}, 95% credible). Request a four-week lift and a re-estimated four-week SE before updating.`;
  const answer = evidenceChoice.value;
  const action = answer ? (answer === (intact ? "use" : "reject") ? "That matches the evidence. " : "Reconsider the calibration row. ") : "";
  $("#media-evidence-feedback").textContent = action + firstDescription;
  if (!useFirst) secondStudy.checked = false;
  const includeCut = cutRevealed && secondStudy.checked;
  const updated = includeCut ? updateLift(afterFirst, features[1], second.estimate, second.se, 1) : afterFirst;
  const included = Number(useFirst) + Number(includeCut);
  const increaseStatus = useFirst ? `Increase-test SE is ${money(updatedSE)}.`
    : revealed ? "The increase row is excluded. Choose Use as reported on the full study to include it."
      : "Reveal the paired ledger to review the increase test.";
  $("#media-update-status").textContent =
    `${included} independent lift observation${included === 1 ? "" : "s"} included. ${increaseStatus}`;

  recordCut.disabled = !useFirst || Boolean(cutPrediction);
  revealCut.disabled = !cutPrediction || cutRevealed;
  $("#media-cut-option").hidden = !cutRevealed;
  secondStudy.disabled = !cutRevealed || !useFirst;
  const savedModel = cutPrediction?.model;
  const savedSE = cutPrediction?.increaseSE;
  $("#media-cut-prediction").textContent = savedModel
    ? `Saved before readout using the increase study at SE ${money(savedSE)}: ${signedMoney(savedModel.mean)} per market (95% credible interval ${intervals(savedModel)}).`
    : useFirst ? "Record the signed forecast for this six-week cut before revealing its observed lift."
      : "Accept the full increase study to record a prediction.";

  const predictive = cutRevealed
    ? gaussianSummary(cutPrediction.fit, features[1], second.se)
    : null;
  const hasHeldOutCheck = cutRevealed && !includeCut;
  if (predictive) {
    const comparison = second.estimate >= predictive.low && second.estimate <= predictive.high ? "inside" : "outside";
    const check = includeCut ? "The cut is included. Its agreement with the updated model is in-sample."
      : `The readout falls ${comparison} the saved prediction’s 95% interval for a study result (${intervals(predictive)}), which includes the cut’s measurement error. This held-out check evaluates transfer to this cut schedule.`;
    $("#media-cut-result").textContent =
      `Cut readout on ${readoutDate(second)}: ${signedMoney(second.estimate)} revenue per market with paired SE ${money(second.se)}. ${check}`;
    if (!includeCut && (!useFirst || savedSE !== updatedSE)) {
      $("#media-cut-result").textContent += " The saved prediction uses the earlier fit.";
    }
  }

  const plot = [];
  const rows = [];
  if (revealed || cutRevealed) {
    studies.forEach((test, i) => {
      if ((i === 0 && !revealed) || (i === 1 && !cutRevealed)) return;
      const se = i === 0 ? updatedSE : test.se;
      const prior = gaussianSummary(fit, features[i]);
      const posterior = gaussianSummary(updated, features[i]);
      const observed = studyInterval(test, se);
      const name = i === 0 ? "Increase" : "Cut";
      const deltaSpend = test.active * (test.plan - test.reference);
      const heldOut = i === 1 && hasHeldOutCheck;
      const role = i === 0 ? (useFirst ? "Included" : "Excluded") : (includeCut ? "Included · in-sample" : "Held-out readout");
      let intervalLabel = i === 0 && se !== study.se ? "95% sensitivity interval" : "95% confidence interval";
      if (i === 0 && !intact) intervalLabel = "original full-study contrast";
      plot.push({ label: name + " · observed", estimate: test.estimate, ...observed, color: gold, style: "rectRot" });
      if (heldOut) {
        plot.push(
          { label: "Cut · saved fit", estimate: savedModel.mean, ...savedModel, color: muted },
          { label: "Cut · predictive", estimate: predictive.mean, ...predictive, color: searchColor, style: "triangle" },
        );
      } else {
        plot.push(
          { label: name + " · history fit", estimate: prior.mean, ...prior, color: muted },
          { label: name + " · updated", estimate: posterior.mean, ...posterior, color: searchColor },
        );
      }
      const row = [`${name} · ${role}`,
        `${test.weeks[0]} · ${money(test.reference)} to ${money(test.plan)}/week × ${test.active}; ${test.horizon} weeks through washout`, signedMoney(deltaSpend),
        `${signedMoney(test.estimate)} · SE ${money(se)} · ${intervalLabel} ${intervals(observed)}`,
        finiteReturn.format(test.estimate / deltaSpend), heldOut
          ? `Saved fit ${signedMoney(savedModel.mean)} (${intervals(savedModel)})`
          : `History ${signedMoney(prior.mean)} (${intervals(prior)}) → updated ${signedMoney(posterior.mean)} (${intervals(posterior)})`];
      if (hasHeldOutCheck) row.push(heldOut ? intervals(predictive) : "—");
      rows.push(row);
    });
  }
  const comparisonChart = $("#media-study-comparison");
  comparisonChart.parentElement.hidden = !plot.length;
  if (plot.length) intervalChart(comparisonChart, plot, [{ label: "Zero", value: 0, color: blue, dash: [4, 4] }]);
  comparisonChart.parentElement.classList.toggle("media-two-studies", plot.length > 3);
  const headers = ["Test", "Intervention", "Spend change", "Reported signed lift", "Finite ROAS", "Model lift (95% credible)"];
  if (hasHeldOutCheck) headers.push("Held-out readout (95% predictive)");
  $("#media-lift-comparison-table").innerHTML = rows.length ? table(headers, rows) : "";
  const comparisonTable = $("#media-lift-comparison-table .ex-table");
  if (comparisonTable) {
    comparisonTable.setAttribute("role", "region");
    comparisonTable.tabIndex = 0;
    comparisonTable.setAttribute("aria-label", "Study comparison table");
  }

  const targetWeights = target.value === "tested" ? eligible : untested;
  const featureAt = value => targetWeights.map(weight => weight * response(value));
  const before = steadySpend.map(value => gaussianSummary(fit, featureAt(value)));
  const after = steadySpend.map(value => gaussianSummary(updated, featureAt(value)));
  chart($("#media-calibration-curve"), {
    datasets: [
      ...ribbon("History only", steadySpend, before, muted, "#c2cfe630", { borderDash: [7, 4] }),
      ...ribbon("Updated", steadySpend, after, searchColor, "#2dd4bf30"),
    ],
    x: { title: axis("Steady weekly Search spend ($)") },
    y: { title: axis("Expected weekly Search revenue ($)") },
  });
  $("#media-calibration-curve-table").innerHTML = table(["Weekly Search spend", "History only (95% credible)", "Updated (95% credible)"],
    steadySpend.map((value, i) => [money(value), `${money(before[i].mean)} (${intervals(before[i])})`,
      `${money(after[i].mean)} (${intervals(after[i])})`]));
  const returnFeature = targetWeights.map(weight => weight * responseSlope(current));
  const beforeReturn = gaussianSummary(fit, returnFeature);
  const afterReturn = gaussianSummary(updated, returnFeature);
  const knownReturn = dot(truth, returnFeature);
  $("#media-return-summary").textContent = `Steady marginal Search ROAS at ${money(current)}/week: ${beforeReturn.mean.toFixed(2)} → ${afterReturn.mean.toFixed(2)} (updated 95% credible interval ${afterReturn.low.toFixed(2)} to ${afterReturn.high.toFixed(2)}). Synthetic truth ${knownReturn.toFixed(2)}. Absolute error ${Math.abs(beforeReturn.mean - knownReturn).toFixed(2)} → ${Math.abs(afterReturn.mean - knownReturn).toFixed(2)}.`;
  renderAllocation(updated, included);
}

function allocationFeature(searchSpend) {
  const gain = spendGain(searchSpend);
  const socialGain = spendGain(budget - searchSpend);
  const feature = eligible.map(weight => weight * gain);
  feature[2] = socialGain;
  return feature;
}

function spendGain(spend) {
  const schedule = [spend, spend, spend, spend, current, current];
  return sum(exposureSeries(schedule, current).map(value => response(value) - response(current)));
}

function marginal(spend) {
  const schedule = [spend, spend, spend, spend, current, current];
  const weights = exposureSeries([1, 1, 1, 1, 0, 0], 0);
  return sum(exposureSeries(schedule, current).map((value, i) => weights[i] * responseSlope(value))) / 4;
}

let allocationFit = fit;
let numberOfStudies = 0;
function renderAllocation(updated, included) {
  allocationFit = updated;
  numberOfStudies = included;
  const weeklySearch = +allocation.value;
  const weeklySocial = budget - weeklySearch;
  const candidateFeatures = grid.map(allocationFeature);
  const gains = candidateFeatures.map(feature => dot(updated.mean, feature));
  const bestIndex = gains.indexOf(Math.max(...gains));
  best = grid[bestIndex];
  const gainFeature = candidateFeatures[grid.indexOf(weeklySearch)];
  const gain = summarize(updated.draws.map(draw => dot(draw, gainFeature)));
  const searchReturn = dot(updated.mean, eligible) * marginal(weeklySearch);
  const socialReturn = updated.mean[2] * marginal(weeklySocial);
  $("#media-allocation-summary").textContent = `Using ${included} lift observation${included === 1 ? "" : "s"} · Search ${money(weeklySearch)} and Social ${money(weeklySocial)} per week · Expected six-week gain ${signedMoney(dot(updated.mean, gainFeature))} (95% credible interval ${intervals(gain)}). Marginal ROAS over this horizon: Search ${searchReturn.toFixed(2)}, Social ${socialReturn.toFixed(2)}. Best grid split: Search ${money(best)} and Social ${money(budget - best)}, expected gain ${signedMoney(gains[bestIndex])}.`;
  chart($("#media-allocation-chart"), {
    datasets: [
      series("Grid", points(grid, gains), searchColor),
      series("Selected", [{ x: weeklySearch, y: dot(updated.mean, gainFeature) }], blue, { pointRadius: 6 }),
      series("Best expected gain", [{ x: best, y: gains[bestIndex] }], gold, { pointRadius: 6, pointStyle: "rectRot" }),
    ],
    x: { title: axis("Weekly Search spend ($)") },
    y: { title: axis("Expected six-week gain ($)") },
    legend: true,
  });
  $("#media-allocation-table").innerHTML = table(["Weekly Search", "Weekly Social", "Expected gain", "Grid choice"],
    grid.map((spend, i) => [money(spend), money(budget - spend), signedMoney(gains[i]),
      [spend === weeklySearch ? "Selected" : "", spend === best ? "Best expected gain" : ""].filter(Boolean).join(" · ")]));
}

reveal.addEventListener("click", () => {
  const visible = $("#media-audit").hidden;
  $("#media-audit").hidden = !visible;
  revealed ||= visible;
  reveal.setAttribute("aria-expanded", visible);
  reveal.textContent = visible ? "Hide the paired ledger" : "Reveal assignment and outcomes";
  renderCalibration();
});
challenge.addEventListener("change", () => {
  evidenceChoice.value = "";
  renderCalibration();
});
recordCut.addEventListener("click", () => {
  const { useFirst, fit: predictionFit, se } = increaseFit();
  if (!useFirst || cutPrediction) return;
  cutPrediction = { fit: predictionFit, increaseSE: se, model: gaussianSummary(predictionFit, features[1]) };
  renderCalibration();
  revealCut.focus();
});
revealCut.addEventListener("click", () => {
  if (!cutPrediction || cutRevealed) return;
  cutRevealed = true;
  renderCalibration();
  if (!secondStudy.disabled) secondStudy.focus();
});
for (const control of [evidenceChoice, precision, secondStudy, target]) {
  control.addEventListener("change", renderCalibration);
}
allocation.addEventListener("input", () => renderAllocation(allocationFit, numberOfStudies));
$("#media-optimize").addEventListener("click", () => {
  allocation.value = best;
  renderAllocation(allocationFit, numberOfStudies);
});
renderCalibration();
