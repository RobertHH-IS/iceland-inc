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

/** Eigenvalues of a symmetric n×n matrix (row-major), by cyclic Jacobi rotations, in ascending
 *  order. For the small matrices of the opening solve's conditioning check. A is not modified. */
export function symmetricEigenvalues(A: Float64Array, n: number): number[] {
  const a = new Float64Array(A);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0,
      diag = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i === j) diag += a[i * n + i] * a[i * n + i];
        else off += a[i * n + j] * a[i * n + j];
      }
    if (!(off > 1e-30 * diag) || !Number.isFinite(off)) break;
    for (let p = 0; p < n - 1; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (apq === 0) continue;
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1),
          s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p],
            akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k],
            aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
      }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(a[i * n + i]);
  return out.sort((x, y) => x - y);
}

/**
 * Anderson acceleration of a fixed-point iteration x = G(x) (Walker & Ni 2011): each step mixes
 * the last few iterates so that a slow linear mode, which plain iteration closes a few percent a
 * step, is closed in a handful of steps. `weights` scale the residuals (1 ÷ a typical size).
 */
export class Anderson {
  private X: Float64Array[] = [];
  private G: Float64Array[] = [];
  constructor(
    readonly n: number,
    readonly depth = 5,
    readonly weights?: Float64Array,
  ) {}

  reset(): void {
    this.X = [];
    this.G = [];
  }

  /** The next iterate, given the current one and its image G(x). */
  next(x: ArrayLike<number>, g: ArrayLike<number>): Float64Array {
    const { n, weights: w } = this;
    this.X.push(Float64Array.from(x));
    this.G.push(Float64Array.from(g));
    if (this.X.length > this.depth + 1) {
      this.X.shift();
      this.G.shift();
    }
    const k = this.X.length;
    const plain = Float64Array.from(g);
    if (k < 2) return plain;
    const mm = k - 1;
    const F = (j: number, i: number) => this.G[j][i] - this.X[j][i];
    // least squares: min ‖W (F_last − ΔF γ)‖, by the normal equations with a little ridge
    const A = new Float64Array(mm * mm);
    const b = new Float64Array(mm);
    for (let i = 0; i < n; i++) {
      const wi = w ? w[i] * w[i] : 1;
      const fl = F(k - 1, i);
      for (let a = 0; a < mm; a++) {
        const da = F(a + 1, i) - F(a, i);
        b[a] += wi * da * fl;
        for (let c = a; c < mm; c++) A[a * mm + c] += wi * da * (F(c + 1, i) - F(c, i));
      }
    }
    let trace = 0;
    for (let a = 0; a < mm; a++) {
      for (let c = 0; c < a; c++) A[a * mm + c] = A[c * mm + a];
      trace += A[a * mm + a];
    }
    for (let a = 0; a < mm; a++) A[a * mm + a] += 1e-12 * (trace / mm) + 1e-300;
    const gamma = solveLinear(A, b, mm);
    if (!gamma) {
      this.reset();
      return plain;
    }
    const out = Float64Array.from(this.G[k - 1]);
    for (let a = 0; a < mm; a++) for (let i = 0; i < n; i++) out[i] -= gamma[a] * (this.G[a + 1][i] - this.G[a][i]);
    for (let i = 0; i < n; i++)
      if (!Number.isFinite(out[i])) {
        this.reset();
        return plain;
      }
    return out;
  }
}
