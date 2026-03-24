/**
 * Paragraph-based chunks with approximate token budget (chars/4), then sub-split long paragraphs.
 */

export function approxTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitLongParagraph(p: string, maxToken: number): string[] {
  const maxTok = Math.max(16, maxToken);
  if (approxTokenCount(p) <= maxTok) {
    return [p];
  }
  const charBudget = Math.max(64, Math.floor(maxTok * 4));
  const chunks: string[] = [];
  let i = 0;
  while (i < p.length) {
    let end = Math.min(p.length, i + charBudget);
    if (end < p.length) {
      const windowStart = Math.max(i, end - Math.floor(charBudget * 0.25));
      const slice = p.slice(windowStart, end);
      const nl = slice.lastIndexOf("\n");
      const dotEn = slice.lastIndexOf(". ");
      const dotZh = slice.lastIndexOf("。");
      const cut = Math.max(nl, dotEn >= 0 ? dotEn + 1 : -1, dotZh >= 0 ? dotZh + 1 : -1);
      if (cut >= 0) {
        end = windowStart + cut;
      }
    }
    const piece = p.slice(i, end).trim();
    if (piece.length > 0) {
      chunks.push(piece);
    }
    if (end <= i) {
      end = Math.min(p.length, i + charBudget);
    }
    i = end;
  }
  return chunks.length > 0 ? chunks : [p.slice(0, charBudget).trim()].filter(Boolean);
}

/** Split on blank-line paragraphs; each piece capped at ~maxToken approximate tokens. */
export function splitTextIntoEmbeddingChunks(text: string, maxToken: number): string[] {
  const maxTok = Math.max(16, Math.floor(maxToken));
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }
  // 整段仍在单次 embedding 预算内时保持一条 chunk。否则带 ``` / OpenClaw metadata 的用户消息里
  // 常有多个空行分段，会被拆成多条向量行，LanceDB 里看起来像「同一句话存了三次」。
  if (approxTokenCount(normalized) <= maxTok) {
    return [normalized];
  }
  const paras = normalized.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (paras.length === 0) {
    return splitLongParagraph(normalized, maxTok);
  }
  const out: string[] = [];
  for (const p of paras) {
    out.push(...splitLongParagraph(p, maxTok));
  }
  return out;
}
