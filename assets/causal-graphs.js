import { $, blue, gold, initializeTabs, mint, muted, percent, points, table } from "./experiment-tools.js";

initializeTabs();

const graph = {
  confounder: {
    nodes: { T: [100, 173], X: [280, 55], Y: [460, 173] },
    arrows: [["X", "T"], ["X", "Y"], ["T", "Y"]],
    covariate: "Baseline context (X)",
    cells: [[100, 80, 8, 20, 4], [100, 20, 8, 80, 48]],
  },
  mediator: {
    nodes: { T: [100, 173], M: [280, 55], Y: [460, 173] },
    arrows: [["T", "M"], ["M", "Y"], ["T", "Y"]],
    covariate: "Post-treatment mediator (M)",
    cells: [[110, 80, 8, 30, 6], [90, 20, 12, 70, 49]],
  },
  collider: {
    nodes: { T: [100, 173], V: [100, 55], C: [280, 55], U: [460, 55], Y: [460, 173] },
    arrows: [["V", "T"], ["V", "C"], ["U", "C"], ["U", "Y"], ["T", "Y"]],
    covariate: "Baseline collider (C)",
    // Expected counts from equally prevalent independent U and V.
    cells: [[200, 124, 33.4, 76, 28], [200, 76, 36.6, 124, 72]],
  },
  hidden: {
    nodes: { T: [100, 173], U: [280, 55], Y: [460, 173] },
    arrows: [["U", "T"], ["U", "Y"], ["T", "Y"]],
  },
};
const names = {
  T: "Treatment", X: "Context", M: "Mediator", C: "Collider",
  V: "Hidden V", U: "Hidden U", Y: "Outcome",
};

function draw(canvas, nodes, arrows, { open = [], blocked = [], selected } = {}) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const [index, [from, to]] of arrows.entries()) {
    const [x1, y1] = nodes[from];
    const [x2, y2] = nodes[to];
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const edge = Math.min(58 / Math.abs(dx), 23 / Math.abs(dy));
    const endX = x2 - dx * (edge + 4);
    const endY = y2 - dy * (edge + 4);
    ctx.strokeStyle = blocked.includes(index) ? muted : open.includes(index) ? gold : mint;
    ctx.lineWidth = 3;
    ctx.setLineDash(blocked.includes(index) ? [7, 5] : []);
    ctx.beginPath();
    ctx.moveTo(x1 + dx * (edge + 4), y1 + dy * (edge + 4));
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(endX - 11 * Math.cos(angle - .52), endY - 11 * Math.sin(angle - .52));
    ctx.lineTo(endX, endY);
    ctx.lineTo(endX - 11 * Math.cos(angle + .52), endY - 11 * Math.sin(angle + .52));
    ctx.stroke();
  }
  ctx.font = "600 17px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [node, [x, y]] of Object.entries(nodes)) {
    ctx.fillStyle = "#101b31";
    ctx.strokeStyle = node === selected ? blue : "#59739b";
    ctx.lineWidth = node === selected ? 4 : 2;
    ctx.beginPath();
    ctx.roundRect(x - 58, y - 23, 116, 46, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f6f8ff";
    ctx.fillText(names[node], x, y);
  }
}

function describe(arrows) {
  return arrows.map(([from, to]) => `${names[from]} (${from}) → ${names[to]} (${to})`).join(". ") + ".";
}

const scenario = $("#graph-scenario");
const adjustment = $("#graph-adjustment");
const target = $("#graph-target");
const strength = $("#graph-strength");

function updateGraph() {
  const mode = scenario.value;
  const { nodes, arrows, covariate, cells } = graph[mode];
  const observed = mode !== "hidden";
  if (!observed) adjustment.value = "none";
  adjustment.disabled = !observed;
  adjustment.options[1].textContent = covariate ?? "No measured covariate";
  $("#graph-strength-field").hidden = observed;
  const adjusted = adjustment.value === "covariate";
  const color = { open: [], blocked: [] };
  let status;
  let identified = false;
  if (mode === "confounder") {
    color[adjusted ? "blocked" : "open"] = [0, 1];
    color.selected = adjusted ? "X" : undefined;
    identified = adjusted;
    status = adjusted
      ? "Conditioning on X blocks T ← X → Y. The directed path T → Y stays open."
      : "The back-door path T ← X → Y is open. The raw gap compares groups with different baseline compositions.";
  } else if (mode === "mediator") {
    color[adjusted ? "blocked" : "open"] = [0, 1];
    color.selected = adjusted ? "M" : undefined;
    identified = !adjusted;
    status = adjusted
      ? "Conditioning on M blocks part of the total effect along T → M → Y. The standardized conditional contrast has a different interpretation."
      : "Both directed paths carry the total effect. In this graph there are no open back-door paths.";
  } else if (mode === "collider") {
    color[adjusted ? "open" : "blocked"] = [0, 1, 2, 3];
    color.selected = adjusted ? "C" : undefined;
    identified = !adjusted;
    status = adjusted
      ? "Conditioning on baseline C opens T ← V → C ← U → Y. The adjusted association is biased in this simulation."
      : "The baseline collider C blocks T ← V → C ← U → Y. The empty set leaves that path blocked.";
  } else {
    color.open = [0, 1];
    status = "The unmeasured common cause leaves T ← U → Y open. The graph does not identify the total effect from the available comparison.";
  }
  const canvas = $("#graph-diagram");
  draw(canvas, nodes, arrows, color);
  $("#graph-arrows").textContent = describe(arrows) + " Solid amber highlights the path under discussion. A dashed path is blocked under the selected adjustment.";
  $("#graph-status").textContent = status;

  const total = (data, column) => data.reduce((sum, row) => sum + row[column], 0);
  if (observed) {
    const raw = total(cells, 4) / total(cells, 3) - total(cells, 2) / total(cells, 1);
    const column = target.value === "ate" ? 0 : 3;
    const shares = cells.map(row => row[column] / total(cells, column));
    const standardized = cells.reduce((sum, [, n0, y0, n1, y1], i) => sum + shares[i] * (y1 / n1 - y0 / n0), 0);
    const rows = cells.map(([, n0, y0, n1, y1], i) => [
      i ? "1" : "0", `${y0} / ${n0}`, `${y1} / ${n1}`, percent(shares[i]),
    ]);
    $("#graph-cells").innerHTML = table([covariate, "Control outcomes / units", "Treated outcomes / units", "Target share"],
      rows, mode === "collider" ? "Synthetic expected counts" : "Synthetic observed cells");
    const label = identified ? "Identified total effect" : "Selected descriptive comparison";
    $("#graph-contrasts").innerHTML = table(["Contrast", "Risk difference"], [
      ["Raw gap", points(raw)],
      [`Standardize over ${covariate} (shown for comparison)`, points(standardized)],
      [label, points(adjusted ? standardized : raw)],
    ]);
  } else {
    const contribution = strength.valueAsNumber / 100;
    $("#graph-strength-value").textContent = points(contribution);
    strength.setAttribute("aria-valuetext", `${strength.value} percentage points`);
    const base = .10;
    const effect = .15;
    const treatmentShare = [.20, .80];
    $("#graph-cells").innerHTML = table(["Hidden U (simulation only)", "Treatment probability", "Control risk", "Treatment risk"],
      treatmentShare.map((share, u) => [u, percent(share), percent(base + u * contribution), percent(base + u * contribution + effect)]),
      "Assumptions used to generate equal numbers with U = 0 and U = 1");
    $("#graph-contrasts").innerHTML = table(["Contrast", "Risk difference"], [
      ["Observed raw gap", points(effect + (treatmentShare[1] - treatmentShare[0]) * contribution)],
      ["True effect imposed by the simulation", points(effect)],
      ["Identified effect from observed data", "Unavailable · U is unmeasured"],
    ]);
  }
}

const contexts = [
  { label: "X = 0", arms: [[[90, 9], [30, 12]], [[20, 3], [60, 27]]] },
  { label: "X = 1", arms: [[[30, 6], [50, 25]], [[30, 9], [90, 54]]] },
];

export function frontDoor(support, direct) {
  const cells = contexts.map(({ label, arms }, index) => {
    const [control, treated] = arms.map(arm => arm.map(cell => [...cell]));
    if ((support === "empty" && index === 1) || support === "one-sided" || support === "unsupported-att") {
      control[0] = control[0].map((value, i) => value + control[1][i]);
      control[1] = [0, 0];
    }
    if (support === "unsupported-att" && index === 1) {
      treated[1] = treated[1].map((value, i) => value + treated[0][i]);
      treated[0] = [0, 0];
    }
    return { label, arms: [control, treated] };
  });
  const totals = cells.map(({ arms }) => arms.map(arm => arm[0][0] + arm[1][0]));
  const count = totals.flat().reduce((sum, n) => sum + n, 0);
  const treatedCount = totals.reduce((sum, ns) => sum + ns[1], 0);
  const empty = cells.flatMap(({ label, arms }) => arms.flatMap((arm, a) =>
    arm.flatMap(([n], m) => n ? [] : [`${label}, T = ${a}, M = ${m}`])));
  const means = !direct && !empty.length ? cells.map(({ arms }, i) => {
    const n = totals[i][0] + totals[i][1];
    const inner = [0, 1].map(m => arms.reduce((sum, arm, a) => sum + totals[i][a] / n * arm[m][1] / arm[m][0], 0));
    return {
      inner, n,
      means: arms.map((arm, a) => arm.reduce((sum, [size], m) => sum + size / totals[i][a] * inner[m], 0)),
    };
  }) : null;
  const att = !direct && ["one-sided", "unsupported-att"].includes(support) && cells.every(({ arms }) => arms[1][0][0])
    ? cells.reduce((sum, { arms }, i) => {
      const [[n0, y0], [, y1]] = arms[1];
      return sum + ((y0 + y1) / totals[i][1] - y0 / n0) * totals[i][1] / treatedCount;
    }, 0) : null;
  const population = means && [0, 1].map(a => means.reduce((sum, cell) => sum + cell.n / count * cell.means[a], 0));
  return { cells, empty, means, population, att };
}

const direct = $("#front-path");
const support = $("#front-support");

function updateFront() {
  const hasDirect = direct.value === "direct";
  const nodes = { T: [100, 173], U: [280, 49], M: [280, 173], Y: [460, 173] };
  const arrows = [["U", "T"], ["U", "Y"], ["T", "M"], ["M", "Y"]];
  // Use a separate lane for the direct arrow so it stays visible below the mediator.
  if (hasDirect) {
    nodes.T = [100, 190];
    nodes.Y = [460, 190];
    nodes.M = [280, 119];
    arrows.push(["T", "Y"]);
  }
  draw($("#front-diagram"), nodes, arrows, { open: hasDirect ? [4] : [0, 1] });
  $("#front-arrows").textContent = describe(arrows) + " All arrows are shown within a fixed baseline context X.";
  const { cells, empty, means, population, att } = frontDoor(support.value, hasDirect);
  $("#front-cells").innerHTML = table(["Context and treatment", "M = 0 outcomes / units", "M = 1 outcomes / units"],
    cells.flatMap(({ label, arms }) => arms.map((arm, a) => [
      `${label}, T = ${a}`, ...arm.map(([n, y]) => n ? `${y} / ${n}` : "Empty · 0 units"),
    ])), "Synthetic observed mediator cells");
  const alternate = support.value === "unsupported-att"
    ? " The treated M = 0 comparison is also missing in a target context, so the one-sided ATT is unavailable."
    : att !== null ? ` With known M(0) = 0, the supported one-sided ATT is ${points(att)}.` : "";
  $("#front-status").textContent = hasDirect
    ? "Unavailable. A direct T → Y path bypasses M, so the displayed front-door assumptions fail."
    : empty.length ? `Population front-door effect unavailable. Required cells are empty (${empty.join("; ")}).${alternate}`
      : `The identified population contrast is ${points(population[1] - population[0])} under the stated graph and support.`;
  $("#front-means").innerHTML = means ? table(
    ["Target", "Inner mean at M = 0", "Inner mean at M = 1", "Risk if all T = 0", "Risk if all T = 1"],
    [...means.map(({ inner, means: risks }, i) => [cells[i].label, ...inner.map(percent), ...risks.map(percent)]),
      ["All eligible", "—", "—", ...population.map(percent)]],
    "Interventional risks under the assumed graph") : "";
}

scenario.addEventListener("change", () => {
  adjustment.value = "none";
  updateGraph();
});
for (const input of [adjustment, target, strength]) input.addEventListener("input", updateGraph);
for (const input of [direct, support]) input.addEventListener("change", updateFront);
updateGraph();
updateFront();
