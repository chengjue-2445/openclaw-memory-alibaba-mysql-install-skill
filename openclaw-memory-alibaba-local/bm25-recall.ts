/**
 * Okapi BM25 over an in-memory corpus (supplement to vector recall).
 * Tokenization: Unicode letters + numbers (works for Latin; CJK often single-char tokens).
 */

export function tokenizeForBm25(text: string): string[] {
  const m = text.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  return m ?? [];
}

export type Bm25DocInput = { id: string; text: string };

/** Returns docs sorted by BM25 score descending. */
export function scoreDocumentsBm25(query: string, docs: Bm25DocInput[]): Array<{ id: string; score: number }> {
  if (docs.length === 0) {
    return [];
  }
  const k1 = 1.2;
  const b = 0.75;

  type Prepared = { id: string; freqs: Map<string, number>; len: number };
  const prepared: Prepared[] = docs.map((d) => {
    const terms = tokenizeForBm25(d.text);
    const freqs = new Map<string, number>();
    for (const t of terms) {
      freqs.set(t, (freqs.get(t) ?? 0) + 1);
    }
    return { id: d.id, freqs, len: terms.length };
  });

  const N = prepared.length;
  const avgdl = prepared.reduce((s, p) => s + p.len, 0) / Math.max(1, N);

  const df = new Map<string, number>();
  for (const p of prepared) {
    for (const term of p.freqs.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const qTerms = tokenizeForBm25(query);
  if (qTerms.length === 0) {
    return prepared.map((p) => ({ id: p.id, score: 0 }));
  }

  const scores = new Map<string, number>();
  for (const p of prepared) {
    scores.set(p.id, 0);
  }

  for (const term of qTerms) {
    const dfi = df.get(term) ?? 0;
    if (dfi === 0) {
      continue;
    }
    const idf = Math.log((N - dfi + 0.5) / (dfi + 0.5) + 1);
    for (const p of prepared) {
      const f = p.freqs.get(term) ?? 0;
      if (f === 0) {
        continue;
      }
      const denom = f + k1 * (1 - b + (b * p.len) / avgdl);
      const add = (idf * (f * (k1 + 1))) / denom;
      scores.set(p.id, (scores.get(p.id) ?? 0) + add);
    }
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
