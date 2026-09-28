/**
 * Small dense linear algebra for the solvers (no dependencies).
 */

/** Solve A x = b (A is n×n, row-major) by Gaussian elimination with partial pivoting.
 *  Returns null when A is singular to working precision. A and b are not modified. */
export function solveLinear(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  const M = new Float64Array(A);
  const x = new Float64Array(b);
  let scale = 0;
  for (let i = 0; i < n * n; i++) scale = Math.max(scale, Math.abs(M[i]));
  if (!(scale > 0) || !Number.isFinite(scale)) return null;
  const eps = scale * 1e-14;
  for (let k = 0; k < n; k++) {
    let p = k;
    let best = Math.abs(M[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const a = Math.abs(M[i * n + k]);
      if (a > best) {
        best = a;
        p = i;
      }
    }
    if (!(best > eps)) return null;
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const t = M[k * n + j];
        M[k * n + j] = M[p * n + j];
        M[p * n + j] = t;
      }
      const t = x[k];
      x[k] = x[p];
      x[p] = t;
    }
    const piv = M[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = M[i * n + k] / piv;
      if (f === 0) continue;
      for (let j = k; j < n; j++) M[i * n + j] -= f * M[k * n + j];
      x[i] -= f * x[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < n; j++) s -= M[i * n + j] * x[j];
    x[i] = s / M[i * n + i];
  }
  for (let i = 0; i < n; i++) if (!Number.isFinite(x[i])) return null;
  return x;
}

/** Levenberg–Marquardt step: solve (JᵀJ + μ·diag(JᵀJ) + μ·ε I) δ = −Jᵀ f for an m×n J.
 *  In directions the equations do not pin down, the step stays small: the solver keeps the
 *  initial guess there instead of wandering. */
export function lmStep(J: Float64Array, f: Float64Array, m: number, n: number, mu: number): Float64Array | null {
  const A = new Float64Array(n * n);
  const g = new Float64Array(n);
  for (let r = 0; r < m; r++) {
    const fr = f[r];
    for (let i = 0; i < n; i++) {
      const ji = J[r * n + i];
      if (ji === 0) continue;
      g[i] -= ji * fr;
      for (let k = i; k < n; k++) A[i * n + k] += ji * J[r * n + k];
    }
  }
  let dmax = 0;
  for (let i = 0; i < n; i++) dmax = Math.max(dmax, A[i * n + i]);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < i; k++) A[i * n + k] = A[k * n + i];
    A[i * n + i] += mu * (A[i * n + i] + 1e-12 * dmax + 1e-300);
  }
  return solveLinear(A, g, n);
}

export const maxAbs = (a: ArrayLike<number>): number => {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Math.abs(a[i]);
    if (Number.isNaN(x)) return Infinity;
    if (x > m) m = x;
  }
  return m;
};

export const sumSq = (a: ArrayLike<number>): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Number.isNaN(s) ? Infinity : s;
};
