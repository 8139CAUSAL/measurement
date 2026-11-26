import { $, axis, blue, chart, gold, intervalChart, muted, series, table } from "./experiment-tools.js";
import { carryoverHistory, fits, history, meta, modelOutcome, money, response, searchColor, socialColor,
  summarize, support } from "./media-model.js";
import { points, ribbon } from "./media-charts.js";

const choice = $("#media-prior");
const weeks = history[0].map((_, i) => i + 1);
const [search, social] = carryoverHistory[0];
const raw = history[0];
const formatInterval = ({ low, high }) => `${money(low)} to ${money(high)}`;
const xWeek = { min: 1, max: weeks.length, title: axis("Week") };
const usages = [support(0).effective, support(1).effective];
const overlap = [Math.max(...usages.map(r => r[0])), Math.min(...usages.map(r => r[1]))];

function render() {
  const fit = fits[choice.value];
  const predicted = raw.map((row, i) => modelOutcome(fit.mean, 0, row[2], search[i], social[i]));
  const searchContribution = search.map(x => fit.mean[4] * response(x));
  const socialContribution = social.map(x => fit.mean[2] * response(x));
  const later = fit.holdout.intervals.map(([low, high], i) => ({ low, high, mean: predicted[i + meta.trainWeeks] }));
  const laterRibbon = ribbon("Later-week predictive band", weeks.slice(meta.trainWeeks), later, blue, "#9ec9ff40");
  chart($("#media-fit-chart"), {
    datasets: [...laterRibbon.slice(0, 2), series("Observed", points(weeks, raw.map(d => d[3])), muted),
      series("Expected", points(weeks, predicted), searchColor)],
    x: xWeek, y: { title: axis("Weekly revenue ($)") },
  });
  chart($("#media-contribution-chart"), {
    datasets: [series("Search", points(weeks, searchContribution), searchColor),
      series("Social", points(weeks, socialContribution), socialColor)],
    x: xWeek, y: { title: axis("Weekly contribution ($)"), min: 0 }, legend: true,
  });
  $("#media-overview-summary").textContent = `Market 01. Gray is observed revenue and mint is expected. The blue band covers the 8 later weeks. Search averages ${money(searchContribution.reduce((a, b) => a + b) / weeks.length)} per week and Social ${money(socialContribution.reduce((a, b) => a + b) / weeks.length)}.`;
  $("#media-fit-table").innerHTML = table(["Week of", "Observed", "Expected", "Search", "Social", "95% predictive interval"],
    weeks.map((week, i) => [meta.dates[i], money(raw[i][3]), money(predicted[i]), money(searchContribution[i]),
      money(socialContribution[i]), later[i - meta.trainWeeks] ? formatInterval(later[i - meta.trainWeeks]) : "Training"]));

  const [rhat, bulk, tail, mcse, rates, divergences] = fit.diagnostics;
  const firstWeekPrior = fit.priorPredictive[0];
  const firstWeekPosterior = summarize(fit.draws.map(draw => modelOutcome(draw, 0, raw[0][2], search[0], social[0])));
  const average = response(2000) / 2000;
  const returnRow = (prior, channel, label) => {
    const post = summarize(fit.draws.map(draw => average * draw[channel]));
    return [label, `${prior[0].toFixed(2)} to ${prior[2].toFixed(2)} prior · ${post.low.toFixed(2)} to ${post.high.toFixed(2)} posterior`];
  };
  $("#media-workflow-table").innerHTML = table(["Check", "Selected fit"], [
    ["Market 01, week 1 prior predictive revenue", `95% interval ${money(firstWeekPrior[0])} to ${money(firstWeekPrior[2])}`],
    ["Same week, posterior expected revenue", `95% credible interval ${formatInterval(firstWeekPosterior)}`],
    returnRow(fit.priorReturn[0], 3, "Population Search average ROAS at steady $2,000/week (95% intervals)"),
    returnRow(fit.priorReturn[1], 2, "Social average ROAS at steady $2,000/week (95% intervals)"),
    ["Four chains", `${meta.warmup} warmup and ${meta.perChain.toLocaleString()} retained draws per chain · acceptance ${rates.map(rate => (rate * 100).toFixed(0) + "%").join(", ")}`],
    ["Sampler diagnostics", `Max split R-hat ${rhat.toFixed(3)} · min bulk ESS ${Math.round(bulk)} · min tail ESS ${Math.round(tail)} · population Search amplitude MCSE ${money(mcse)} · ${divergences} divergences`],
    ["Held-out later weeks, all markets", `RMSE ${money(fit.holdout.rmse)} · ${fit.holdout.covered}/${fit.holdout.n} observations inside 95% predictive intervals`],
  ]);
  const regional = fit.regional.flatMap(([geo, lo, mid, hi, poolLo, poolMid, poolHi]) => [
    { label: `Market ${geo + 1} local`, low: lo, estimate: mid, high: hi, color: blue },
    { label: `Market ${geo + 1} pooled`, low: poolLo, estimate: poolMid, high: poolHi, color: searchColor },
  ]);
  intervalChart($("#media-pooling"), regional, [{ label: "Shared mean", value: fit.mean[3], color: gold, dash: [5, 4] }]);
  $("#media-pooling-table").innerHTML = table(["Market and fit", "Amplitude center", "95% credible interval"],
    regional.map(row => [row.label, money(row.estimate), formatInterval(row)]),
    `Shared Search center (gold line): ${money(fit.mean[3])}`);
}
choice.addEventListener("change", render);
render();

const levels = [...new Set([0, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000, ...overlap])].sort((a, b) => a - b);
const curves = Object.values(fits).flatMap(fit => [
  levels.map(x => (fit.mean[3] + fit.mean[2]) * response(x)),
  levels.map(x => fit.mean[3] * response(x)),
]);
const curveLabels = ["Joint · lower Search prior", "Search · lower prior", "Joint · higher Search prior", "Search · higher prior"];
const cap = 14000;
chart($("#media-prior-curves"), {
  datasets: [
    series("", points(overlap, [0, 0]), muted, { borderWidth: 0 }),
    series("", points(overlap, [cap, cap]), muted, { borderWidth: 0, fill: "-1", backgroundColor: "#9ec9ff19" }),
    ...curves.map((curve, i) => series(curveLabels[i], points(levels, curve), i < 2 ? blue : gold,
      { borderDash: i % 2 ? [5, 4] : [] })),
  ],
  x: { title: axis("Effective spend in varied channel(s) ($)") },
  y: { title: axis("Expected media revenue ($)"), min: 0, max: cap },
});
$("#media-curve-table").innerHTML = table(["Effective exposure", ...curveLabels],
  levels.map((value, i) => [money(value), ...curves.map(curve => money(curve[i]))]),
  `Overlapping training range: ${money(overlap[0])}–${money(overlap[1])}. Blue curves use the lower Search prior, gold the higher prior. Dashes mark Search alone.`);
