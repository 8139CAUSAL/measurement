import { allocate, blockContrast, fairCoinSrm, groupBy, mean, normalQuantile, quantile, seededRandom, smd, variance } from "./experiment-stats.js";
import { $, all, axis, blue, chart, decimal, initializeTabs, interval, mint, points, probability, series, signed, table } from "./experiment-tools.js";

initializeTabs();
const random = seededRandom(2411);
const records = Array.from({ length: 36 }, (_, i) => {
  const spend = 35 + 4 * i + Math.floor(4 * random());
  return {
    id: `AC-${String(i + 1).padStart(2, "0")}`,
    spend, block: ["Lower", "Middle", "Higher"][Math.floor(i / 12)],
    outcome: 12 + .8 * spend + 15 * (random() - .5),
  };
});
$("#assignment-file").innerHTML = [...records.slice(0, 3), ...records.slice(-3)].map(row =>
  `<tr><th scope="row">${row.id}</th><td>${row.block}</td><td>$${row.spend}</td></tr>`).join("");

const rule = $("#allocation-rule");
const log = $("#assignment-log");
const repetitions = $("#assignment-repetitions");
const armNames = ["Control", "Offer"];
const rowsFor = (rows, arm) => rows.filter(row => row.arm === arm);
let assigned;

function renderAudit() {
  const replay = log.value === "replay";
  const logging = replay ? [...assigned.slice(1), assigned[1]] : assigned;
  const unique = new Map(logging.map(row => [row.id, row]));
  const observed = [...unique.values()];
  const missing = assigned.filter(row => !unique.has(row.id));
  const duplicates = logging.length - observed.length;
  const planned = groupBy(assigned, row => row.block);
  const observedOffer = rowsFor(observed, 1).length;
  const ruleMessage = {
    sorted: "Arm counts follow the file order.",
    coin: `Independent 50/50 count check (SRM) p = ${probability(fairCoinSrm(observed.length, observedOffer))}.`,
    fixed: "Check the overall count against the fixed 18 / 18 quota.",
    blocked: "Check each band against its fixed 6 / 6 quota.",
  }[rule.value];
  $("#assignment-audit").textContent = replay
    ? `Log has ${logging.length} rows and ${observed.length} distinct IDs. The log omits ledger ID ${missing.map(row => row.id).join(", ")} and repeats ${assigned[1].id} (${duplicates} extra row). Trace the log before interpreting balance or testing arm counts.`
    : `${observed.length} distinct IDs match the ledger. ${ruleMessage}`;
  const countRow = (block, baseline, sample) => [block,
    ...armNames.map((_, arm) => `${rowsFor(sample, arm).length} / ${rowsFor(baseline, arm).length}`)];
  $("#assignment-counts").innerHTML = table(["Spend band", "Control logged / ledger", "Offer logged / ledger"],
    [...planned].map(([block, members]) => countRow(block, members, observed.filter(row => row.block === block)))
      .concat([countRow("All", assigned, observed)]));

  const spends = armNames.map((_, arm) => rowsFor(assigned, arm).map(row => row.spend).sort((a, b) => a - b));
  const summaries = spends.map(values => values.length ? [0, .25, .5, .75, 1].map(q => quantile(values, q)) : []);
  const difference = smd(...spends);
  $("#assignment-box-table").innerHTML = table(
    ["Assigned arm", "Mean", "Minimum", "Q1", "Median", "Q3", "Maximum"],
    armNames.map((name, i) => [name, decimal(mean(spends[i]), 1), ...Array.from({ length: 5 }, (_, j) => decimal(summaries[i][j], 1))]),
    `Baseline spend on the assignment ledger · signed SMD ${difference === null ? "undefined" : signed(difference, 3)}`,
  );
  const datasets = summaries.flatMap((summary, i) => {
    if (!summary.length) return [];
    const [min, q1, median, q3, max] = summary;
    const y = i + 1;
    const color = i ? mint : blue;
    const line = coordinates => series(armNames[i], coordinates.map(([x, ordinate]) => ({ x, y: ordinate })), color);
    return [
      line([[min, y], [q1, y]]), line([[q3, y], [max, y]]),
      line([[q1, y - .21], [q3, y - .21], [q3, y + .21], [q1, y + .21], [q1, y - .21]]),
      line([[median, y - .21], [median, y + .21]]), ...[min, max].map(x => line([[x, y - .13], [x, y + .13]])),
    ];
  });
  chart($("#assignment-boxes"), {
    datasets, x: { title: axis("Baseline spend (dollars)") },
    y: { min: .5, max: 2.5, ticks: { color: blue, stepSize: .5, callback: value => armNames[value - 1] || "" } },
  });
}

function redraw() {
  assigned = allocate(records, rule.value, random);
  renderAudit();
}

function simulate() {
  repetitions.hidden = false;
  const labels = ["Sorted split", "Coin flips", "Fixed-count", "Blocked"];
  const rules = ["sorted", "coin", "fixed", "blocked"];
  const samples = rules.map(method => Array.from({ length: 400 }, () => {
    const draw = allocate(records, method, random);
    const control = mean(rowsFor(draw, 0).map(row => row.outcome));
    const offer = mean(rowsFor(draw, 1).map(row => row.outcome + 8));
    return offer - control;
  }).filter(Number.isFinite).sort((a, b) => a - b));
  const low = Math.floor(Math.min(8, ...samples.flat()) / 2) * 2;
  const high = Math.floor(Math.max(8, ...samples.flat()) / 2) * 2;
  const bins = Array.from({ length: (high - low) / 2 + 1 }, (_, i) => low + i * 2);
  chart($("#assignment-spread"), {
    datasets: samples.map((values, i) => {
      const frequency = new Map();
      for (const value of values) {
        const bin = Math.floor(value / 2) * 2;
        frequency.set(bin, (frequency.get(bin) || 0) + 1);
      }
      return series(labels[i], bins.map(x => ({ x: x + 1, y: (frequency.get(x) || 0) / values.length * 100 })),
        ["#ffd384", blue, "#e4a9ee", mint][i], { pointRadius: 2.5, pointStyle: ["triangle", "rect", "crossRot", "circle"][i], borderDash: i % 2 ? [5, 4] : [] });
    }),
    x: { title: axis("Estimated difference (outcome units, bins of width 2)") },
    y: { title: axis("Draws (%)"), beginAtZero: true },
    legend: true,
  });
  $("#assignment-spread-table").innerHTML = table(["Allocation", "Usable draws", "Average", "SD", "Middle 90%"],
    samples.map((values, i) => [labels[i], values.length, decimal(mean(values)), decimal(Math.sqrt(variance(values))),
      `${decimal(quantile(values, .05))} to ${decimal(quantile(values, .95))}`]), "The true effect in this illustration is +8 units");
}

rule.addEventListener("change", redraw);
log.addEventListener("change", renderAudit);
$("#assignment-redraw").addEventListener("click", redraw);
$("#assignment-repeat").addEventListener("click", simulate);
redraw();

const example = blockContrast([{ n0: 80, x0: 12, n1: 20, x1: 4 }, { n0: 50, x0: 15, n1: 50, x1: 30 }]);
$("#unequal-block-example").innerHTML = table(["Target", "Lower-band weight", "Higher-band weight", "Effect (pp)", "95% CI (pp)"],
  [
    ["Enrolled accounts", ...example.weights.map(value => decimal(value.enrolled, 3)), points(example.stratified.effect), interval(example.stratified)],
    ["Common-slope regression", ...example.weights.map(value => decimal(value.regression, 3)), points(example.fixed.effect), interval(example.fixed)],
  ], "Lower band +5 pp at 20% assigned offer, higher band +30 pp at 50% assigned offer");

const cellRows = $("#interaction-cells");
const templates = { additive: [45, 55, 60, 70], crossover: [45, 75, 75, 45] };
const levelNames = () => $("#interaction-factor").value === "baseline" ? ["Lower activity", "Higher activity"] : ["No reminder", "Reminder"];
const critical = normalQuantile(.975);
cellRows.innerHTML = Array.from({ length: 4 }, (_, i) => `<tr>
  <th scope="row" id="factor-cell-${i}"></th>
  <td><label><input aria-labelledby="factor-cell-${i} factor-mean-${i}" type="number" step="any" data-cell-mean><span id="factor-mean-${i}" class="mg-sr-only">Mean</span></label></td>
  <td><label><input aria-labelledby="factor-cell-${i} factor-n-${i}" type="number" min="1" step="1" data-cell-size><span id="factor-n-${i}" class="mg-sr-only">Count</span></label></td>
  <td data-cell-interval></td></tr>`).join("");
const means = all("[data-cell-mean]", cellRows);
const sizes = all("[data-cell-size]", cellRows);

function interactions() {
  const levels = levelNames();
  const values = means.map(input => input.valueAsNumber);
  const counts = sizes.map(input => input.valueAsNumber);
  const result = $("#interaction-summary");
  const plot = $("#interaction-chart");
  const names = all("th", cellRows);
  const intervals = all("[data-cell-interval]", cellRows);
  names.forEach((name, i) => { name.textContent = `${levels[Math.floor(i / 2)]} · ${armNames[i % 2]}`; });
  $("#interaction-meaning").textContent = $("#interaction-factor").value === "baseline"
    ? "Baseline activity identifies variation in the offer effect across groups. These contrasts do not identify the causal effect of changing activity."
    : "If both offer and reminder are randomized and there is adequate follow-up, the difference compares the effect of the offer under the two reminder assignments.";
  const valid = values.every(Number.isFinite) && counts.every(n => Number.isSafeInteger(n) && n > 0);
  plot.parentElement.hidden = !valid;
  intervals.forEach((cell, i) => {
    const half = critical * 20 / Math.sqrt(counts[i]);
    cell.textContent = valid ? `${decimal(values[i] - half)} to ${decimal(values[i] + half)}` : "—";
  });
  if (!valid) {
    result.textContent = "Enter a finite mean and a positive whole count for every cell.";
    $("#interaction-effects").replaceChildren();
    return;
  }
  const [first, second] = [values[1] - values[0], values[3] - values[2]];
  const v = counts.map(n => 400 / n);
  const armVariances = [v[0] + v[1], v[2] + v[3]];
  const rows = [
    [levels[0], first, armVariances[0]], [levels[1], second, armVariances[1]],
    ["Interaction (second effect − first)", second - first, armVariances[0] + armVariances[1]],
    ["Marginal effect (equal weights)", (first + second) / 2, (armVariances[0] + armVariances[1]) / 4],
  ];
  $("#interaction-effects").innerHTML = table(["Contrast", "Units", "95% interval"],
    rows.map(([label, estimate, varEstimate]) => [label, signed(estimate),
      `${decimal(estimate - critical * Math.sqrt(varEstimate))} to ${decimal(estimate + critical * Math.sqrt(varEstimate))}`]));
  result.textContent = `Simple effects ${signed(first)} and ${signed(second)} units. Equal-weight average ${signed((first + second) / 2)} units.`;
  chart(plot, {
    datasets: armNames.map((name, arm) => series(name, [{ x: 0, y: values[arm] }, { x: 1, y: values[arm + 2] }],
      arm ? mint : blue, { pointRadius: 6, pointStyle: arm ? "circle" : "rect", borderDash: arm ? [] : [6, 4] })),
    labels: levels,
    x: { type: "category", offset: true },
    y: { title: axis("Mean outcome (units)") }, legend: true,
  });
}

function setExample() {
  const values = templates[$("#interaction-example").value];
  means.forEach((input, i) => { input.value = values[i]; sizes[i].value = 60; });
  interactions();
}
$("#interaction-example").addEventListener("change", setExample);
$("#interaction-factor").addEventListener("change", interactions);
cellRows.addEventListener("input", interactions);
setExample();
