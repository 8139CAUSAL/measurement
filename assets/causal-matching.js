import { $, all, axis, chart, count, decimal, integer, mint, muted, series, signed, table } from "./experiment-tools.js";
import { matchingExample } from "./causal-matching-data.js";

const { covariates, memberCount, results } = matchingExample;
const fields = all("#matching-fields select");
const canvas = $("#matching-love");
const estimates = [
  ["Before matching: post-join difference", "ATT"],
  ["Before matching: DiD", "ATT"],
  ["Matched: post-join difference", "ATT<sub>M</sub>"],
  ["Matched: DiD", "ATT<sub>M</sub>"],
];
// Decimal places for each covariate row: logit score, two spend rows ($/mo), orders, months, West region (%).
const digits = [2, 1, 1, 2, 1, 1];
const level = (value, index) => index === covariates.length - 1
  ? `${decimal(100 * value, digits[index])}%` : decimal(value, digits[index]);
const smds = Object.values(results).flatMap(({ balance }) => [...balance.before, ...balance.after]);
const minSmd = Math.floor((Math.min(-.2, ...smds) - .05) * 2) / 2;
const maxSmd = Math.ceil((Math.max(.2, ...smds) + .05) * 2) / 2;
const balanceRows = covariates.map((name, index) => (index === 1 || index === 2) ? `${name} ($/mo)` : name);
const layout = { layout: "stack" };

// Phone-width charts clip long row labels; the balance table keeps the full names.
const shortLabels = { "Logit propensity score": "Logit score", "Six-month average spend": "Six-month spend" };
const rowLabel = name => canvas.clientWidth < 420 ? (shortLabels[name] ?? name) : name;

function drawLovePlot({ before, after }) {
  const points = values => values.map((x, index) => ({ x, y: index + 1 }));
  const bottom = covariates.length + .5;
  chart(canvas, {
    legend: true,
    datasets: [
      series("Before matching", points(before), muted, {
        showLine: false, pointRadius: 5.5, pointBackgroundColor: "transparent",
      }),
      series("After matching", points(after), mint, { showLine: false, pointRadius: 4, pointBorderWidth: 1 }),
      series("±0.1", [
        { x: -.1, y: .5 }, { x: -.1, y: bottom }, { x: 0, y: null },
        { x: .1, y: .5 }, { x: .1, y: bottom },
      ], muted, { borderWidth: 1, borderDash: [4, 4] }),
    ],
    x: {
      title: axis("Standardized mean difference"),
      min: minSmd,
      max: maxSmd,
      ticks: { stepSize: .5, color: muted },
    },
    y: {
      min: .5, max: bottom, reverse: true,
      afterBuildTicks: scale => { scale.ticks = covariates.map((_, index) => ({ value: index + 1 })); },
      ticks: { autoSkip: false, color: muted, callback: value => rowLabel(covariates[value - 1]) },
    },
  });
}

function formatStatus(status, caliper, controls) {
  const { matched, outsideCaliper, controlsUsed, partial, maxReuse, effectiveControls } = status;
  const sentences = [`${integer(matched)} of ${integer(memberCount)} members matched.`];
  if (caliper !== "none") {
    sentences.push(`${integer(outsideCaliper)} had no non-member within the caliper.`);
  }
  if (controls === "without-replacement") {
    const eligible = caliper === "none" ? "eligible non-members" : "non-members within the caliper";
    if (caliper !== "none" || controlsUsed) {
      sentences.push(`${integer(controlsUsed)} had ${eligible}, but all were already matched to other members.`);
    }
  } else {
    sentences.push(`The most-used non-member served as a control for ${count(maxReuse, "member")}. The control effective sample size is ${decimal(effectiveControls, 1)}.`);
  }
  if (controls === "three-with-replacement") {
    sentences.push(`${count(partial, "matched member")} received fewer than 3 controls.`);
  }
  return sentences.join(" ");
}

function describeMatchedMembers(result) {
  const matched = result.status.matched;
  const dropped = memberCount - matched;
  const [, att] = result.estimates[0];
  if (dropped === 0) {
    return `Every member has a match, so both known effects are $${decimal(att)} per member per month.`;
  }
  const [allSpend, , matchedSpend] = result.balance.means[1];
  const droppedSpend = (memberCount * allSpend - matched * matchedSpend) / dropped;
  const [, attMatched] = result.estimates[3];
  return `The members left without a match averaged $${decimal(droppedSpend, 1)} per month over the six-month baseline. Matched members averaged $${decimal(matchedSpend, 1)}. The known monthly effect is $${decimal(attMatched)} for matched members and $${decimal(att)} for all members.`;
}

function describeSmd(smd) {
  return `${signed(smd)}${Math.abs(smd) > .1 ? " (outside the ±0.1 lines)" : ""}`;
}

function describeBaselineChange(measure, balance, [sixMonthError, monthBeforeError]) {
  const [, , memberAverage, controlAverage] = balance.means[1];
  const [, , memberMonth, controlMonth] = balance.means[2];
  const gap = (memberMonth - memberAverage) - (controlMonth - controlAverage);
  const comparison = Math.abs(gap) < .005
    ? "about the same for both groups"
    : `$${decimal(Math.abs(gap))} larger for ${gap > 0 ? "members" : "controls"}`;
  return `When matching on ${measure}, the change from six-month average spend to last-month spend was ${comparison}. Using the last month for DiD then moves the error from ${signed(sixMonthError)} to ${signed(monthBeforeError)} dollars per member per month.`;
}

function update() {
  const [distance, caliper, controls, baseline] = fields.map(field => field.value);
  const strategy = [distance, caliper, controls].join("|");
  const sixMonthResult = results[`${strategy}|six-month`];
  const monthBeforeResult = results[`${strategy}|month-before`];
  const usesSixMonths = baseline === "six-month";
  const result = usesSixMonths ? sixMonthResult : monthBeforeResult;
  const alternate = usesSixMonths ? monthBeforeResult : sixMonthResult;
  const { balance, status, baselineBreakdown } = result;
  $("#matching-status").textContent = formatStatus(status, caliper, controls);
  drawLovePlot(balance);
  $("#matching-balance").innerHTML = table([
    "Covariate", "All members", "All non-members", "Matched members", "Matched non-members",
    "SMD before", "SMD after", "Variance ratio after",
  ], balanceRows.map((label, index) => [
    label,
    ...balance.means[index].map(value => level(value, index)),
    signed(balance.before[index]), signed(balance.after[index]),
    balance.varianceRatio[index] === null ? "—" : decimal(balance.varianceRatio[index]),
  ]), "Covariate balance before and after matching", layout);
  $("#matching-pooled-sd").innerHTML = table(["Covariate", "Pooled SD"], balanceRows.map((label, index) => [
    label, index === covariates.length - 1 ? `${decimal(100 * balance.pooledSd[index], digits[index])} pp`
      : decimal(balance.pooledSd[index], digits[index]),
  ]));
  $("#matching-estimates").innerHTML = table(
    ["Estimator", "Estimate", "Target", "Known target value", "Estimate − target"],
    result.estimates.map(([value, target], index) => {
      const [label, estimand] = estimates[index];
      return [label, signed(value), estimand, decimal(target), signed(value - target)];
    }),
    "Point estimates ($ per member per month). The simulation supplies the known targets. Intervals require a variance method for matching.",
    layout,
  );
  $("#matching-baseline-breakdown").innerHTML = table(
    ["Spend used for matching", "DiD using six-month average", "DiD using month before"],
    baselineBreakdown.map((errors, index) => [
      index === 0 ? "Six-month average" : "Month before", ...errors.map(value => signed(value)),
    ]),
    "Matched DiD − known matched effect ($ per member per month)",
    layout,
  );
  $("#matching-caliper-example").textContent = describeMatchedMembers(result);
  const [, sixMonthSmd, monthBeforeSmd] = balance.after;
  const [, nextSixMonthSmd, nextMonthBeforeSmd] = alternate.balance.after;
  const alternateBaseline = usesSixMonths ? "the month before the index date" : "the six-month average";
  $("#matching-spend-example").textContent =
    `With the other settings fixed, switching to ${alternateBaseline} changes the six-month spend SMD from ${signed(sixMonthSmd)} to ${describeSmd(nextSixMonthSmd)} and the last-month spend SMD from ${signed(monthBeforeSmd)} to ${describeSmd(nextMonthBeforeSmd)}.`;
  $("#matching-six-month-example").textContent = describeBaselineChange(
    "the six-month average", sixMonthResult.balance, baselineBreakdown[0]);
  $("#matching-month-before-example").textContent = describeBaselineChange(
    "the month before the index date", monthBeforeResult.balance, baselineBreakdown[1]);
}

for (const field of fields) field.addEventListener("change", update);
update();
