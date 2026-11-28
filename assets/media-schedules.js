import { $, axis, chart, gold, muted, series, table } from "./experiment-tools.js";
import { carryoverHistory, exposureSeries, fits, history, meta, modelOutcome, money,
  normalNoise, response, searchColor, signedMoney, sum, summarize, support } from "./media-model.js";
import { points, ribbon } from "./media-charts.js";

const scenario = $("#media-scenario");
const reference = $("#media-reference");
const market = $("#media-market");
const end = $("#media-end");
const threshold = $("#media-threshold");
const weeks = Array.from({ length: 12 }, (_, i) => i - 3);
const searchSupport = support(0);
const [rawLow, rawHigh] = searchSupport.raw;
const [expLow, expHigh] = searchSupport.effective;
const draws = fits.balanced.draws;

function options(element, list) {
  element.replaceChildren(...list.map(([value, label]) => new Option(label, value)));
}

options(market, meta.geos.map((name, i) => [i, name]));
options(end, weeks.slice(3).map(week => [week, `Week ${week + 1}`]));
end.value = "5";

function setScenario() {
  options(reference, scenario.value === "historical"
    ? [["recorded", "Recorded spend"], ["same", "Same pause as plan"]]
    : [["usual", "Hold latest Search spend"], ["2000", "Plan $2,000 per week"], ["same", "Same increase as plan"]]);
  render();
}

function render() {
  const historical = scenario.value === "historical";
  const geo = +market.value;
  const last = +end.value;
  const rows = history[geo];
  const start = historical ? meta.weeks - 9 : meta.weeks;
  const pastSpend = rows[start - 1][0];
  const futureBase = reference.value === "2000" ? 2000 : pastSpend;
  const timeline = weeks.map(week => {
    const index = start + week;
    const known = historical || week < 0;
    const actual = known ? rows[index] : rows[meta.weeks - 4 + week % 4];
    const baseline = known ? actual[0] : futureBase;
    const planned = week >= 0 && week < 4 ? (historical ? 0 : futureBase + 1000) : baseline;
    return { week, index, actual, baseline, planned, reference: reference.value === "same" ? planned : baseline };
  });
  const initial = carryoverHistory[geo][0][start - 4];
  const plan = exposureSeries(timeline.map(d => d.planned), initial);
  const ref = exposureSeries(timeline.map(d => d.reference), initial);
  const changes = plan.map((exposure, i) => response(exposure) - response(ref[i]));
  const included = weeks.map((week, i) => week >= 0 && week <= last ? changes[i] : 0);
  const totals = draws.map(draw => draw[4 + geo] * sum(included));
  const total = summarize(totals);
  const windowLabel = last ? `Weeks 1–${last + 1}` : "Week 1";
  const limit = threshold.valueAsNumber;
  const share = Number.isFinite(limit) ? totals.filter(value => value > limit).length / totals.length : NaN;
  $("#media-schedule-summary").textContent = `${windowLabel} · Expected difference ${signedMoney(total.mean)} · 95% credible interval ${signedMoney(total.low)} to ${signedMoney(total.high)} · ${Number.isFinite(share) ? (100 * share).toFixed(1) + "% of draws above " + money(limit) : "Enter a revenue threshold to calculate the probability."}`;
  const outside = timeline.filter((d, i) => d.week >= 0 && d.week <= last &&
    ([d.planned, d.reference].some(x => x < rawLow || x > rawHigh) ||
     [plan[i], ref[i]].some(x => x < expLow || x > expHigh))).length;
  $("#media-support").textContent = `Training support across markets: raw ${money(rawLow)}–${money(rawHigh)}, effective ${money(expLow)}–${money(expHigh)}. ${outside} selected week${outside === 1 ? "" : "s"} outside at least one range. Vertical dotted lines bound the weeks included in the total.`;

  const effects = changes.map(change => summarize(draws.map(draw => draw[4 + geo] * change)));
  const expected = [];
  const alternative = [];
  const prediction = [];
  timeline.forEach((d, i) => {
    if (historical || d.week < 0) {
      const factual = carryoverHistory[geo][0][d.index];
      const observed = d.actual[3];
      expected.push(observed + fits.balanced.mean[4 + geo] * (response(ref[i]) - response(factual)));
      alternative.push(summarize(draws.map(draw =>
        observed + draw[4 + geo] * (response(plan[i]) - response(factual)))));
      prediction.push(null);
      return;
    }
    const social = carryoverHistory[geo][1][start - 1];
    const demand = d.actual[2];
    const week = i + 1;
    expected.push(modelOutcome(fits.balanced.mean, geo, demand, ref[i], social));
    const planDraws = draws.map(draw => modelOutcome(draw, geo, demand, plan[i], social));
    alternative.push(summarize(planDraws));
    prediction.push(summarize(planDraws.map((value, k) => value + meta.noise * normalNoise(week * draws.length + k))));
  });

  const xs = weeks.map(week => week + 1);
  const xAxis = {
    min: -2.5, max: 9.5, afterFit: scale => { scale.height = 50; },
    afterBuildTicks: scale => { scale.ticks = xs.map(value => ({ value })); },
    ticks: { color: muted },
    title: axis("Week (1 = first changed week)"),
  };
  const markers = (minimum, maximum) => [.5, last + 1.5].map(x =>
    series("", [{ x, y: minimum }, { x, y: maximum }], gold, { borderDash: [3, 5], borderWidth: 1 }));
  function timelineChart(id, label, datasets, values, floor = null) {
    const low = Math.min(...values);
    const high = Math.max(...values);
    const padding = Math.max(1, (high - low) * .1);
    // Bounds land on round tick values, so no extra minimum or maximum label crowds a gridline label.
    const rawStep = ((high + padding) - (floor ?? low - padding)) / 5;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const step = [1, 2, 2.5, 5, 10].map(f => f * magnitude).find(v => v >= rawStep);
    const min = floor ?? Math.floor((low - padding) / step) * step;
    const max = Math.ceil((high + padding) / step) * step;
    chart($(id), { x: xAxis,
      y: { min, max, afterFit: scale => { scale.width = 76; }, title: axis(label), ticks: { color: muted, stepSize: step, callback: value => Math.round(value).toLocaleString("en-US") } },
      datasets: [...datasets, ...markers(min, max)], legend: false });
  }
  function scheduleChart(id, label, left, right, low, high) {
    const ranges = xs.map(() => ({ low, high, mean: null }));
    timelineChart(id, label, [
      ...ribbon("", xs, ranges, muted, "#6941A51F"),
      series("Reference", points(xs, left), muted, { borderDash: [5, 4] }),
      series("Plan", points(xs, right), searchColor),
    ], [...left, ...right, low, high], 0);
  }
  scheduleChart("#media-raw-chart", "Spend ($)", timeline.map(d => d.reference), timeline.map(d => d.planned), rawLow, rawHigh);
  scheduleChart("#media-exposure-chart", "Exposure ($)", ref, plan, expLow, expHigh);
  timelineChart("#media-effect-chart", "Difference ($)", ribbon("Expected difference", xs, effects, searchColor, "#0284C728"),
    effects.flatMap(d => [d.low, d.high]));
  const outcomeRange = historical ? alternative : prediction.map((d, i) =>
    d ? { ...d, mean: alternative[i].mean } : alternative[i]);
  timelineChart("#media-outcome-chart", "Revenue ($)", [
    ...ribbon("Plan revenue", xs, outcomeRange, searchColor, "#0284C728"),
    series("Reference revenue", points(xs, expected), muted, { borderDash: [5, 4] }),
  ], [...expected, ...outcomeRange.flatMap(d => [d.low, d.high])]);
  $("#media-week-table").innerHTML = table(["Week of", "In sum", "Spend ref / plan", "Effective ref / plan",
    "Expected difference (95% credible)", "Reference revenue", "Plan revenue and 95% band"],
  timeline.map((d, i) => [meta.dates[d.index], d.week >= 0 && d.week <= last ? "Yes" : "No",
    `${money(d.reference)} / ${money(d.planned)}`, `${money(ref[i])} / ${money(plan[i])}`,
    `${signedMoney(effects[i].mean)} (${signedMoney(effects[i].low)} to ${signedMoney(effects[i].high)})`,
    money(expected[i]), `${money(outcomeRange[i].mean)} (${money(outcomeRange[i].low)} to ${money(outcomeRange[i].high)})`]));
  $("#media-outcome-note").textContent = historical
    ? "For the historical outcome, retain the observed shock and add the modeled difference from the factual schedule. The reconstruction assumes additive outcomes and an invariant shock."
    : "Future demand repeats the last four index values and Social holds its last effective exposure. The revenue chart shows expected revenue with a 95% predictive band for the plan, adding weekly outcome noise after the intervention starts.";
}

scenario.addEventListener("change", setScenario);
for (const input of [reference, market, end, threshold]) input.addEventListener("input", render);
setScenario();
