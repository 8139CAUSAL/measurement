import { $, axis, blue, chart, decimal, gold, mint, series, signed, table } from "./experiment-tools.js";

const offsets = [-14, -10, -6, -2, 2, 6, 10, 14];
const residuals = [1, -1, -1, 1, 1, -1, -1, 1];
const latent = [-10, -7, -4, -1, 1, 4, 7, 10];
const noise = [9, -10, 0, 1, 4, -3, 7, -8];
const labels = ["Comparison", "Treated"];

export function baselineExample(design) {
  const groups = labels.map((_, arm) => offsets.map((offset, i) => {
    if (design === "pretest") {
      const x = 40 + arm * 10 + offset;
      return { x, y: 45 + arm * 10 + .6 * offset + residuals[i] * 2 };
    }
    const underlying = 40 + arm * 14 + latent[i];
    return { x: underlying + noise[i] * (arm ? -1 : 1), y: underlying + 5 + arm * 4 + residuals[i] };
  }));
  const means = groups.map(rows => ({
    x: rows.reduce((sum, row) => sum + row.x, 0) / rows.length,
    y: rows.reduce((sum, row) => sum + row.y, 0) / rows.length,
  }));
  let xx = 0;
  let xy = 0;
  groups.forEach((rows, i) => rows.forEach(({ x, y }) => {
    xx += (x - means[i].x) ** 2;
    xy += (x - means[i].x) * (y - means[i].y);
  }));
  const slope = xy / xx;
  const baseline = means[1].x - means[0].x;
  const post = means[1].y - means[0].y;
  return { groups, means, slope, baseline, post, changes: post - baseline, ancova: post - slope * baseline };
}

const design = $("#baseline-design");
function update() {
  const { groups, means, slope, baseline, post, changes, ancova } = baselineExample(design.value);
  const min = groups.map(rows => Math.min(...rows.map(row => row.x)));
  const max = groups.map(rows => Math.max(...rows.map(row => row.x)));
  const overlap = [Math.max(...min), Math.min(...max)];
  const hasOverlap = overlap[0] <= overlap[1];
  const y = groups.flat().map(row => row.y);
  const datasets = groups.flatMap((rows, i) => {
    const color = [blue, mint][i];
    return [
      series(labels[i], rows, color, { pointRadius: 4, showLine: false, pointStyle: i ? "triangle" : "circle" }),
      series(`${labels[i]} fit`, [min[i], max[i]].map(x => ({ x, y: means[i].y + slope * (x - means[i].x) })), color,
        { showLine: true }),
      series(`${labels[i]} mean`, [means[i]], color, { pointRadius: 8, pointStyle: "crossRot" }),
    ];
  });
  if (hasOverlap) {
    datasets.unshift(...overlap.map((x, i) => series(`Overlap ${i ? "end" : "start"}`,
      [{ x, y: Math.min(...y) }, { x, y: Math.max(...y) }], gold, { showLine: true, borderDash: [4, 4] })));
  }
  chart($("#baseline-chart"), {
    type: "scatter", datasets, x: { title: axis("Baseline (units)") }, y: { title: axis("Follow-up (units)") },
  });
  $("#baseline-status").textContent = (design.value === "pretest"
    ? "Enrollment follows measured pretest values. In this construction, untreated expected follow-up rises by 0.60 per baseline unit and the treatment adds 4 units."
    : "The groups’ underlying levels differ by 14 units. Both untreated group averages would rise by 5. A noisy pretest attenuates the fitted slope. Treated follow-up adds 4 units.") +
    (hasOverlap ? ` Baseline overlap runs from ${overlap[0]} to ${overlap[1]} (dashed markers).` : " Observed baseline ranges do not overlap.");
  $("#baseline-means").innerHTML = table(["Group", "Baseline range", "Mean pre", "Mean post"],
    means.map((row, i) => [labels[i], `${min[i]}–${max[i]}`, decimal(row.x, 1), decimal(row.y, 1)]),
    "Comparison (circles) and treated (triangles). Large crosses mark the means.");
  $("#baseline-effects").innerHTML = table(["Comparison", "Slope used", "Treated − comparison"], [
    ["Baseline gap", "—", signed(baseline) + " units"],
    ["Raw posttest gap", "—", signed(post) + " units"],
    ["Difference in changes (DiD)", "1.00", signed(changes) + " units"],
    ["Common-slope ANCOVA", decimal(slope), signed(ancova) + " units"],
  ]);
  $("#baseline-pairs").innerHTML = table(["Unit", "Baseline", "Follow-up"], groups.flatMap((rows, arm) =>
    rows.map((row, i) => [`${labels[arm]} ${i + 1}`, decimal(row.x, 1), decimal(row.y, 1)])));
}
design.addEventListener("change", update);
update();
