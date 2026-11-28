import { $, axis, blue, chart, gold, intervalChart, muted, series, table } from "./experiment-tools.js";
import { points } from "./media-charts.js";
import { mean, searchColor, sum } from "./media-model.js";

const creditEvidence = $("#media-credit-evidence");
const creditDisclosure = $("#displaced-credit");
const video = [5, 15, 25, 45].flatMap(spend => Array(26).fill(spend));
const transformedVideo = video.map(spend => spend / (spend + 15));
const paidSearch = video.map((spend, week) => 4 + .4 * spend + (week % 26 < 13 ? 4 : -4));
const videoMean = mean(transformedVideo);
const searchMean = mean(paidSearch);
const centeredSearch = paidSearch.map(spend => spend - searchMean);
const centeredVideo = transformedVideo.map(spend => spend - videoMean);
const videoOnSearch = sum(centeredSearch.map((spend, i) => spend * centeredVideo[i])) /
  sum(centeredSearch.map(spend => spend ** 2));
const residualVideo = centeredVideo.map((spend, i) => spend - videoOnSearch * centeredSearch[i]);
const contrast = 25 / (25 + 15) - 15 / (15 + 15);
const direct = contrast * 240;
const policy = direct + .4 * (25 - 15) * 4;
const historySD = 100 * contrast / Math.sqrt(sum(residualVideo.map(spend => spend ** 2)));
const studySE = 3;
const weight = historySD ** 2 / (historySD ** 2 + studySE ** 2);
const creditPresets = {
  history: { estimate: direct, sd: historySD, message: "This estimate uses the simulated history alone." },
  fixed: { estimate: direct + weight * (28.2 - direct), sd: studySE * Math.sqrt(weight),
    message: "The fixed-Search study reports 28.2 orders/week (SE 3) and measures the contrast under this design." },
  responsive: { estimate: direct + weight * (44.5 - direct), sd: studySE * Math.sqrt(weight),
    message: "Applying the responsive-Search readout of 44.5 orders/week (SE 3) to the direct contrast overstates Video’s direct effect and shifts credit away from Search and baseline." },
};

function renderCredit() {
  const { estimate, sd, message } = creditPresets[creditEvidence.value];
  const low = estimate - 1.95996398454 * sd;
  const high = estimate + 1.95996398454 * sd;
  const videoShift = (estimate - direct) / contrast;
  const searchShift = -videoShift * videoOnSearch;
  const videoOrders = videoShift * videoMean * video.length;
  const searchOrders = searchShift * searchMean * video.length;
  const ledgerRows = [["Video", videoOrders], ["Paid Search", searchOrders],
    ["Baseline", -videoOrders - searchOrders]];
  const formatOrders = new Intl.NumberFormat("en-US", { signDisplay: "exceptZero", maximumFractionDigits: 0 });
  $("#media-credit-result").textContent =
    `Direct lift ${estimate.toFixed(2)} orders/week (95% credible interval ${low.toFixed(2)} to ${high.toFixed(2)}). ${message}`;
  intervalChart($("#media-credit-interval"),
    [{ label: "Direct lift", estimate, low, high, color: searchColor }],
    [{ label: "Known direct lift", value: direct, color: blue, dash: [7, 4] },
      { label: "Known policy total", value: policy, color: gold, dash: [2, 4] }],
    { min: 0, max: 55 });
  $("#media-credit-ledger").innerHTML = table(["Contribution", "Change from history only (orders)"],
    ledgerRows.map(([name, orders]) => [name, formatOrders.format(Math.round(orders))]),
    "Credit shifts over 104 weeks");
}

creditEvidence.addEventListener("change", renderCredit);
creditDisclosure.addEventListener("toggle", () => {
  if (creditDisclosure.open) renderCredit();
});
if (creditDisclosure.open) renderCredit();

const ratioDisclosure = $("#return-likelihood");
const ratioUnits = $("#media-ratio-units");
const ratioFamily = $("#media-ratio-family");
const observedCost = 48000 / 600;
const costSE = 10;
// The exercise restricts returns to finite positive candidates. Signed studies use the lift likelihood.
function reciprocal(value) {
  const rate = 1000 / value;
  return value > 0 && rate > 0 && Number.isFinite(rate) ? rate : null;
}
const observedReturn = reciprocal(observedCost);
const returnSE = 1000 * costSE / observedCost ** 2;
const logSD = costSE / observedCost;
const degreesOfFreedom = 5;
const tScale = costSE * Math.sqrt((degreesOfFreedom - 2) / degreesOfFreedom);
const relativeNormal = z => Math.exp(-.5 * z ** 2);
const reportedNormal = cost => relativeNormal((cost - observedCost) / costSE);
const measurement = {
  reported: {
    likelihood: reportedNormal,
    description: "Changing the display maps the candidate and the observed value to reciprocal units. The Jacobian at the observed value is constant across candidates, so relative support is preserved.",
  },
  fresh: {
    label: "Fresh Normal on orders per $1,000",
    likelihood: cost => relativeNormal((reciprocal(cost) - observedReturn) / returnSE),
    description: `This model assumes symmetric error of about ${returnSE.toFixed(2)} orders per $1,000. On the original scale, error is symmetric in dollars per order.`,
  },
  lognormal: {
    label: `LogNormal with log-SD ${logSD.toFixed(3)}`,
    likelihood: cost => relativeNormal(Math.log(cost / observedCost) / logSD),
    description: "The candidate is the median. The log standard deviation approximates the reported relative error and stays the same under reciprocal units.",
  },
  student: {
    label: `Student-t with ${degreesOfFreedom} df`,
    likelihood: cost => (1 + ((cost - observedCost) / tScale) ** 2 / degreesOfFreedom) ** (-(degreesOfFreedom + 1) / 2),
    description: `With ${degreesOfFreedom} degrees of freedom and SD $${costSE}/order, the Student-t scale is $${tScale.toFixed(2)}/order. The heavier tails give distant candidates more relative support.`,
  },
};

function renderRatio() {
  const showCost = ratioUnits.value === "cost";
  const selected = measurement[ratioFamily.value];
  const units = showCost ? "dollars per incremental order" : "incremental orders per $1,000";
  const display = cost => showCost ? cost : reciprocal(cost);
  const baseline = "Normal on reported cost scale";
  const costs = Array.from({ length: 161 }, (_, i) => 40 + i / 2);
  if (!showCost) costs.reverse();
  const xs = costs.map(display);
  const datasets = [series(baseline, points(xs, costs.map(reportedNormal)), blue)];
  if (selected.label) {
    datasets.push(series(selected.label, points(xs, costs.map(selected.likelihood)), gold,
      { borderDash: [7, 4] }));
  }
  $("#media-ratio-result").textContent = showCost
    ? `Reported benchmark $${observedCost} per incremental order · SE $${costSE} per incremental order.`
    : `Same benchmark ${observedReturn.toFixed(2)} incremental orders per $1,000 · reciprocal SE approximately ${returnSE.toFixed(2)} orders per $1,000.`;
  $("#media-ratio-assumption").textContent = selected.description;
  chart($("#media-ratio-likelihood"), {
    datasets, x: { title: axis(`Candidate return (${units})`) },
    y: { min: 0, max: 1, title: axis("Relative likelihood") }, legend: true,
  });
  const headers = [`Candidate (${units})`, baseline];
  if (selected.label) headers.push(selected.label);
  $("#media-ratio-table").innerHTML = table(headers, [50, 60, 70, 80, 90, 96, 110].map(cost => {
    const row = [display(cost).toFixed(2), reportedNormal(cost).toFixed(4)];
    if (selected.label) row.push(selected.likelihood(cost).toFixed(4));
    return row;
  }), "Relative support for corresponding candidates");
}

ratioUnits.addEventListener("change", renderRatio);
ratioFamily.addEventListener("change", renderRatio);
ratioDisclosure.addEventListener("toggle", () => {
  if (ratioDisclosure.open) renderRatio();
});
if (ratioDisclosure.open) renderRatio();

// Cross-entropy Gamma fit to the illustrative Normal(1.596875, 0.52517854²) truncated
// at zero. The normalizer is Gamma(shape) × scale^shape. Social uses the Meridian default.
const videoPrior = roi => roi ** (7.65555543 - 1) * Math.exp(-roi / .208859586) / .0157580071;
const socialPrior = roi => Math.exp(-.5 * ((Math.log(roi) - .2) / .9) ** 2) / (roi * .9 * Math.sqrt(2 * Math.PI));
const roiDisclosure = $("#experiment-roi-prior");
function renderROI() {
  const returns = Array.from({ length: 120 }, (_, i) => (i + 1) / 20);
  chart($("#media-roi-densities"), {
    datasets: [series("Video calibrated", points(returns, returns.map(videoPrior)), searchColor),
      series("Social default", points(returns, returns.map(socialPrior)), muted, { borderDash: [7, 4] })],
    x: { min: 0, title: axis("Revenue ROI ($ per $ spent)") },
    y: { min: 0, title: axis("Prior density") }, legend: true,
  });
}
$("#media-roi-table").innerHTML = table(["Revenue ROI ($/$)", "Video calibrated density", "Social default density"],
  [.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6].map(roi =>
    [roi.toFixed(1), videoPrior(roi).toFixed(4), socialPrior(roi).toFixed(4)]));
roiDisclosure.addEventListener("toggle", () => {
  if (roiDisclosure.open) renderROI();
});
if (roiDisclosure.open) renderROI();
