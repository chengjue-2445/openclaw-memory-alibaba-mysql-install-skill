/**
 * Persisted cursors for agent_end capture: per-message-role counts (not flat transcript index).
 * File: memory-alibaba-local-agent-end-cursors.json next to LanceDB dir.
 * Migrates legacy memory-alibaba-local-full-context-cursor.json (lastEndExclusive) on first use.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

const CURSOR_FILENAME_V2 = "memory-alibaba-local-agent-end-cursors.json";
const LEGACY_CURSOR_FILENAME = "memory-alibaba-local-full-context-cursor.json";

/** v2: how many messages per role have been fully processed (including empty-body turns). */
export type AgentEndCursorEntryV2 = {
  version: 2;
  roleCounts: Record<string, number>;
  lastMessagesLength: number;
};

export type LegacyCursorEntry = {
  lastEndExclusive: number;
};

export type CursorFileEntry = AgentEndCursorEntryV2 | LegacyCursorEntry;

function cursorPathV2(lancedbDir: string): string {
  return join(lancedbDir, CURSOR_FILENAME_V2);
}

function legacyCursorPath(lancedbDir: string): string {
  return join(lancedbDir, LEGACY_CURSOR_FILENAME);
}

/**
 * Infer agentId when ctx.agentId is missing. OpenClaw canonical keys are `agent:<agentId>:<rest>` (≥3 segments).
 * Plugin fallback `session:<sessionId>` must not use the literal prefix `session` as agentId (would hide rows in UI when Agent defaults to `main`).
 */
export function parseAgentIdFromSessionKey(sessionKey: string): string {
  const parts = sessionKey.split(":").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "agent") {
    return parts[1] || "main";
  }
  const head = (parts[0] ?? "").toLowerCase();
  if (head === "session") {
    return "main";
  }
  return parts[0] || "main";
}

export function getFullContextCursorKey(agentId: string, sessionKey: string): string {
  return `${agentId}\n${sessionKey}`;
}

function isV2Entry(v: unknown): v is AgentEndCursorEntryV2 {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    (v as AgentEndCursorEntryV2).version === 2 &&
    typeof (v as AgentEndCursorEntryV2).roleCounts === "object" &&
    (v as AgentEndCursorEntryV2).roleCounts !== null &&
    !Array.isArray((v as AgentEndCursorEntryV2).roleCounts)
  );
}

function isLegacyEntry(v: unknown): v is LegacyCursorEntry {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    typeof (v as LegacyCursorEntry).lastEndExclusive === "number" &&
    Number.isFinite((v as LegacyCursorEntry).lastEndExclusive)
  );
}

/** Load all cursor entries (v2 and/or legacy shapes). Migrates legacy file into v2 path once if needed. */
export function loadAgentEndCursorMap(lancedbDir: string): Record<string, CursorFileEntry> {
  const v2Path = cursorPathV2(lancedbDir);
  const legPath = legacyCursorPath(lancedbDir);

  if (!existsSync(v2Path) && existsSync(legPath)) {
    try {
      renameSync(legPath, v2Path);
    } catch {
      // if rename fails, read legacy below
    }
  }

  const readPath = existsSync(v2Path) ? v2Path : existsSync(legPath) ? legPath : v2Path;
  try {
    const raw = readFileSync(readPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, CursorFileEntry> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (isV2Entry(v)) {
        out[k] = {
          version: 2,
          roleCounts: { ...v.roleCounts },
          lastMessagesLength:
            typeof v.lastMessagesLength === "number" && Number.isFinite(v.lastMessagesLength)
              ? Math.floor(v.lastMessagesLength)
              : 0,
        };
      } else if (isLegacyEntry(v)) {
        out[k] = { lastEndExclusive: Math.max(0, Math.floor(v.lastEndExclusive)) };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveAgentEndCursorMap(
  lancedbDir: string,
  map: Record<string, CursorFileEntry>,
): void {
  const p = cursorPathV2(lancedbDir);
  try {
    mkdirSync(dirname(p), { recursive: true });
  } catch {
    // ignore
  }
  writeFileSync(p, JSON.stringify(map, null, 0), "utf8");
}

/** Role key stable for counting (aligns with full_context source roles). */
export function normalizeRoleForCursor(role: string): string {
  const t = (role ?? "").trim();
  if (!t) {
    return "others";
  }
  if (t === "developer") {
    return "system";
  }
  if (t === "toolResult" || t === "tool_result") {
    return "tool_result";
  }
  return t;
}

export function countRolesInMessagesPrefix(messages: unknown[], endExclusive: number): Record<string, number> {
  const counts: Record<string, number> = {};
  const end = Math.max(0, Math.min(Math.floor(endExclusive), messages.length));
  for (let i = 0; i < end; i++) {
    const role = normalizeRoleForCursor(getMessageRoleRaw(messages[i]));
    counts[role] = (counts[role] ?? 0) + 1;
  }
  return counts;
}

function getMessageRoleRaw(msg: unknown): string {
  if (!msg || typeof msg !== "object") {
    return "";
  }
  const r = (msg as Record<string, unknown>).role;
  return typeof r === "string" ? r : "";
}

/**
 * Resolve saved role counts for this session key; migrates legacy lastEndExclusive using current transcript.
 */
export function resolveRoleCountsForSession(
  entry: CursorFileEntry | undefined,
  messages: unknown[],
  log: { info: (m: string) => void },
): { roleCounts: Record<string, number>; lastMessagesLength: number } {
  if (isV2Entry(entry)) {
    return {
      roleCounts: { ...entry.roleCounts },
      lastMessagesLength: entry.lastMessagesLength ?? 0,
    };
  }
  if (isLegacyEntry(entry)) {
    const end = Math.min(Math.max(0, entry.lastEndExclusive), messages.length);
    log.info("openclaw-memory-alibaba-local: migrated legacy full-context cursor to per-role counts");
    return {
      roleCounts: countRolesInMessagesPrefix(messages, end),
      lastMessagesLength: end,
    };
  }
  return { roleCounts: {}, lastMessagesLength: 0 };
}

/** @deprecated use loadAgentEndCursorMap */
export function loadFullContextCursors(lancedbDir: string): Record<string, { lastEndExclusive: number }> {
  const map = loadAgentEndCursorMap(lancedbDir);
  const out: Record<string, { lastEndExclusive: number }> = {};
  for (const [k, v] of Object.entries(map)) {
    if (isLegacyEntry(v)) {
      out[k] = { lastEndExclusive: v.lastEndExclusive };
    }
  }
  return out;
}

/** @deprecated no-op for v2; kept for API compatibility */
export function saveFullContextCursors(
  _lancedbDir: string,
  _cursors: Record<string, { lastEndExclusive: number }>,
): void {
  // v2 uses saveAgentEndCursorMap only
}
