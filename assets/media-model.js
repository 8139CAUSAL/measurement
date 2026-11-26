import example from "./media-example.js";

export const { meta, history, fits, study, second, truth } = example;
export const searchColor = "#2dd4bf";
export const socialColor = "#a78bfa";
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const money = value => usd.format(value);
export const signedMoney = value => (value > 0 ? "+" : "") + money(value);
export const sum = values => values.reduce((total, value) => total + value, 0);
export const mean = values => sum(values) / values.length;
export const dot = (left, right) => left.reduce((total, value, i) => total + value * right[i], 0);
export const response = exposure => Math.tanh(exposure / meta.scale);
export const responseSlope = exposure => (1 - response(exposure) ** 2) / meta.scale;

export function exposureSeries(spend, initial) {
  let previous = initial;
  return spend.map(value => {
    previous = meta.alpha * previous + (1 - meta.alpha) * value;
    return previous;
  });
}

export const carryoverHistory = history.map(rows => [0, 1].map(channel =>
  exposureSeries(rows.map(row => row[channel]), meta.initial[channel])));

export function support(channel) {
  const raw = history.flatMap(rows => rows.slice(0, meta.trainWeeks).map(row => row[channel]));
  const effective = carryoverHistory.flatMap(channels => channels[channel].slice(0, meta.trainWeeks));
  return {
    raw: [Math.min(...raw), Math.max(...raw)],
    effective: [Math.min(...effective), Math.max(...effective)],
  };
}

export function summarize(values) {
  const ordered = [...values].sort((a, b) => a - b);
  function quantile(p) {
    const position = (ordered.length - 1) * p;
    const low = Math.floor(position);
    const high = Math.ceil(position);
    return ordered[low] + (position - low) * (ordered[high] - ordered[low]);
  }
  return { mean: mean(values), low: quantile(.025), high: quantile(.975) };
}

export function normalNoise(index) {
  // Seed a stable Box–Muller pair for each draw, week and observation key.
  function uniform(key) {
    key = Math.imul(key ^ (key >>> 16), 0x45d9f3b);
    key = Math.imul(key ^ (key >>> 16), 0x45d9f3b);
    return (((key ^ (key >>> 16)) >>> 0) + .5) / 4294967296;
  }
  return Math.sqrt(-2 * Math.log(uniform(2 * index + 1))) * Math.cos(2 * Math.PI * uniform(2 * index + 2));
}

export function modelOutcome(draw, geo, demand, search, social) {
  return draw[0] + draw[1] * demand + draw[4 + geo] * response(search) + draw[2] * response(social);
}

export function studyFeature(test) {
  const reference = Array(test.horizon).fill(test.reference);
  const plan = reference.map((value, week) => week < test.active ? test.plan : value);
  return fits.balanced.mean.map((_, i) => {
    const geo = i - 4;
    if (!test.geos.includes(geo)) return 0;
    const initial = test.initialSearch[geo];
    const base = exposureSeries(reference, initial);
    const changed = exposureSeries(plan, initial);
    return sum(changed.map((value, week) => response(value) - response(base[week]))) / test.geos.length;
  });
}

export function gaussianSummary(fit, feature, observationSE = 0) {
  const center = dot(feature, fit.mean);
  const variance = Math.max(0, dot(feature, fit.cov.map(row => dot(row, feature))));
  const margin = 1.95996398454 * Math.hypot(Math.sqrt(variance), observationSE);
  return { mean: center, low: center - margin, high: center + margin };
}

export function updateLift(fit, feature, lift, se, key) {
  if (!Number.isFinite(se) || se <= 0) throw new RangeError("Study SE must be finite and positive.");
  const covariance = fit.cov.map(row => dot(row, feature));
  const predictiveVariance = dot(covariance, feature) + se ** 2;
  const gain = covariance.map(value => value / predictiveVariance);
  const update = (prior, residual) => prior.map((value, i) => value + gain[i] * residual);
  return {
    mean: update(fit.mean, lift - dot(fit.mean, feature)),
    cov: fit.cov.map((row, i) => row.map((value, j) => value - gain[i] * covariance[j])),
    // Conditional simulation uses one independent hypothetical study error
    // per joint history draw, then conditions on the observed signed lift.
    draws: fit.draws.map((draw, i) =>
      update(draw, lift - dot(draw, feature) - se * normalNoise(700000 + key * 5000 + i))),
  };
}
