// Counts describe an absorbing churn cohort observed at monthly boundaries.
export function cohortSurvival(raw) {
  const tokens = raw.includes(',') ? raw.split(',').map(token => token.trim()) : raw.trim().split(/\s+/);
  if (tokens.length < 2) throw new RangeError('Enter at least two monthly counts.');
  const counts = tokens.map((token, month) => {
    const count = Number(token);
    if (!/^\d+$/.test(token) || !Number.isSafeInteger(count)) {
      throw new RangeError('Month ' + month + ' needs a nonnegative whole count.');
    }
    return count;
  });
  const base = counts[0];
  if (base === 0) throw new RangeError('Month 0 count must be greater than 0.');
  const monthly = counts.slice(1).map((count, index) => {
    const atRisk = counts[index];
    if (count > atRisk) throw new RangeError('Month ' + (index + 1) + ' cannot exceed the previous month.');
    return atRisk ? 100 * count / atRisk : null;
  });
  const atRiskMonths = monthly.filter(value => value !== null);
  const avgRetention = atRiskMonths.reduce((sum, value) => sum + value, 0) / atRiskMonths.length;
  const retention = counts.map(count => 100 * count / base);
  // With exits recorded at month boundaries, sum S(0) through S(H−1).
  const restrictedMean = retention.slice(0, -1).reduce((sum, value) => sum + value / 100, 0);
  return { counts, base, monthly, avgRetention, retention, restrictedMean };
}
