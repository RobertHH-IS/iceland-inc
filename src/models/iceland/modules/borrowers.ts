/**
 * Iceland Inc.: how a cap on a ratio trims lending when borrowers differ (the debt-service and
 * loan-to-value caps, mortgages.ts).
 *
 * Borrowers do not all want the same ratio of loan to income, or of loan to the price of the home
 * they buy. Each wants x times the average, with x log-normal around 1 (log-standard deviation
 * sigma). A cap at k times the average trims only those who want more than it allows, down to the
 * cap, so the share of the wanted loans that is lent is E[min(x, k)]: close to 1 when the cap is
 * far above the average, falling smoothly as it comes nearer, and k when every borrower is capped.
 * No money moves here; these are pure functions shared by the rules and the steady state.
 */

/** The complementary error function for x ≥ 0 (Numerical Recipes' erfcc, relative error below 1.2e-7). */
function erfcPositive(x: number): number {
  const t = 1 / (1 + 0.5 * x);
  const poly = -1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))));
  return t * Math.exp(-x * x + poly);
}
const ERFC0 = erfcPositive(0);

/** The standard normal distribution function Φ(z). Scaled so that Φ(0) is exactly ½: the two halves
 *  then meet with no jump and the same slope, and Φ(−z) = 1 − Φ(z) exactly. */
export function normalCdf(z: number): number {
  const half = erfcPositive(Math.abs(z) / Math.SQRT2) / ERFC0 / 2;
  return z >= 0 ? 1 - half : half;
}

/** Share of the loans borrowers want that a cap at k times the average ratio lets them have:
 *  E[min(x, k)] for x log-normal with mean 1 and log-standard deviation sigma. */
export function cappedShare(k: number, sigma: number): number {
  if (!(k > 0)) return 0;
  if (!(sigma > 0)) return Math.min(1, k);
  const [l, h] = [Math.log(k), (sigma * sigma) / 2];
  return normalCdf((l - h) / sigma) + k * (1 - normalCdf((l + h) / sigma));
}

/** Share of the loans borrowers want that comes from borrowers the cap trims (they want more than
 *  k times the average): the loan-weighted share with x above k. */
export function cappedVolume(k: number, sigma: number): number {
  if (!(k > 0)) return 1;
  if (!(sigma > 0)) return k < 1 ? 1 : 0;
  return 1 - normalCdf((Math.log(k) - (sigma * sigma) / 2) / sigma);
}
