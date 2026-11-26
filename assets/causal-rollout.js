import { mean } from "./experiment-stats.js";
import { $, all, axis, blue, chart, gold, mint, series, signed, table } from "./experiment-tools.js";

const rolloutTable = $("[data-rollout-table]");
const dates = all("[data-period]", rolloutTable).map(cell => Number(cell.dataset.period));
const cohorts = all("tbody tr", rolloutTable).map(row => ({
  key: row.dataset.cohort,
  name: row.cells[0].textContent,
  adoption: row.hasAttribute("data-adoption") ? Number(row.dataset.adoption) : Infinity,
  rates: new Map(dates.map((date, i) => [date, Number.parseFloat(row.cells[i + 1].textContent)])),
  row,
}));

function comparison(treated, date, pool, omitNever) {
  const baseline = treated.adoption - 1;
  const change = cohort => cohort.rates.get(date) - cohort.rates.get(baseline);
  const available = cohorts.filter(cohort => cohort !== treated && cohort.adoption > date &&
    (!omitNever || cohort.key !== "never") && Number.isFinite(change(cohort)));
  const controls = available.filter(cohort => pool === "untreated" || (pool === "never"
    ? cohort.key === "never" : pool === "other" && cohort.key !== "never"));
  const treatedChange = change(treated);
  const controlChange = mean(controls.map(change));
  return { baseline, date, treated, treatedChange, controls, available, change, controlChange,
    contrast: controls.length && Number.isFinite(treatedChange) ? treatedChange - controlChange : null };
}

function markCells(result, omitNever, showTreated) {
  for (const cohort of cohorts) {
    cohort.row.hidden = omitNever && cohort.key === "never";
    for (const [index, date] of dates.entries()) {
      const cell = cohort.row.cells[index + 1];
      const used = (date === result.baseline || date === result.date) &&
        (cohort === result.treated || result.controls.includes(cohort));
      const treated = showTreated && cohort.adoption <= date;
      cell.classList.toggle("rollout-used", used);
      const role = used ? (cohort === result.treated ? " · Target" : " · Control") : treated ? " · Exposed" : "";
      const rate = cohort.rates.get(date);
      cell.textContent = (Number.isFinite(rate) ? rate + "%" : "Missing") + role;
    }
  }
}

const grid = $("#cohort-grid-form");
if (grid) {
  const { cohort, date, pool, omitNever } = grid.elements;
  const colors = [mint, blue];
  const status = $("#cohort-grid-status");
  function updateGrid() {
    const treated = cohorts.find(item => item.key === cohort.value);
    for (const option of date.options) option.disabled = Number(option.value) < treated.adoption;
    if (Number(date.value) < treated.adoption) date.value = String(treated.adoption);
    const result = comparison(treated, Number(date.value), pool.value, omitNever.checked);
    markCells(result, omitNever.checked, true);
    const excluded = cohorts.filter(item => item !== treated && item.adoption <= result.date).map(item => item.name);
    const exclusion = excluded.length ? ` ${excluded.join(" and ")} already received treatment by this date.` : "";
    if (!Number.isFinite(result.treatedChange)) {
      status.textContent = "The treated cohort needs observed baseline and follow-up outcomes." + exclusion;
    } else if (result.contrast === null) {
      status.textContent = result.available.length
        ? "No comparison in the selected pool. Try all cohorts untreated through follow-up."
        : "No untreated comparison at this date." + exclusion;
    } else {
      status.textContent = `${treated.name} stores changed ${signed(result.treatedChange, 0)} points and the comparison changed ${signed(result.controlChange, 0)}. The estimated contrast is ${signed(result.contrast, 0)} percentage points.` + exclusion;
    }

    const estimates = cohorts.filter(item => Number.isFinite(item.adoption)).map(item => ({
      item, points: dates.filter(t => t >= item.adoption).map(t => comparison(item, t, pool.value, omitNever.checked)),
    }));
    $("#cohort-grid-comparisons").innerHTML = table(
      ["Cohort", "Change (pp)", "Comparison weight"],
      [[treated.name + " (target)", signed(result.treatedChange, 0), "—"],
        ...result.controls.map(control => [control.name, signed(result.change(control), 0), `1/${result.controls.length}`])],
      `Month ${result.baseline} to month ${result.date}`,
    ) + table(["Cohort · event time", "Comparisons", "Contrast (pp)"],
      estimates.flatMap(({ item, points }) => points.map(point => [
        `${item.name} · e = ${point.date - item.adoption}`,
        point.controls.map(control => control.name).join(", ") || "None",
        point.contrast === null ? "Unsupported" : signed(point.contrast, 0),
      ])), "Effects by horizon");
    $("#cohort-grid-output").hidden = false;
    chart($("#cohort-grid-chart"), {
      legend: true,
      x: { title: axis("Event time (months)"), min: -1, max: 1, ticks: { stepSize: 1 } },
      y: { title: axis("Contrast (percentage points)"), suggestedMin: 0, suggestedMax: 6 },
      datasets: [
        ...estimates.map(({ item, points }, index) => series(item.name, [
          { x: -1, y: 0 },
          ...points.map(point => ({ x: point.date - item.adoption, y: point.contrast })),
        ], colors[index], { borderDash: index ? [6, 4] : [], pointStyle: index ? "triangle" : "circle", pointRadius: 4 })),
        ...(result.contrast === null ? [] : [series("Selected contrast", [
          { x: result.date - treated.adoption, y: result.contrast },
        ], gold, { pointRadius: 7, pointStyle: "crossRot" })]),
      ],
    });
  }
  grid.addEventListener("change", updateGrid);
  grid.addEventListener("submit", event => event.preventDefault());
  updateGrid();
}

const transfer = $("#rollout-transfer-form");
if (transfer) {
  const { cohort, pool, contrast, assumption, omitNever } = transfer.elements;
  const status = $("#rollout-transfer-status");
  const selectedCohort = () => cohorts.find(item => item.key === cohort.value);
  transfer.addEventListener("input", () => {
    status.textContent = "";
    const treated = selectedCohort();
    markCells(comparison(treated, treated.adoption, "none", omitNever.checked), omitNever.checked, false);
  });
  transfer.addEventListener("submit", event => {
    event.preventDefault();
    const treated = selectedCohort();
    const result = comparison(treated, treated.adoption, pool.value, omitNever.checked);
    if (!pool.value || !assumption.value) {
      status.textContent = "Choose a comparison decision and a reason.";
      return;
    }
    if (!result.available.length) {
      status.textContent = pool.value === "none" && !contrast.value && assumption.value === "missing"
        ? "Correct. No untreated comparison remains in month 1. The early stores were already exposed, so their change may include an evolving offer effect."
        : "No untreated comparison remains in month 1. Choose no credible comparison, leave the contrast blank, and explain why.";
      return;
    }
    if (result.contrast === null) {
      status.textContent = `A comparison is still available (${result.available.map(item => item.name).join(", ")}). Choose stores that were untreated through month ${result.date}.`;
      return;
    }
    if (contrast.valueAsNumber !== result.contrast) {
      status.textContent = `The treated cohort gained ${result.treatedChange} points and the comparison gained ${result.controlChange}. Enter the difference in those changes.`;
      return;
    }
    if (assumption.value !== "parallel") {
      status.textContent = "The arithmetic is right. Identify the assumption about what would have happened without the offer.";
      return;
    }
    status.textContent = `Correct. ${result.treatedChange} − ${result.controlChange} = ${signed(result.contrast, 0)} percentage points for eligible customers in the ${treated.name.toLowerCase()} stores at adoption. The interpretation also requires no anticipation and comparable composition.`;
  });
}
