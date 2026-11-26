import { $, axis, chart, gold, mint, series, table } from "./experiment-tools.js";

const frequency = $("#rf-frequency");
if (frequency) {
  const impressions = 1e6;
  const hill = f => f ** 2 / (3 ** 2 + f ** 2);
  const row = f => ({ f, reach: impressions / f, response: impressions / f * hill(f) });
  const population = $("#rf-population");
  const number = value => Math.round(value).toLocaleString("en-US");
  function renderFrequency() {
    const minimum = Math.max(1.5, Math.ceil(4 * impressions / +population.value) / 4);
    frequency.min = minimum;
    $("#rf-two").disabled = minimum > 2;
    const grid = Array.from({ length: 1 + (10 - minimum) * 4 }, (_, i) => row(minimum + i / 4));
    const best = grid.reduce((a, b) => a.response >= b.response ? a : b);
    const chosen = row(+frequency.value);
    $("#rf-result").textContent = `Frequency ${chosen.f} · ${number(chosen.reach)} people · ${number(chosen.response)} response units. Best on this grid: frequency ${best.f}, ${number(best.response)} units${best.f === minimum ? " (lowest feasible frequency)" : ""}.`;
    $("#rf-table").innerHTML = table(["Frequency", "People reached", "Modeled response units"],
      grid.map(d => [d.f, number(d.reach), number(d.response)]));
    chart($("#rf-chart"), {
      datasets: [
        series("Per-person response", grid.map(({ f }) => ({ x: f, y: hill(f) })), mint),
        series("Selected frequency", [{ x: chosen.f, y: hill(chosen.f) }], gold, { pointRadius: 6 }),
      ],
      x: { min: minimum, max: 10, title: axis("Average frequency") },
      y: { min: 0, max: 1, title: axis("Response per person") },
      legend: true,
    });
  }
  for (const [selector, value] of [["#rf-two", 2], ["#rf-ten", 10]]) {
    $(selector).addEventListener("click", () => {
      frequency.value = value;
      renderFrequency();
    });
  }
  frequency.addEventListener("input", renderFrequency);
  population.addEventListener("change", renderFrequency);
  renderFrequency();

  const decay = $("#decay-slider");
  function renderOrder() {
    let exposure = 0;
    let laggedResponse = 0;
    const response = value => 4000 * Math.tanh(value / 2000);
    const alpha = +decay.value;
    const money = value => "$" + Math.round(value).toLocaleString("en-US");
    const rows = [2000, 0].map((spend, i) => {
      exposure = alpha * exposure + (1 - alpha) * spend;
      const rawResponse = response(spend);
      laggedResponse = alpha * laggedResponse + (1 - alpha) * rawResponse;
      return [i + 1, money(spend), money(exposure), money(response(exposure)), money(rawResponse), money(laggedResponse)];
    });
    $("#carryover-table").innerHTML = table(["Week", "Raw spend", "Effective exposure", "Adstock → response", "Response at raw spend", "Response → adstock"], rows);
  }
  decay.addEventListener("input", renderOrder);
  renderOrder();
}

const funnel = $("#media-funnel-contrast");
if (funnel) {
  function renderFunnel() {
    const direct = funnel.value === "direct";
    $("#funnel-indirect").setAttribute("opacity", direct ? ".4" : "1");
    $("#media-funnel-result").textContent = direct
      ? "Interest stays fixed. The direct effect is 1 unit of sales."
      : "Interest increases by 2 units, adding 6 units of sales. Sales increase by 7 units in total.";
  }
  funnel.addEventListener("change", renderFunnel);
  renderFunnel();
}

$("#media-transfer-form")?.addEventListener("submit", event => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const correct = ["schedule", "population", "outcome"].every(name => fields.has(name)) && !fields.has("account");
  $("#media-transfer-result").textContent =
    (correct ? "These commitments define the media comparison. " : "Select the schedules, the market design and the revenue readout. ") +
    "The trial assigned an offer and measured 30-day conversion in percentage points. " +
    "The geo study needs its own signed revenue estimate in dollars and uncertainty for the assigned Search schedules.";
});
