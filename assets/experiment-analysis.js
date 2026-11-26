import { binaryContrast, binomial, mean, normalQuantile, quantile, ratioOfTotals, seededRandom, variance } from "./experiment-stats.js";
import { $, axis, blue, chart, decimal, gold, initializeTabs, integer, interval, intervalChart, mint, percent, points, probability, series, signed, table } from "./experiment-tools.js";

initializeTabs();

const spend = { control: [2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 11, 20], offer: [2, 3, 4, 4, 5, 6, 7, 8, 10, 12, 18, 26] };
// SciPy shapiro and statsmodels normal_ad, fitted normal, for these six fixed samples.
const normality = {
  control: [.771, .0045, 1.016, .0072], offer: [.831, .0214, .793, .0280], pooled: [.788, .0002, 1.810, .000088],
  extremeControl: [.445, .000007, 2.947, .00000006], extremeOffer: [.487, .000014, 2.625, .00000041],
  extremePooled: [.468, .00000003, 5.374, .0000000000001],
};
const group = $("#distribution-group");
const view = $("#distribution-view");
const sampleSize = $("#distribution-size");
const extreme = $("#distribution-extreme");

function distribution() {
  const control = extreme.checked ? [...spend.control.slice(0, -1), 70] : spend.control;
  const offer = extreme.checked ? [...spend.offer.slice(0, -1), 90] : spend.offer;
  const source = { control, offer, pooled: [...control, ...offer] }[group.value];
  const repeated = view.value === "means";
  sampleSize.disabled = !repeated;
  const n = Number(sampleSize.value);
  const random = seededRandom(425);
  const values = (repeated
    ? Array.from({ length: 350 }, () => mean(Array.from({ length: n }, () => source[Math.floor(random() * source.length)])))
    : [...source]).sort((a, b) => a - b);
  const average = mean(values);
  const median = quantile(values, .5);
  const sd = Math.sqrt(variance(values));
  const bandwidth = 1.06 * sd / values.length ** .2;
  const max = values.at(-1);
  const min = repeated ? values[0] - 2.5 * bandwidth : -2 * bandwidth;
  const grid = Array.from({ length: 121 }, (_, i) => min + i * (max + 2.5 * bandwidth - min) / 120);
  const kernel = x => mean(values.map(value => Math.exp(-.5 * ((x - value) / bandwidth) ** 2))) / (bandwidth * Math.sqrt(2 * Math.PI));
  const density = grid.map(x => ({ x, y: kernel(x) }));
  const height = Math.max(...density.map(point => point.y)) * 1.05;
  const marker = (name, x, color, dash) => series(name, [{ x, y: 0 }, { x, y: height }], color, { borderDash: dash });
  chart($("#distribution-kde"), {
    datasets: [series("KDE", density, mint), marker("Mean", average, gold, [6, 4]), marker("Median", median, blue, [2, 3]),
      ...(!repeated ? [marker("Zero boundary", 0, "#e4a9ee", [9, 3, 2, 3])] : [])],
    x: { title: axis(repeated ? "Sample mean spend ($)" : "Spend per account ($)") }, y: { beginAtZero: true }, legend: true,
  });
  const qq = values.map((y, i) => ({ y, x: normalQuantile((i + .5) / values.length) }));
  const line = [qq[0].x, qq.at(-1).x].map(x => ({ x, y: average + sd * x }));
  chart($("#distribution-qq"), {
    datasets: [
      series("Normal reference", line, blue, { borderDash: [5, 4] }),
      series("Observed quantiles", qq, mint, { showLine: false, pointRadius: repeated ? 2 : 4 }),
      series("Largest value", [qq.at(-1)], gold, { pointRadius: 6, pointStyle: "triangle" }),
    ],
    x: { title: axis("Theoretical normal quantiles") }, y: { title: axis("Observed quantiles ($)") }, legend: true,
  });
  $("#distribution-summary").textContent = repeated
    ? `350 independent samples of ${n} units drawn with replacement from the selected empirical distribution. The mean of the sample means is $${decimal(average)}, and their SD is $${decimal(sd)}.`
    : `${values.length} observed accounts. Mean $${decimal(average)}, median $${decimal(median)}. The largest observation is $${decimal(max)}, compared with $${decimal(line[1].y)} on the fitted normal reference.`;
  $("#distribution-table").innerHTML = table(["View", "Minimum", "10th percentile", "Median", "90th percentile", "Maximum", "SD"],
    [[repeated ? "Sample means" : "Observed spend", ...[0, .1, .5, .9, 1].map(q => "$" + decimal(quantile(values, q))), "$" + decimal(sd)]]);
  const name = group.value;
  const key = extreme.checked ? "extreme" + name[0].toUpperCase() + name.slice(1) : name;
  const [w, wp, ad, ap] = normality[key];
  $("#normality-results").innerHTML = table(["Fixed raw example", "n", "Shapiro–Wilk W", "p", "Anderson–Darling A²", "p (approx.)"],
    [[group.selectedOptions[0].textContent + (extreme.checked ? " with extreme values" : ""), source.length, decimal(w, 3), probability(wp), decimal(ad, 3), probability(ap)]]);
}
for (const input of [group, view, sampleSize, extreme]) input.addEventListener("change", distribution);
distribution();

const fields = ["control-conversions", "control-assigned", "offer-conversions", "offer-assigned"].map(id => $("#" + id));
const plotMode = $("#binary-view");
const coverage = $("#binary-coverage");
const coverageResult = $("#coverage-result");
const coverageRates = [$("#true-control-rate"), $("#true-offer-rate")];
const random = seededRandom(86421);
const readCounts = () => fields.map(input => input.valueAsNumber);
const zero = { label: "Zero", value: 0, color: gold, dash: [5, 4] };

function renderBinary() {
  const [x0, n0, x1, n1] = readCounts();
  const plot = $("#binary-plot");
  const summary = $("#binary-summary");
  const results = $("#binary-results");
  const failures = ["#control-failures", "#offer-failures"];
  try {
    const result = binaryContrast(x0, n0, x1, n1);
    const rates = plotMode.value === "rates";
    const repeating = plotMode.value === "coverage";
    coverage.hidden = !repeating;
    plot.hidden = repeating;
    failures.forEach((id, arm) => { $(id).textContent = integer(arm ? n1 - x1 : n0 - x0); });
    const relative = result.relative === null ? "undefined at zero control rate" : signed(result.relative * 100, 1) + "%";
    summary.textContent = `Estimated difference ${points(result.effect)}. Relative lift ${relative}. Pooled z-test p = ${probability(result.p)}.${result.sparse ? " Expected cells are sparse. Interpret large-sample tests cautiously and consider an exact test." : ""}`;
    results.innerHTML = table(["Quantity", "Estimate", "95% interval", "Method"], [
      ["Control rate", percent(result.control.rate), interval(result.control) + "%", "Wilson"],
      ["Offer rate", percent(result.offer.rate), interval(result.offer) + "%", "Wilson"],
      ["Offer − control", points(result.effect), interval(result) + " pp", "Newcombe"],
    ]);
    if (!repeating) {
      const canvas = $("#binary-chart");
      canvas.dataset.units = rates ? "Conversion rate (%)" : "Percentage points";
      const rows = rates
        ? [["Control", result.control.rate, result.control, blue, "rect"], ["Offer", result.offer.rate, result.offer, mint, "circle"]]
        : [["Difference", result.effect, result, mint, "circle"]];
      intervalChart(canvas, rows.map(([label, estimate, bounds, color, style]) => ({
        label, estimate: 100 * estimate, low: 100 * bounds.low, high: 100 * bounds.high, color, style,
      })), rates ? [] : [zero]);
    }
  } catch (error) {
    plot.hidden = true;
    coverage.hidden = plotMode.value !== "coverage";
    failures.forEach(id => { $(id).textContent = "—"; });
    summary.textContent = error.message;
    results.replaceChildren();
  }
}

for (const field of fields) field.addEventListener("input", () => { coverageResult.textContent = ""; renderBinary(); });
for (const rate of coverageRates) rate.addEventListener("input", () => { coverageResult.textContent = ""; });
plotMode.addEventListener("change", renderBinary);
$("#repeat-coverage").addEventListener("click", () => {
  const [x0, n0, x1, n1] = readCounts();
  const [p0, p1] = coverageRates.map(input => input.valueAsNumber / 100);
  try {
    binaryContrast(x0, n0, x1, n1);
    if (![p0, p1].every(p => p >= 0 && p <= 1)) throw new RangeError("Enter both true rates between 0% and 100%.");
    if (n0 > 10000 || n1 > 10000) throw new RangeError("Use at most 10,000 assigned per arm for this repeated-sample display.");
    const truth = p1 - p0;
    const repetitions = 300;
    let covered = 0;
    for (let i = 0; i < repetitions; i++) {
      const draw = binaryContrast(binomial(n0, p0, random), n0, binomial(n1, p1, random), n1);
      covered += Number(draw.low - 1e-12 <= truth && truth <= draw.high + 1e-12);
    }
    coverageResult.textContent = `${covered} of ${repetitions} intervals (${percent(covered / repetitions)}) included the known difference of ${points(truth)}.`;
  } catch (error) {
    coverageResult.textContent = error.message;
  }
});

const inconclusive = binaryContrast(20, 100, 24, 100);
$("#nonsignificant-summary").textContent = `With 20 of 100 control accounts and 24 of 100 offer accounts converting, the estimated lift is ${points(inconclusive.effect)} (95% CI ${interval(inconclusive)} pp, pooled z p = ${probability(inconclusive.p)}). The interval includes both zero and +5 points. Read it alongside the trial’s planned sensitivity.`;
function loadInconclusive() {
  [20, 100, 24, 100].forEach((value, i) => { fields[i].value = value; });
  plotMode.value = "contrast";
  coverageResult.textContent = "";
  renderBinary();
}
$("#load-nonsignificant").addEventListener("click", loadInconclusive);
if (location.hash === "#nonsignificant-interval") loadInconclusive();

const continuous = [[1, 2, 2, 3, 5, 11], [2, 3, 4, 5, 6, 10]];
const ratios = [[[0, 0], [0, 1], [1, 2], [0, 2], [2, 5], [1, 8]], [[0, 0], [1, 1], [1, 2], [0, 3], [3, 5], [2, 8]]];
const ratioLabels = ["Control", "Offer"];
const examples = {
  means: () => {
    const difference = mean(continuous[1]) - mean(continuous[0]);
    const d = difference / Math.sqrt(mean(continuous.map(variance)));
    return `<p>Welch estimates the mean difference using independent values per randomized account and separate sample variances.
      These six accounts per arm give a difference of ${signed(difference)} units, 95% t interval −3.27 to 5.27, and p = .6104
      (9.37 degrees of freedom). Cohen’s d is ${decimal(d, 3)}, standardized by the pooled within-arm sample SD.</p>
      ${table(["Arm", "Account values", "Mean", "SD"], continuous.map((values, i) => [
        ratioLabels[i], values.join(", "), decimal(mean(values)), decimal(Math.sqrt(variance(values))),
      ]))}`;
  },
  ranks: () => {
    let u = 0;
    for (const offer of continuous[1]) {
      for (const control of continuous[0]) u += offer > control ? 1 : offer === control ? .5 : 0;
    }
    const a = u / (continuous[0].length * continuous[1].length);
    return `<p>Mann–Whitney U assesses rank ordering for independent arms under the null of identical distributions. An interpretation as a median shift needs comparable shapes. Here U = ${u} for offer relative to control. A = P(offer &gt; control) + ½ P(tie) is ${percent(a)}, and the rank-biserial effect 2A − 1 is ${decimal(2 * a - 1)}. Under exchangeable labels, the two-sided permutation p-value over all 924 assignments is .3658.</p>
      ${table(["Arm", "Account values", "Median"], continuous.map((values, i) => [ratioLabels[i], values.join(", "), decimal(quantile(values, .5))]))}`;
  },
  ratio: () => {
    const [c, t] = ratios.map(ratioOfTotals);
    const delta = t.rate - c.rate;
    const half = normalQuantile(.975) * Math.sqrt(t.variance + c.variance);
    return `<p>Aggregate events and visits within each randomized account, including accounts with zero visits.
      For each arm, R = X̄ / D̄, where X is the event count and D is the visit count.
      The delta-method variance is s²(X − RD) / (nD̄²), which retains the numerator–denominator covariance.
      Add arm variances for the independent-arm difference. The average of individual ratios targets a different quantity.
      A zero aggregate denominator makes R undefined, and an unstable denominator can make the approximation unreliable.</p>
      ${table(["Arm", "Account totals (events / visits)", "Events per visit", "Delta-method SE"], ratios.map((rows, i) => [
        ratioLabels[i], rows.map(([x, d]) => `${x} / ${d}`).join(", "), decimal([c, t][i].rate, 3), decimal(Math.sqrt([c, t][i].variance), 3),
      ]))}
      <p>Difference ${signed(delta, 3)} events per visit (illustrative 95% normal interval ${decimal(delta - half, 3)} to ${decimal(delta + half, 3)}). The samples are small.
      <a href="https://www.microsoft.com/en-us/research/publication/applying-the-delta-method-in-metric-analytics-a-practical-guide-with-novel-ideas/">Deng, Knoblich and Lu on the delta method</a>.</p>`;
  },
};
const method = $("#ab-method");
function updateMethod() {
  const other = $("#ab-other-method");
  other.hidden = method.value === "binary";
  $("#ab-binary-method").hidden = !other.hidden;
  if (other.hidden) renderBinary();
  else other.innerHTML = examples[method.value]();
}
method.addEventListener("change", updateMethod);
updateMethod();

const mixes = [$("#mix-control"), $("#mix-offer")];
const standardize = $("#mix-standardize");
function mix() {
  const shares = mixes.map(input => input.valueAsNumber / 100);
  const rates = [[.20, .25], [.60, .65]];
  const output = $("#mix-summary");
  const tabular = $("#mix-table");
  if (!mixes.every(input => input.validity.valid && input.value !== "")) {
    output.textContent = "Enter both shares from 0% to 100% in steps of five points.";
    tabular.replaceChildren();
    return;
  }
  const high = mean(shares);
  const pooled = shares.map((share, arm) => (1 - share) * rates[0][arm] + share * rates[1][arm]);
  const common = rates[0].map((rate, arm) => (1 - high) * rate + high * rates[1][arm]);
  const weights = [shares.map(value => 1 - value), shares];
  const selected = standardize.checked ? common : pooled;
  output.textContent = `${standardize.checked ? "Enrolled weights" : "Arm-specific weights"} give a difference of ${points(selected[1] - selected[0])}.`;
  tabular.innerHTML = table(["Activity", "Control n, weight", "Offer n, weight", "Enrolled weight", "Control rate", "Offer rate", "Difference"],
    [
      ...rates.map(([c, t], i) => [
        i ? "Higher" : "Lower", ...weights[i].map(weight => `${integer(Math.round(2000 * weight))}, ${percent(weight)}`),
        percent(i ? high : 1 - high), percent(c), percent(t), points(t - c),
      ]),
      ["Pooled", "2,000", "2,000", "—", ...pooled.map(percent), points(pooled[1] - pooled[0])],
      ["Standardized", "—", "—", "100%", ...common.map(percent), points(common[1] - common[0])],
    ]);
}
for (const input of [...mixes, standardize]) input.addEventListener("input", mix);
mix();

const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const cohortEffects = [4, 9, 3, 8, 5, 12, 3, -1, 6, 2, -4, 4, 7, 2, 4, -2, 3, -3, 5, 1, 3];
let nTotal = 0;
let totalControl = 0;
let totalOffer = 0;
const trial = cohortEffects.map((effect, i) => {
  const day = i % 7;
  const n = [175, 190, 180, 195, 205, 85, 75][day] + 5 * Math.floor(i / 7);
  const control = Math.round(n * [.2, .19, .19, .21, .22, .25, .24][day]);
  const offer = control + Math.round(n * effect / 100);
  totalControl += control;
  totalOffer += offer;
  nTotal += n;
  return { day: i + 1, weekday: weekday[day], n, control, offer, daily: (offer - control) / n, cumulative: (totalOffer - totalControl) / nTotal };
});
const time = $("#time-view");
function timePlot() {
  const key = time.value;
  const values = trial.map(row => ({ x: row.day, y: 100 * row[key] }));
  const lower = Math.min(0, ...values.map(point => point.y));
  const upper = Math.max(0, ...values.map(point => point.y));
  const weekends = values.filter((_, index) => index % 7 >= 5);
  chart($("#time-chart"), {
    datasets: [
      series(key === "daily" ? "Daily cohort" : "Cumulative", values, mint, { pointRadius: 3 }),
      series("Weekend cohort", weekends, blue, { showLine: false, pointRadius: 5, pointStyle: "rect" }),
      series("Planned end", [{ x: 21, y: lower }, { x: 21, y: upper }], gold, { borderDash: [5, 4] }),
    ], x: { min: 1, max: 22, title: axis("Enrollment day (first exposure opportunity)") },
    y: { title: axis("Offer − control (pp)") }, legend: true,
  });
}
$("#time-table").innerHTML = table(["Cohort day", "Weekday", "Assigned per arm", "Control conversions", "Offer conversions", "Daily lift", "Cumulative lift"],
  trial.map(row => [row.day + (row.day === 21 ? " · planned end" : ""), row.weekday, row.n, row.control, row.offer, points(row.daily), points(row.cumulative)]),
  "Every cohort is observed for seven days from assignment");
time.addEventListener("change", timePlot);
timePlot();
