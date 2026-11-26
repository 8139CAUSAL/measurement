// Shared calculations use proportions internally and treatment minus control throughout.
export const mean = values => values.length ? values.reduce((sum, x) => sum + x, 0) / values.length : NaN;

export function variance(values) {
  const center = mean(values);
  return values.length > 1 ? values.reduce((sum, x) => sum + (x - center) ** 2, 0) / (values.length - 1) : NaN;
}

export function quantile(sorted, probability) {
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  return sorted[lower] + (index - lower) * (sorted[Math.ceil(index)] - sorted[lower]);
}

// Acklam's inverse normal approximation.
export function normalQuantile(p) {
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (!(p > 0 && p < 1)) return NaN;
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857, 1];
  const c = [-.00778489400243029, -.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [.00778469570904146, .32246712907004, 2.445134137143, 3.75440866190742, 1];
  const polynomial = (coefficients, x) => coefficients.reduce((value, coefficient) => value * x + coefficient, 0);
  const tail = Math.min(p, 1 - p);
  if (tail < .02425) {
    const x = Math.sqrt(-2 * Math.log(tail));
    return (p < .5 ? 1 : -1) * polynomial(c, x) / polynomial(d, x);
  }
  const q = p - .5;
  return q * polynomial(a, q * q) / polynomial(b, q * q);
}

export function normalP(z) {
  if (z === 0) return 1;
  // Complementary error function, evaluated directly for stable upper tails.
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + .3275911 * x);
  return t * (.254829592 + t * (-.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
}

export function normalPower(standardizedEffect, alpha) {
  const critical = -normalQuantile(alpha / 2);
  const upper = z => z >= 0 ? normalP(z) / 2 : 1 - normalP(z) / 2;
  return upper(critical - standardizedEffect) + upper(critical + standardizedEffect);
}

export function minimumDetectable(alpha, power) {
  let low = 0;
  let high = -normalQuantile(alpha / 2) + Math.max(0, normalQuantile(power)) + 1;
  for (let step = 0; step < 45; step += 1) {
    const middle = (low + high) / 2;
    if (normalPower(middle, alpha) < power) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function binarySize({ baseline, mde, alpha, power, ratio, loss, daily, followup }) {
  const target = baseline + mde;
  if (!(baseline > 0 && baseline < 1 && target > 0 && target < 1 && mde !== 0)) {
    throw new RangeError("Use a nonzero MDE and keep both expected rates strictly between 0% and 100%.");
  }
  if (!(alpha > 0 && alpha < 1 && power > alpha && power < 1)) {
    throw new RangeError("Use alpha above 0% and power greater than alpha and below 100%.");
  }
  if (!(ratio > 0 && Number.isFinite(ratio) && loss >= 0 && loss < 1 && daily > 0 && Number.isSafeInteger(daily)
      && followup >= 0 && Number.isSafeInteger(followup))) {
    throw new RangeError("Use a positive allocation ratio, missingness below 100%, whole daily enrollment, and whole follow-up days.");
  }
  const h = 2 * (Math.asin(Math.sqrt(target)) - Math.asin(Math.sqrt(baseline)));
  const k = Math.max(ratio, 1 / ratio);
  const smaller = Math.ceil((1 + 1 / k) * ((normalQuantile(1 - alpha / 2) + normalQuantile(power)) / h) ** 2);
  const larger = Math.ceil(k * smaller);
  const outcomes = ratio >= 1 ? [smaller, larger] : [larger, smaller];
  const enrollment = outcomes.map(count => Math.ceil(count / (1 - loss)));
  const total = enrollment[0] + enrollment[1];
  if (!Number.isSafeInteger(total)) {
    throw new RangeError("The estimate exceeds the calculator’s count range. Try a larger MDE.");
  }
  return { target, h, outcomes, enrollment, total, recruitment: Math.ceil(total / daily), followup };
}

function checkBinomial(successes, n) {
  if (!Number.isSafeInteger(n) || n <= 0 || !Number.isSafeInteger(successes) || successes < 0 || successes > n) {
    throw new RangeError("Use positive whole assigned counts and whole conversion counts between zero and assigned.");
  }
}

export function binaryInterval(successes, n, alpha = .05) {
  checkBinomial(successes, n);
  const rate = successes / n;
  const z = normalQuantile(1 - alpha / 2);
  const center = rate + z * z / (2 * n);
  const radius = z * Math.sqrt(rate * (1 - rate) / n + z * z / (4 * n * n));
  const scale = 1 + z * z / n;
  return { rate, low: successes === 0 ? 0 : (center - radius) / scale, high: successes === n ? 1 : (center + radius) / scale };
}

export function binaryContrast(x0, n0, x1, n1, alpha = .05) {
  const control = binaryInterval(x0, n0, alpha);
  const offer = binaryInterval(x1, n1, alpha);
  const effect = offer.rate - control.rate;
  const pooled = (x0 + x1) / (n0 + n1);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n0 + 1 / n1));
  return {
    control, offer, effect,
    low: effect - Math.hypot(offer.rate - offer.low, control.high - control.rate),
    high: effect + Math.hypot(offer.high - offer.rate, control.rate - control.low),
    p: se > 0 ? normalP(effect / se) : null,
    sparse: Math.min(n0, n1) * Math.min(pooled, 1 - pooled) < 5,
    relative: control.rate ? effect / control.rate : null,
  };
}

export function blockContrast(blocks, alpha = .05) {
  const strata = blocks.map(({ n0, n1, x0, x1 }) => {
    checkBinomial(x0, n0);
    checkBinomial(x1, n1);
    const size = n0 + n1;
    const fraction = n1 / size;
    return { size, fraction, weight: n0 * fraction, rates: [x0 / n0, x1 / n1], counts: [n0, n1] };
  });
  const total = strata.reduce((sum, block) => sum + block.size, 0);
  const spread = strata.reduce((sum, block) => sum + block.weight, 0);
  const differences = strata.map(block => block.rates[1] - block.rates[0]);
  const fixedEffect = strata.reduce((sum, block, i) => sum + block.weight * differences[i], 0) / spread;
  const stratifiedEffect = strata.reduce((sum, block, i) => sum + block.size * differences[i], 0) / total;
  let hc2 = 0;
  let stratifiedVariance = 0;
  strata.forEach(({ size, fraction, rates, counts }, i) => {
    rates.forEach((rate, arm) => {
      const residualTreatment = arm - fraction;
      const leverage = 1 / size + residualTreatment ** 2 / spread;
      const cellResidual = residualTreatment * (differences[i] - fixedEffect);
      const rss = counts[arm] * (rate * (1 - rate) + cellResidual ** 2);
      hc2 += residualTreatment ** 2 * (leverage < 1 - 1e-12 ? rss / (1 - leverage) : NaN);
      stratifiedVariance += (size / total) ** 2 * rate * (1 - rate) / (counts[arm] - 1);
    });
  });
  const interval = (effect, se) => {
    const half = normalQuantile(1 - alpha / 2) * se;
    return { effect, se, low: effect - half, high: effect + half, p: se > 0 && Number.isFinite(se) ? normalP(effect / se) : null };
  };
  return {
    fixed: interval(fixedEffect, Math.sqrt(hc2) / spread),
    stratified: interval(stratifiedEffect, Math.sqrt(stratifiedVariance)),
    weights: strata.map(block => ({ enrolled: block.size / total, regression: block.weight / spread })),
  };
}

export function missingBounds(x0, n0, missing0, x1, n1, missing1) {
  return { low: x1 / n1 - (x0 + missing0) / n0, high: (x1 + missing1) / n1 - x0 / n0 };
}

export function smd(control, offer) {
  const scale = Math.sqrt((variance(control) + variance(offer)) / 2);
  return scale > 0 ? (mean(offer) - mean(control)) / scale : null;
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(values, random) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

export function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = key(row);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return groups;
}

export function allocate(rows, rule, random, quotas = new Map()) {
  if (rule === "sorted") return rows.map((row, index) => ({ ...row, arm: Number(index >= rows.length / 2) }));
  if (rule === "coin") return rows.map(row => ({ ...row, arm: Number(random() < .5) }));
  const groups = rule === "blocked" ? groupBy(rows, row => row.block) : new Map([["All", rows]]);
  const assigned = new Map();
  for (const [block, members] of groups) {
    const extra = members.length % 2 && !quotas.has(block) ? Number(random() < .5) : 0;
    const n1 = quotas.get(block) ?? (Math.floor(members.length / 2) + extra);
    if (!Number.isInteger(n1) || n1 < 0 || n1 > members.length) throw new RangeError("Invalid block quota.");
    const labels = shuffle(members.map((_, index) => Number(index < n1)), random);
    members.forEach((row, index) => assigned.set(row.id, labels[index]));
  }
  return rows.map(row => ({ ...row, arm: assigned.get(row.id) }));
}

export function binomial(n, p, random) {
  let successes = 0;
  for (let i = 0; i < n; i++) successes += Number(random() < p);
  return successes;
}

export function fairCoinSrm(n, offer) {
  if (n >= 10) return normalP((offer - n / 2) / Math.sqrt(n / 4));
  let probability = 2 ** -n;
  let tail = probability;
  for (let i = 1; i <= Math.min(offer, n - offer); i++) {
    probability *= (n - i + 1) / i;
    tail += probability;
  }
  return Math.min(1, 2 * tail);
}

export function ratioOfTotals(rows) {
  const denominator = mean(rows.map(row => row[1]));
  if (!(denominator > 0)) return null;
  const rate = mean(rows.map(row => row[0])) / denominator;
  const residuals = rows.map(([x, d]) => x - rate * d);
  return { rate, variance: variance(residuals) / (rows.length * denominator ** 2) };
}
