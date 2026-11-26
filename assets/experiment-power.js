import { minimumDetectable, normalPower } from "./experiment-stats.js";
import { $, axis, chart, decimal, gold, mint, percent, series, sizingForm, table } from "./experiment-tools.js";

const form = $("#binary-sizing-form");
const update = sizingForm(form);
form.addEventListener("reset", () => requestAnimationFrame(update));
form.addEventListener("submit", event => event.preventDefault());

const pairedForm = $("#paired-did-form");
const pairedStatus = $("#paired-did-status");
const pairedOutput = $("#paired-did-result");
const pairedCanvas = $("#paired-did-chart");

function updatePaired() {
  const [treated, control, sd, correlation, alphaPercent, powerPercent] =
    ["treated", "control", "outcomeSD", "correlation", "alpha", "power"].map(name => pairedForm.elements[name].valueAsNumber);
  const alpha = alphaPercent / 100;
  const power = powerPercent / 100;
  const changeVariance = 2 * (1 - correlation) * sd ** 2;
  const se = Math.sqrt(changeVariance / treated + changeVariance / control);
  const valid = [treated, control].every(n => Number.isSafeInteger(n) && n >= 2) &&
    sd > 0 && correlation >= -1 && correlation < 1 && se > 0 && Number.isFinite(se) &&
    changeVariance > 0 && alpha / 2 > 0 && power > alpha && power < 1;
  pairedOutput.hidden = !valid;
  if (!valid) {
    pairedStatus.textContent = "Use at least two independent units per arm, positive finite change variance, correlation from −1 to below 1, and 0% < alpha < target power < 100%.";
    return;
  }
  const mde = minimumDetectable(alpha, power) * se;
  const curve = Array.from({ length: 41 }, (_, i) => {
    const effect = mde * i / 25;
    return { x: effect, y: normalPower(effect / se, alpha) };
  });
  const units = value => value < .01 ? value.toPrecision(3) : decimal(value);
  pairedStatus.textContent = `Change variance per arm is ${units(changeVariance)}. SE is ${units(se)} outcome units. The minimum detectable effect at ${percent(power)} power is ${units(mde)} outcome units.`;
  $("#paired-did-table").innerHTML = table(["Effect size (outcome units)", "Power"],
    [0, .5, 1, 1.5].map(multiplier => [
      multiplier ? units(mde * multiplier) : "0", percent(normalPower(mde * multiplier / se, alpha)),
    ]), "Normal-approximation power");
  chart(pairedCanvas, {
    datasets: [
      series("Power", curve, mint),
      series("Minimum detectable effect", [{ x: mde, y: 0 }, { x: mde, y: power }], gold, { borderDash: [5, 4] }),
      series("Target power", [{ x: 0, y: power }, { x: mde, y: power }], gold, { borderDash: [5, 4] }),
      series("Target at the minimum detectable effect", [{ x: mde, y: power }], mint, { pointStyle: "rectRot", pointRadius: 6 }),
    ],
    x: { title: axis("Absolute effect size (outcome units)"), min: 0 },
    y: { title: axis("Power"), min: 0, max: 1 },
  });
}

pairedForm.addEventListener("input", updatePaired);
pairedForm.addEventListener("reset", () => requestAnimationFrame(updatePaired));
pairedForm.addEventListener("submit", event => event.preventDefault());
updatePaired();
