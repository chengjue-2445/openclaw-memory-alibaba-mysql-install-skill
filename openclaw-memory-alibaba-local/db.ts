import { randomUUID } from "node:crypto";
import type * as LanceDB from "@lancedb/lancedb";
import type { MemoryCategory } from "./config.js";
import { USER_MEMORY_FACT } from "./categories.js";

export type MemoryEntry = {
  id: string;
  agentId: string;
  sessionId?: string;
  text: string;
  importance: number;
  category: MemoryCategory;
  createdAt: number;
  isDeleted?: number;
};

export type MemorySearchResult = {
  entry: MemoryEntry;
  score: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fixed LanceDB table name (coexists with official `memories` in the same db directory). */
export const LANCEDB_TABLE_NAME = "openclaw_memories_alibaba_local";

/** Sentinel row used only during initial table creation to train scalar indexes; then hard-deleted. */
export const BOOTSTRAP_ROW_ID = "00000000-0000-4000-8000-000000000001";
export const BOOTSTRAP_AGENT_ID = "__memory_index_bootstrap__";
export const BOOTSTRAP_SESSION_ID = "__memory_index_bootstrap__";

/** Max rows matching filters before list API rejects (sorting is in-memory). */
export const ADMIN_LIST_MAX_MATCHING = 50_000;

let lancedbImportPromise: Promise<typeof import("@lancedb/lancedb")> | null = null;

async function loadLanceDB(): Promise<typeof import("@lancedb/lancedb")> {
  if (!lancedbImportPromise) {
    lancedbImportPromise = import("@lancedb/lancedb");
  }
  try {
    return await lancedbImportPromise;
  } catch (err) {
    throw new Error(`openclaw-memory-alibaba-local: failed to load LanceDB. ${String(err)}`, {
      cause: err,
    });
  }
}

/** Escape string for LanceDB SQL-style filter predicates. */
export function sqlEscapeLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function normUserId(v: string | null | undefined): string {
  return v == null || v === "" ? "" : v;
}

function normSessionId(v: string | null | undefined): string {
  return v == null || v === "" ? "" : v;
}

function rowToEntry(row: Record<string, unknown>, fallbackAgentId?: string): MemoryEntry {
  const isDel = row.isDeleted;
  const aid = String(row.agentId ?? fallbackAgentId ?? "");
  return {
    id: String(row.id ?? ""),
    agentId: aid,
    sessionId: String(row.sessionId ?? ""),
    text: String(row.text ?? ""),
    importance: Number(row.importance ?? 0),
    category: ((row.category as MemoryCategory) || USER_MEMORY_FACT) as MemoryCategory,
    createdAt: Number(row.createdAt ?? 0),
    isDeleted: isDel !== undefined && isDel !== null ? Number(isDel) : undefined,
  };
}

export type AdminListFilters = {
  categories: MemoryCategory[];
  agentId?: string;
  sessionId?: string;
  timeFromMs?: number;
  timeToMs?: number;
  includeDeleted: boolean;
};

function buildAdminWhereClause(f: AdminListFilters): string {
  const parts: string[] = [];
  parts.push(`id != '${sqlEscapeLiteral(BOOTSTRAP_ROW_ID)}'`);
  if (f.categories.length > 0) {
    const list = f.categories.map((c) => `'${sqlEscapeLiteral(String(c))}'`).join(", ");
    parts.push(`category IN (${list})`);
  }
  if (!f.includeDeleted) {
    parts.push(`isDeleted = 0`);
  }
  if (typeof f.timeFromMs === "number" && Number.isFinite(f.timeFromMs)) {
    parts.push(`createdAt >= ${Math.floor(f.timeFromMs)}`);
  }
  if (typeof f.timeToMs === "number" && Number.isFinite(f.timeToMs)) {
    parts.push(`createdAt <= ${Math.floor(f.timeToMs)}`);
  }
  const aid = (f.agentId ?? "").trim();
  const sid = (f.sessionId ?? "").trim();
  if (aid) {
    parts.push(`agentId = '${sqlEscapeLiteral(aid)}'`);
  }
  if (sid) {
    parts.push(`sessionId = '${sqlEscapeLiteral(sid)}'`);
  }
  return parts.join(" AND ");
}

async function createScalarIndexesWithBootstrap(
  table: LanceDB.Table,
  vectorDim: number,
): Promise<void> {
  const vector = Array.from({ length: vectorDim }).fill(0) as number[];
  await table.add([
    {
      id: BOOTSTRAP_ROW_ID,
      agentId: BOOTSTRAP_AGENT_ID,
      userId: "",
      sessionId: BOOTSTRAP_SESSION_ID,
      text: "",
      vector,
      importance: 0,
      category: USER_MEMORY_FACT,
      createdAt: 0,
      isDeleted: 1,
    },
  ]);
  try {
    await table.createIndex("agentId");
  } catch (e) {
    console.warn("[openclaw-memory-alibaba-local] createIndex(agentId):", String(e));
  }
  try {
    await table.createIndex("sessionId");
  } catch (e) {
    console.warn("[openclaw-memory-alibaba-local] createIndex(sessionId):", String(e));
  }
  await table.delete(`id = '${BOOTSTRAP_ROW_ID}'`);
}

/** Same score mapping as OpenClaw memory-lancedb (L2 distance). */
function scoreFromL2Distance(distance: number): number {
  return 1 / (1 + distance);
}

export class MemoryDB {
  private db: LanceDB.Connection | null = null;
  private table: LanceDB.Table | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly dbPath: string,
    private readonly vectorDim: number,
  ) {}

  private async ensureInitialized(): Promise<void> {
    if (this.table) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  /** Await LanceDB open (for HTTP routes before first query). */
  async ensureReady(): Promise<void> {
    await this.ensureInitialized();
  }

  private async doInitialize(): Promise<void> {
    const lancedb = await loadLanceDB();
    this.db = await lancedb.connect(this.dbPath);
    const tables = await this.db.tableNames();

    if (tables.includes(LANCEDB_TABLE_NAME)) {
      this.table = await this.db.openTable(LANCEDB_TABLE_NAME);
    } else {
      const seed = {
        id: "__schema__",
        agentId: "",
        userId: "",
        sessionId: "",
        text: "",
        vector: Array.from({ length: this.vectorDim }).fill(0) as number[],
        importance: 0,
        category: USER_MEMORY_FACT,
        createdAt: 0,
        isDeleted: 1,
      };
      this.table = await this.db.createTable(LANCEDB_TABLE_NAME, [seed]);
      await this.table.delete('id = "__schema__"');
      await createScalarIndexesWithBootstrap(this.table, this.vectorDim);
    }
  }

  /** Count rows matching admin UI filters (same predicate as list). */
  async countAdminFiltered(f: AdminListFilters): Promise<number> {
    await this.ensureInitialized();
    const where = buildAdminWhereClause(f);
    return this.table!.countRows(where);
  }

  /**
   * List rows for admin UI: createdAt desc, paginated. Throws if match count > ADMIN_LIST_MAX_MATCHING.
   */
  async listAdminFiltered(
    f: AdminListFilters,
    page: number,
    pageSize: number,
  ): Promise<{ total: number; items: MemoryEntry[] }> {
    await this.ensureInitialized();
    const where = buildAdminWhereClause(f);
    const total = await this.table!.countRows(where);
    if (total > ADMIN_LIST_MAX_MATCHING) {
      throw new Error(
        `Too many matching rows (${total}). Narrow the time range or filters (max ${ADMIN_LIST_MAX_MATCHING}).`,
      );
    }
    const rows = await this.table!
      .query()
      .where(where)
      .select([
        "id",
        "agentId",
        "sessionId",
        "category",
        "createdAt",
        "isDeleted",
        "importance",
        "text",
      ])
      .toArray();
    const entries = (rows as Array<Record<string, unknown>>).map((r) => rowToEntry(r));
    entries.sort((a, b) => b.createdAt - a.createdAt);
    const p = Math.max(1, page);
    const ps = Math.max(1, Math.min(500, pageSize));
    const offset = (p - 1) * ps;
    return { total, items: entries.slice(offset, offset + ps) };
  }

  /**
   * Distinct agentId / sessionId for dropdowns (time + deleted + categories only; no agent/session filter).
   */
  async listAdminFacets(
    categories: MemoryCategory[],
    timeFromMs?: number,
    timeToMs?: number,
    includeDeleted = false,
  ): Promise<{ agents: string[]; sessions: string[] }> {
    const f: AdminListFilters = {
      categories,
      includeDeleted,
      timeFromMs,
      timeToMs,
    };
    await this.ensureInitialized();
    const where = buildAdminWhereClause(f);
    const rows = await this.table!
      .query()
      .where(where)
      .select(["agentId", "sessionId"])
      .limit(25_000)
      .toArray();
    const agents = new Set<string>();
    const sessions = new Set<string>();
    for (const row of rows as Array<Record<string, unknown>>) {
      const a = String(row.agentId ?? "").trim();
      const s = String(row.sessionId ?? "").trim();
      if (a) {
        agents.add(a);
      }
      if (s) {
        sessions.add(s);
      }
    }
    return {
      agents: [...agents].sort(),
      sessions: [...sessions].sort(),
    };
  }

  async store(
    agentId: string,
    entry: {
      text: string;
      vector: number[];
      importance: number;
      category: MemoryCategory;
      userId?: string | null;
      sessionId?: string | null;
    },
  ): Promise<MemoryEntry> {
    await this.ensureInitialized();
    const id = randomUUID();
    const createdAt = Date.now();
    const row = {
      id,
      agentId,
      userId: normUserId(entry.userId),
      sessionId: normSessionId(entry.sessionId),
      text: entry.text,
      vector: entry.vector,
      importance: entry.importance,
      category: entry.category,
      createdAt,
      isDeleted: 0,
    };
    await this.table!.add([row]);
    return {
      id,
      agentId,
      text: entry.text,
      importance: entry.importance,
      category: entry.category,
      createdAt,
    };
  }

  async storeOrUpdateFullContext(
    agentId: string,
    sessionId: string | null,
    entry: {
      text: string;
      vector: number[];
      importance: number;
      category: MemoryCategory;
      userId?: string | null;
    },
  ): Promise<{ action: "created" | "updated"; entry: MemoryEntry }> {
    await this.ensureInitialized();
    const sid = normSessionId(sessionId);
    const a = sqlEscapeLiteral(agentId);
    const c = sqlEscapeLiteral(String(entry.category));
    const s = sqlEscapeLiteral(sid);
    const where = `agentId = '${a}' AND category = '${c}' AND isDeleted = 0 AND sessionId = '${s}'`;
    const rows = await this.table!.query().where(where).limit(1).toArray();
    const createdAt = Date.now();
    const textSafe = entry.text;
    const userId = normUserId(entry.userId);

    if (rows.length > 0) {
      const existing = rows[0] as Record<string, unknown>;
      const eid = String(existing.id ?? "");
      const w = `id = '${sqlEscapeLiteral(eid)}' AND agentId = '${a}'`;
      await this.table!.update({
        where: w,
        values: {
          text: textSafe,
          vector: entry.vector,
          importance: entry.importance,
          createdAt,
          userId,
        },
      });
      return {
        action: "updated",
        entry: {
          id: eid,
          agentId,
          text: textSafe,
          importance: entry.importance,
          category: entry.category,
          createdAt,
        },
      };
    }

    const id = randomUUID();
    await this.table!.add([
      {
        id,
        agentId,
        userId,
        sessionId: sid,
        text: textSafe,
        vector: entry.vector,
        importance: entry.importance,
        category: entry.category,
        createdAt,
        isDeleted: 0,
      },
    ]);
    return {
      action: "created",
      entry: {
        id,
        agentId,
        text: textSafe,
        importance: entry.importance,
        category: entry.category,
        createdAt,
      },
    };
  }

  async search(
    agentId: string,
    vector: number[],
    limit = 5,
    minScore = 0.5,
    categories?: MemoryCategory[],
  ): Promise<MemorySearchResult[]> {
    await this.ensureInitialized();
    const a = sqlEscapeLiteral(agentId);
    const parts = [`agentId = '${a}'`, `isDeleted = 0`];
    if (Array.isArray(categories) && categories.length > 0) {
      const list = categories.map((cat) => `'${sqlEscapeLiteral(String(cat))}'`).join(", ");
      parts.push(`category IN (${list})`);
    }
    const whereClause = parts.join(" AND ");

    const rows = await this.table!
      .vectorSearch(vector)
      .where(whereClause)
      .limit(Math.max(1, limit))
      .toArray();

    const results: MemorySearchResult[] = [];
    for (const row of rows as Array<Record<string, unknown>>) {
      const distance = Number(row._distance ?? 0);
      const score = scoreFromL2Distance(distance);
      if (score < minScore) {
        continue;
      }
      results.push({
        entry: rowToEntry(row, agentId),
        score,
      });
    }
    return results;
  }

  async softDelete(agentId: string, id: string): Promise<boolean> {
    if (!UUID_RE.test(id)) {
      throw new Error(`Invalid memory ID format: ${id}`);
    }
    await this.ensureInitialized();
    const w = `id = '${sqlEscapeLiteral(id)}' AND agentId = '${sqlEscapeLiteral(agentId)}'`;
    const res = await this.table!.update({
      where: w,
      values: { isDeleted: 1 },
    });
    return (res.rowsUpdated ?? 0) > 0;
  }

  async softDeleteMany(items: ReadonlyArray<{ agentId: string; id: string }>): Promise<number> {
    let n = 0;
    for (const it of items) {
      if (await this.softDelete(it.agentId, it.id)) {
        n++;
      }
    }
    return n;
  }

  async delete(agentId: string, id: string): Promise<boolean> {
    if (!UUID_RE.test(id)) {
      throw new Error(`Invalid memory ID format: ${id}`);
    }
    await this.ensureInitialized();
    const pred = `id = '${sqlEscapeLiteral(id)}' AND agentId = '${sqlEscapeLiteral(agentId)}'`;
    const res = await this.table!.delete(pred);
    return (res.numDeletedRows ?? 0) > 0;
  }

  async close(): Promise<void> {
    try {
      this.table?.close();
    } catch {
      // ignore
    }
    try {
      this.db?.close();
    } catch {
      // ignore
    }
    this.table = null;
    this.db = null;
    this.initPromise = null;
  }
}
