import { series } from "./experiment-tools.js";

export const points = (xs, ys) => xs.map((x, i) => ({ x, y: ys[i] }));

export function ribbon(label, xs, ranges, color, fill, line = {}) {
  return [
    series("", points(xs, ranges.map(r => r.low)), color, { borderWidth: 0 }),
    series("", points(xs, ranges.map(r => r.high)), color, { borderWidth: 0, fill: "-1", backgroundColor: fill }),
    series(label, points(xs, ranges.map(r => r.mean)), color, line),
  ];
}
