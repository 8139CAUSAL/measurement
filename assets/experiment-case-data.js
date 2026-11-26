import { allocate, groupBy, seededRandom, shuffle } from "./experiment-stats.js";

export const bands = ["Lower", "Higher"];
export const arms = ["Control", "Offer"];
const workedConversions = [[55, 82], [163, 191]];

export function simulateCase(plan, worked, seed) {
  const random = seededRandom(worked ? 1842 : seed);
  const enrollment = plan.enrollment[0];
  // Both arms put any extra account in the same prespecified band, so offer fractions match exactly.
  const lower = Math.ceil(enrollment / 2);
  const blockSizes = [lower, enrollment - lower];
  const rows = Array.from({ length: enrollment * 2 }, (_, i) => {
    const block = Number(i >= 2 * lower);
    return {
      id: `AC-${String(i + 1).padStart(5, "0")}`,
      block,
      spend: Math.round(15 + block * 65 + 60 * random()),
      tenure: 1 + Math.floor(24 * random()),
    };
  });
  const assigned = allocate(rows, "blocked", random, new Map(blockSizes.map((n, block) => [block, n])));
  const cells = groupBy(assigned, row => 2 * row.block + row.arm);
  const enriched = new Map();
  for (const [cell, members] of cells) {
    const block = Math.floor(cell / 2);
    const arm = cell % 2;
    const marginal = arm ? plan.target : plan.baseline;
    const separation = Math.min(.10, marginal, 1 - marginal);
    const rate = marginal + separation * (block - blockSizes[1] / enrollment);
    const fixedSuccesses = worked ? new Set(shuffle(members, random).slice(0, workedConversions[block][arm]).map(row => row.id)) : null;
    for (const row of members) {
      const converted = worked ? fixedSuccesses.has(row.id) : random() < rate;
      const uptake = arm === 1 && random() < .13 + .29 * block + row.tenure / 125;
      const missing = !worked && plan.loss > 0 && random() < plan.loss;
      enriched.set(row.id, { ...row, converted: missing ? null : Number(converted), uptake, reason: missing ? "Follow-up record unavailable" : "" });
    }
  }
  return assigned.map(({ id }) => enriched.get(id));
}

export function summarize(rows) {
  return arms.map((_, arm) => {
    const assigned = rows.filter(row => row.arm === arm);
    const observed = assigned.filter(row => row.converted !== null);
    return {
      n: assigned.length,
      uptake: assigned.filter(row => row.uptake).length,
      observed: observed.length,
      successes: observed.reduce((sum, row) => sum + row.converted, 0),
      missing: assigned.length - observed.length,
    };
  });
}
