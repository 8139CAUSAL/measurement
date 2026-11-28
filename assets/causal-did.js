import { $, blue, gold, mint, muted } from "./experiment-tools.js";

// Illustrative group averages ($ per month) before and after joining.
const members = [130, 170];
const comparison = [100, 115];
const withoutProgram = members[0] + comparison[1] - comparison[0];
const lift = members[1] - withoutProgram;
const ink = "#282A36";
const canvas = $("#did-gap-chart");

const line = ([before, after]) => [{ x: 0, y: before }, { x: 1, y: after }];
const dataset = (label, data, color, options = {}) => ({
  label, data, borderColor: color, backgroundColor: color, borderWidth: 2.5, pointRadius: 5, ...options,
});

// Writes the dollar values beside the points and draws the lift bracket after joining.
const annotate = {
  id: "didAnnotate",
  afterDatasetsDraw({ ctx, scales: { x, y } }) {
    const font = Chart.defaults.font;
    const at = (px, py, text, color, align = "center", weight = 600) => {
      ctx.font = `${weight} ${font.size}px ${font.family}`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.fillText(text, px, py);
    };
    const before = x.getPixelForValue(0);
    const after = x.getPixelForValue(1);
    ctx.save();
    at(before - 12, y.getPixelForValue(members[0]), `$${members[0]}`, mint, "right");
    at(before - 12, y.getPixelForValue(comparison[0]), `$${comparison[0]}`, muted, "right");
    at(after, y.getPixelForValue(members[1]) - 16, `$${members[1]}`, mint);
    at(after, y.getPixelForValue(withoutProgram) + 17, `$${withoutProgram}`, gold);
    at(after, y.getPixelForValue(comparison[1]) + 17, `$${comparison[1]}`, muted);

    const left = after + 14;
    const top = y.getPixelForValue(members[1]);
    const bottom = y.getPixelForValue(withoutProgram);
    ctx.strokeStyle = blue;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left - 5, top); ctx.lineTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(left - 5, bottom);
    ctx.stroke();
    at(left + 8, (top + bottom) / 2 - 9, "Lift", blue, "left", 700);
    at(left + 8, (top + bottom) / 2 + 9, `$${lift}`, blue, "left", 700);
    ctx.restore();
  },
};

const narrow = canvas.clientWidth < 420;
new Chart(canvas, {
  type: "line",
  data: {
    datasets: [
      dataset("Members", line(members), mint),
      dataset("Members without the program", line([members[0], withoutProgram]), gold, { borderDash: [7, 5], pointRadius: [0, 5] }),
      dataset("Comparison group", line(comparison), muted),
    ],
  },
  plugins: [annotate],
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    parsing: false,
    layout: { padding: { top: 6 } },
    scales: {
      x: {
        type: "linear", min: -.32, max: narrow ? 1.5 : 1.32, grid: { display: false },
        afterBuildTicks: scale => { scale.ticks = [{ value: 0 }, { value: 1 }]; },
        ticks: { color: ink, callback: value => (value ? "After joining" : "Before joining") },
      },
      y: {
        min: 80, max: 190,
        afterBuildTicks: scale => { scale.ticks = [80, 100, 120, 140, 160, 180].map(value => ({ value })); },
        ticks: { color: muted, callback: value => `$${value}` },
        title: { display: true, text: "Average monthly spend", color: muted },
      },
    },
    plugins: {
      tooltip: { enabled: false },
      legend: {
        labels: {
          color: ink, usePointStyle: true, pointStyleWidth: narrow ? 24 : 30, padding: narrow ? 8 : 14,
          generateLabels: chart => chart.data.datasets.map((set, index) => ({
            text: set.label, datasetIndex: index, pointStyle: "line", lineWidth: 2.5,
            strokeStyle: set.borderColor, fillStyle: set.borderColor, lineDash: set.borderDash || [], fontColor: ink,
          })),
        },
      },
    },
  },
});
