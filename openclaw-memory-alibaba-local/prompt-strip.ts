/**
 * Strip OpenClaw channel / injection noise for logical memory extraction and recall query building.
 */

/** Matches OpenClaw `buildInboundMetadataBlocks` (control-ui / channels): ```json ... ``` after a labeled line. */
const OPENCLAW_UNTRUSTED_METADATA_BLOCK_RE = new RegExp(
  "(?:^|[\\r\\n])(?:Conversation info|Sender|Thread starter|Replied message|Forwarded message context|Chat history since last reply)\\s*\\([^)]*\\):\\s*" +
    "```" +
    "(?:json)?\\s*[\\s\\S]*?" +
    "```" +
    "\\s*",
  "gim",
);

const THREAD_HISTORY_RE = /^\[Thread history - for context\]/;
const THREAD_STARTER_RE = /^\[Thread starter - for context\]/;
const MEDIA_ATTACHED_LINE_RE = /^\[media attached/;
const MEDIA_REPLY_HINT_PREFIX = "To send an image back, prefer the message tool";

const MIN_RECALL_QUERY_LEN = 5;

function isSystemEventsOnlyParagraph(p: string): boolean {
  const lines = p.split("\n");
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  if (nonEmpty.length === 0) {
    return false;
  }
  return nonEmpty.every((l) => l.startsWith("System:"));
}

/**
 * Strip leading media lines + OpenClaw mediaReplyHint (single-line paragraph).
 * OpenClaw joins these with `\n` (not always `\n\n`).
 */
function stripLeadingMediaAndHint(text: string): { rest: string; tags: string[] } {
  const tags: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let sawMediaLine = false;
  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const t = raw.trim();
    if (!t) {
      i += 1;
      continue;
    }
    if (MEDIA_ATTACHED_LINE_RE.test(t)) {
      sawMediaLine = true;
      i += 1;
      continue;
    }
    if (t.startsWith(MEDIA_REPLY_HINT_PREFIX)) {
      tags.push("media_reply_hint");
      i += 1;
      continue;
    }
    break;
  }
  if (sawMediaLine) {
    tags.push("media_attached_lines");
  }
  const rest = lines.slice(i).join("\n").replace(/^\n+/, "").trimEnd();
  return { rest, tags };
}

/**
 * Strip prompt/channel noise before user_memory / self_improving extraction only.
 * Full-context rows intentionally keep the raw transcript (including XML + OpenClaw metadata).
 */
export function stripForLogicalMemoryExtraction(text: string): string {
  let out = text
    .replace(/<\s*relevant-memories\b[\s\S]*?<\s*\/\s*relevant-memories\s*>/gi, "\n")
    .replace(/<\s*knowledge-context\b[\s\S]*?<\s*\/\s*knowledge-context\s*>/gi, "\n");

  let prev: string;
  do {
    prev = out;
    out = out.replace(OPENCLAW_UNTRUSTED_METADATA_BLOCK_RE, "\n");
  } while (out !== prev);

  out = out.replace(/^\s*\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b[^[\]]*\]\s+/im, "");

  out = out.replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "").trim();
  return out;
}

export type ExtractUserQueryForRecallResult = {
  /** Text used for embedding + BM25 recall */
  query: string;
  /** True when query came from full-prompt strip fallback (prefix strip yielded too short) */
  usedFallback: boolean;
  /** High-level strip steps for logs */
  removedLabels: string[];
};

/**
 * Derive a recall query closer to "what the user said" than raw `event.prompt`.
 * OpenClaw `prefixedCommandBody` stacks media, thread notes, system events, then user body — see get-reply-run.ts.
 */
export function extractUserQueryForRecall(rawPrompt: string): ExtractUserQueryForRecallResult {
  const removedLabels: string[] = [];
  let s = rawPrompt.replace(/\r\n/g, "\n").trim();

  const mediaPass = stripLeadingMediaAndHint(s);
  s = mediaPass.rest.trim();
  for (const t of mediaPass.tags) {
    removedLabels.push(t);
  }

  const segments = s.split(/\n\n+/).map((x) => x.trim()).filter(Boolean);
  const kept: string[] = [];
  for (const seg of segments) {
    if (THREAD_HISTORY_RE.test(seg)) {
      removedLabels.push("thread_history_block");
      continue;
    }
    if (THREAD_STARTER_RE.test(seg)) {
      removedLabels.push("thread_starter_block");
      continue;
    }
    if (isSystemEventsOnlyParagraph(seg)) {
      removedLabels.push("system_events_block");
      continue;
    }
    kept.push(seg);
  }

  let joined = kept.join("\n\n").trim();
  joined = stripForLogicalMemoryExtraction(joined).trim();

  const strippedFull = stripForLogicalMemoryExtraction(rawPrompt.replace(/\r\n/g, "\n").trim()).trim();

  if (joined.length >= MIN_RECALL_QUERY_LEN) {
    return { query: joined, usedFallback: false, removedLabels };
  }
  if (strippedFull.length >= MIN_RECALL_QUERY_LEN) {
    return { query: strippedFull, usedFallback: true, removedLabels };
  }

  return { query: joined.length > 0 ? joined : strippedFull, usedFallback: true, removedLabels };
}
