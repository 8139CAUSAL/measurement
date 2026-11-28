import { normalQuantile } from './experiment-stats.js';

function lgamma(x) {
  var c = [0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  var a = c[0], t = x + 7.5;
  for (var i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betaCF(x, a, b) {
  var qab = a + b, qap = a + 1, qam = a - 1;
  var cc = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-10) d = 1e-10;
  d = 1 / d; var h = d;
  for (var m = 1; m <= 200; m++) {
    var m2 = 2 * m;
    var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-10) d = 1e-10;
    cc = 1 + aa / cc; if (Math.abs(cc) < 1e-10) cc = 1e-10;
    d = 1 / d; h *= d * cc;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-10) d = 1e-10;
    cc = 1 + aa / cc; if (Math.abs(cc) < 1e-10) cc = 1e-10;
    d = 1 / d; var del = d * cc; h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }
  return h;
}

function incompleteBeta(x, a, b) {
  if (x === 0) return 0; if (x === 1) return 1;
  var bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  if (x < (a + 1) / (a + b + 2)) return bt * betaCF(x, a, b) / a;
  return 1 - bt * betaCF(1 - x, b, a) / b;
}

// Evaluate the smaller t tail directly, including at extreme statistics.
export function tTail(t, df) {
  const ratio = t * t / df;
  // Use the beta complement near 1 to preserve precision at large df.
  if (ratio < 1 / df) return .5 * (1 - incompleteBeta(ratio / (1 + ratio), .5, df / 2));
  return .5 * incompleteBeta(1 / (1 + ratio), df / 2, .5);
}

export function tPDF(t, df) {
  var num = lgamma((df + 1) / 2) - lgamma(df / 2);
  var denom = 0.5 * Math.log(df * Math.PI);
  return Math.exp(num - denom - ((df + 1) / 2) * Math.log1p(t * t / df));
}

export function tInv(p, df) {
  if (df === Infinity) return normalQuantile(p);
  if (p === .5) return 0;
  if (p === 0 || p === 1) return p === 0 ? -Infinity : Infinity;
  if (!(p > 0 && p < 1 && df > 0)) return NaN;
  const tail = Math.min(p, 1 - p);
  let low = 0;
  let high = Math.max(1, Math.abs(normalQuantile(p)));
  while (tTail(high, df) > tail) high *= 2;
  for (let step = 0; step < 45; step++) {
    const middle = (low + high) / 2;
    if (tTail(middle, df) > tail) low = middle;
    else high = middle;
  }
  return (low + high) / 2 * Math.sign(p - .5);
}

export function fTail(value, d1, d2) {
  return incompleteBeta(d2 / (d2 + d1 * value), d2 / 2, d1 / 2);
}

export function fCritical(alpha, d1, d2) {
  if (!(alpha > 0 && alpha < 1 && d1 > 0 && d2 > 0)) return NaN;
  let low = 0;
  let high = 1;
  while (fTail(high, d1, d2) > alpha) high *= 2;
  for (let step = 0; step < 54; step++) {
    const middle = (low + high) / 2;
    if (fTail(middle, d1, d2) > alpha) low = middle;
    else high = middle;
  }
  const result = (low + high) / 2;
  return Math.abs(fTail(result, d1, d2) - alpha) <= 1e-8 * alpha ? result : NaN;
}

export function formatTail(p) {
  return p === 0 ? '< 5e−324' : p < .0001 ? p.toExponential(3) : p.toFixed(4);
}

// Standard-normal survival function via Q(1/2, z²/2).
function normalUpper(z) {
  if (z < 0) return 1 - normalUpper(-z);
  if (z > 38) return 0;
  const x = z * z / 2;
  if (x === 0) return .5;
  const scale = Math.exp(.5 * Math.log(x) - x) / Math.sqrt(Math.PI);
  if (x < 1.5) {
    let term = 2;
    let sum = term;
    for (let i = 1; i < 60; i++) {
      term *= x / (i + .5);
      sum += term;
      if (term < 1e-16 * sum) break;
    }
    return .5 * (1 - scale * sum);
  }
  let b = x + .5;
  let c = 1e100;
  let d = 1 / b;
  let fraction = d;
  for (let i = 1; i <= 120; i++) {
    const numerator = -i * (i - .5);
    b += 2;
    d = 1 / (b + numerator * d);
    c = b + numerator / c;
    const ratio = c * d;
    fraction *= ratio;
    if (Math.abs(ratio - 1) < 1e-15) break;
  }
  return .5 * scale * fraction;
}

// Integrate conditional on S = sqrt(V), V ~ chi-square(df).
// The chi density is concentrated within 12 units of its mode. Composite
// 8-point Gauss–Legendre quadrature integrates the smooth conditional tails.
export function noncentralT(df, ncp) {
  const nodes = [-.9602898564975363, -.7966664774136267, -.5255324099163290, -.1834346424956498,
    .1834346424956498, .5255324099163290, .7966664774136267, .9602898564975363];
  const weights = [.1012285362903763, .2223810344533745, .3137066458778873, .3626837833783620,
    .3626837833783620, .3137066458778873, .2223810344533745, .1012285362903763];
  const mode = Math.sqrt(df - 1);
  const left = Math.max(-mode, -12);
  const segments = Math.ceil((12 - left) * 2);
  const halfWidth = (12 - left) / (2 * segments);
  const quadrature = [];
  let mass = 0;
  for (let segment = 0; segment < segments; segment++) {
    const center = left + (2 * segment + 1) * halfWidth;
    nodes.forEach((node, index) => {
      const offset = center + node * halfWidth;
      const logDensity = (df - 1) * Math.log1p(offset / mode) - offset * (mode + offset / 2);
      const weight = weights[index] * Math.exp(logDensity);
      mass += weight;
      quadrature.push([(mode + offset) / Math.sqrt(df), weight]);
    });
  }
  return {
    power(critical, twoSided) {
      let sum = 0;
      for (const [scale, weight] of quadrature) {
        const cut = critical * scale;
        sum += weight * (normalUpper(cut - ncp) + (twoSided ? normalUpper(cut + ncp) : 0));
      }
      return Math.min(1, sum / mass);
    },
    density(t) {
      let sum = 0;
      for (const [scale, weight] of quadrature) {
        sum += weight * scale * Math.exp(-.5 * (t * scale - ncp) ** 2);
      }
      return sum / (mass * Math.sqrt(2 * Math.PI));
    },
  };
}

export function meansPower(alpha, d, n, twoSided) {
  const df = 2 * (n - 1);
  const critical = tInv(1 - alpha / (twoSided ? 2 : 1), df);
  return noncentralT(df, d * Math.sqrt(n / 2)).power(critical, twoSided);
}

export function meansSize(alpha, target, d, twoSided) {
  if (!(alpha > 0 && alpha < .5 && target > alpha && target < 1 && d > 0 && Number.isFinite(d))) return NaN;
  let low = 1;
  let high = Math.max(2, Math.ceil(2 * ((normalQuantile(1 - alpha / (twoSided ? 2 : 1))
    + normalQuantile(target)) / d) ** 2));
  if (!Number.isSafeInteger(high)) return NaN;
  while (meansPower(alpha, d, high, twoSided) < target) {
    low = high;
    high *= 2;
    if (!Number.isSafeInteger(high)) return NaN;
  }
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (meansPower(alpha, d, middle, twoSided) >= target) high = middle;
    else low = middle;
  }
  return high;
}
