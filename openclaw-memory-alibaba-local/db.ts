import { randomUUID } from "node:crypto";
import type * as LanceDB from "@lancedb/lancedb";
import type { MemoryCategory } from "./config.js";
import {
  FULL_CONTEXT_MEMORY,
  FULL_CONTEXT_SOURCE_CATEGORIES,
  SELF_IMPROVING_CATEGORIES,
  USER_MEMORY_FACT,
  USER_MEMORY_CATEGORIES,
} from "./categories.js";

export type MemoryEntry = {
  id: string;
  agentId: string;
  sessionId?: string;
  text: string;
  importance: number;
  category: MemoryCategory;
  createdAt: number;
  isDeleted?: number;
  /** agent_end batch grouping for full-context rows */
  batchId?: string;
  seqInBatch?: number;
  /** 同一逻辑记忆多向量行时的段序号（0..n-1）；与 seqInBatch 配合排序 */
  chunkIndex?: number;
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
  const batchId = row.batchId != null && String(row.batchId).length > 0 ? String(row.batchId) : undefined;
  const seqRaw = row.seqInBatch;
  const seqInBatch =
    typeof seqRaw === "number" && Number.isFinite(seqRaw) ? Math.floor(seqRaw) : undefined;
  const ciRaw = row.chunkIndex;
  const chunkIndex =
    typeof ciRaw === "number" && Number.isFinite(ciRaw) ? Math.floor(ciRaw) : undefined;
  return {
    id: String(row.id ?? ""),
    agentId: aid,
    sessionId: String(row.sessionId ?? ""),
    text: String(row.text ?? ""),
    importance: Number(row.importance ?? 0),
    category: ((row.category as MemoryCategory) || USER_MEMORY_FACT) as MemoryCategory,
    createdAt: Number(row.createdAt ?? 0),
    isDeleted: isDel !== undefined && isDel !== null ? Number(isDel) : undefined,
    batchId,
    seqInBatch,
    chunkIndex,
  };
}

export type AdminListFilters = {
  categories: MemoryCategory[];
  agentId?: string;
  sessionId?: string;
  timeFromMs?: number;
  timeToMs?: number;
};

/** 管理端「记忆大盘」聚合（与列表共用时间 / Agent / 会话条件；不按 Tab 类别过滤）。 */
export type MemoryDashboardAggregate = {
  total: number;
  timeFromMs: number;
  timeToMs: number;
  byKind: { user: number; self: number; full: number; other: number };
  byCategory: Record<string, number>;
  byBucket: Array<{ key: string; label: string; count: number }>;
  topAgents: Array<{ agentId: string; count: number }>;
  topSessions: Array<{ sessionId: string; count: number }>;
  importance: { low: number; mid: number; high: number; avg: number };
  uniqueAgents: number;
  uniqueSessions: number;
};

const USER_CAT_SET = new Set<string>(USER_MEMORY_CATEGORIES);
const SELF_CAT_SET = new Set<string>(SELF_IMPROVING_CATEGORIES);
const FULL_CAT_SET = new Set<string>([FULL_CONTEXT_MEMORY, ...FULL_CONTEXT_SOURCE_CATEGORIES]);

function memoryCategoryKind(category: string): "user" | "self" | "full" | "other" {
  if (USER_CAT_SET.has(category)) {
    return "user";
  }
  if (SELF_CAT_SET.has(category)) {
    return "self";
  }
  if (FULL_CAT_SET.has(category)) {
    return "full";
  }
  return "other";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 与写入趋势按日桶一致，使用本地时间的年月键。 */
function localYearMonthKeyFromMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** 覆盖 [fromMs, toMs] 内涉及的每个自然月（本地），顺序从早到晚。 */
function localMonthsOverlappingRange(fromMs: number, toMs: number): Array<{ key: string; label: string }> {
  const start = new Date(fromMs);
  const end = new Date(toMs);
  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  const out: Array<{ key: string; label: string }> = [];
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${pad2(m + 1)}`;
    out.push({ key, label: key });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

/** 写入趋势：按日桶时跨度上限（天）；超过则改为按月桶，避免一年只有 60 天有数据。 */
const DASHBOARD_MAX_DAILY_SPAN_MS = 60 * 86400000;

function buildAdminWhereClause(f: AdminListFilters): string {
  const parts: string[] = [];
  parts.push(`id != '${sqlEscapeLiteral(BOOTSTRAP_ROW_ID)}'`);
  if (f.categories.length > 0) {
    const list = f.categories.map((c) => `'${sqlEscapeLiteral(String(c))}'`).join(", ");
    parts.push(`category IN (${list})`);
  }
  parts.push(`isDeleted = 0`);
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

function compareSeqInBatchThenChunk(a: MemoryEntry, b: MemoryEntry): number {
  const sb = (a.seqInBatch ?? 0) - (b.seqInBatch ?? 0);
  if (sb !== 0) {
    return sb;
  }
  return (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0);
}

/**
 * 全文记忆管理端：按 batchId 分组；轮次之间按 batch 时间 sortDesc，组内始终时间/seq/chunk 正序。
 */
function sortFullContextAdminGrouped(entries: MemoryEntry[], batchOrderNewestFirst: boolean): void {
  const withBatch = new Map<string, MemoryEntry[]>();
  const noBatch: MemoryEntry[] = [];
  for (const e of entries) {
    const bid = e.batchId != null && String(e.batchId).trim() ? String(e.batchId).trim() : "";
    if (!bid) {
      noBatch.push(e);
      continue;
    }
    let arr = withBatch.get(bid);
    if (!arr) {
      arr = [];
      withBatch.set(bid, arr);
    }
    arr.push(e);
  }
  for (const arr of withBatch.values()) {
    arr.sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return a.createdAt - b.createdAt;
      }
      return compareSeqInBatchThenChunk(a, b);
    });
  }
  const batchKeys = [...withBatch.keys()];
  batchKeys.sort((ka, kb) => {
    const ta = withBatch.get(ka)![0]!.createdAt;
    const tb = withBatch.get(kb)![0]!.createdAt;
    return batchOrderNewestFirst ? tb - ta : ta - tb;
  });
  entries.length = 0;
  for (const k of batchKeys) {
    entries.push(...withBatch.get(k)!);
  }
  noBatch.sort((a, b) => {
    return batchOrderNewestFirst ? b.createdAt - a.createdAt : a.createdAt - b.createdAt;
  });
  entries.push(...noBatch);
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
      batchId: "",
      seqInBatch: 0,
      contentHash: "",
      chunkIndex: 0,
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

  /** LanceDB `vector` column width; used for full_context rows stored without real embeddings (zero placeholder). */
  getEmbeddingVectorDim(): number {
    return this.vectorDim;
  }

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

  /**
   * Checkout the latest dataset version before every read operation.
   * LanceDB's Table object may remain pinned to a stale snapshot after createIndex() or after
   * any write when the JS-side dataset reference is not automatically advanced. Calling
   * checkoutLatest() is the official API to advance the read version to HEAD without
   * reopening the connection. Called internally before all query paths.
   */
  private async refreshToLatest(): Promise<void> {
    if (this.table) {
      try {
        await this.table.checkoutLatest();
      } catch {
        // checkoutLatest is best-effort; ignore errors (e.g. table already at latest)
      }
    }
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
        batchId: "",
        seqInBatch: 0,
        contentHash: "",
        chunkIndex: 0,
      };
      const newTable = await this.db.createTable(LANCEDB_TABLE_NAME, [seed]);
      await newTable.delete('id = "__schema__"');
      await createScalarIndexesWithBootstrap(newTable, this.vectorDim);
      // Re-open the table after createScalarIndexesWithBootstrap to refresh the internal
      // Lance dataset snapshot reference. createIndex() may leave the Table object pointing
      // at a stale dataset version, causing subsequent query() calls to return empty results
      // even after storeMany() writes data successfully. openTable() always resolves to the
      // latest manifest on disk, restoring snapshot consistency.
      this.table = await this.db.openTable(LANCEDB_TABLE_NAME);
    }
  }

  /** Count rows matching admin UI filters (same predicate as list). */
  async countAdminFiltered(f: AdminListFilters): Promise<number> {
    await this.ensureInitialized();
    await this.refreshToLatest();
    const where = buildAdminWhereClause(f);
    return this.table!.countRows(where);
  }

  /**
   * 记忆大盘：在时间与可选 Agent/会话下扫描全部类别，内存聚合。
   * 与列表相同行数上限，避免一次加载过多。
   */
  async getAdminDashboardAggregates(
    timeFromMs: number,
    timeToMs: number,
    agentId?: string,
    sessionId?: string,
  ): Promise<MemoryDashboardAggregate> {
    const filters: AdminListFilters = {
      categories: [],
      timeFromMs,
      timeToMs,
    };
    const aid = (agentId ?? "").trim();
    const sid = (sessionId ?? "").trim();
    if (aid) {
      filters.agentId = aid;
    }
    if (sid) {
      filters.sessionId = sid;
    }
    await this.ensureInitialized();
    await this.refreshToLatest();
    const where = buildAdminWhereClause(filters);
    const total = await this.table!.countRows(where);
    if (total > ADMIN_LIST_MAX_MATCHING) {
      throw new Error(
        `Too many matching rows (${total}). Narrow the time range or filters (max ${ADMIN_LIST_MAX_MATCHING}).`,
      );
    }
    const rows = await this.table!
      .query()
      .where(where)
      .select(["category", "createdAt", "agentId", "sessionId", "importance"])
      .toArray();

    const byKind = { user: 0, self: 0, full: 0, other: 0 };
    const byCategory: Record<string, number> = {};
    const agentCounts = new Map<string, number>();
    const sessionCounts = new Map<string, number>();
    const agentsSeen = new Set<string>();
    const sessionsSeen = new Set<string>();
    let impSum = 0;
    let impN = 0;
    const impB = { low: 0, mid: 0, high: 0 };

    const fromMs = Math.floor(timeFromMs);
    const toMs = Math.floor(timeToMs);
    const span = Math.max(1, toMs - fromMs);
    const HOUR = 3600000;
    const DAY = 86400000;
    const useHourly = span <= 48 * HOUR;
    const wantMonthly = !useHourly && span > DASHBOARD_MAX_DAILY_SPAN_MS;
    const monthSlots = wantMonthly ? localMonthsOverlappingRange(fromMs, toMs) : null;
    const monthIndex = wantMonthly
      ? new Map(monthSlots!.map((s, i) => [s.key, i] as const))
      : null;

    let bucketSize = DAY;
    let nBuckets = 1;

    if (useHourly) {
      bucketSize = HOUR;
      nBuckets = Math.min(60, Math.max(1, Math.ceil(span / HOUR)));
    } else if (wantMonthly) {
      nBuckets = monthSlots!.length;
    } else {
      bucketSize = DAY;
      nBuckets = Math.max(1, Math.ceil(span / DAY));
    }

    const buckets = new Array<number>(nBuckets).fill(0);

    for (const raw of rows as Array<Record<string, unknown>>) {
      const cat = String(raw.category ?? "");
      const createdAt = Number(raw.createdAt ?? 0);
      const importance = Number(raw.importance ?? 0);
      const ag = String(raw.agentId ?? "").trim();
      const se = String(raw.sessionId ?? "").trim();

      const k = memoryCategoryKind(cat);
      byKind[k]++;

      byCategory[cat] = (byCategory[cat] ?? 0) + 1;

      if (ag) {
        agentCounts.set(ag, (agentCounts.get(ag) ?? 0) + 1);
        agentsSeen.add(ag);
      }
      if (se) {
        sessionCounts.set(se, (sessionCounts.get(se) ?? 0) + 1);
        sessionsSeen.add(se);
      }

      if (Number.isFinite(importance)) {
        impSum += importance;
        impN++;
        if (importance < 0.34) {
          impB.low++;
        } else if (importance < 0.67) {
          impB.mid++;
        } else {
          impB.high++;
        }
      }

      if (wantMonthly) {
        const bi = monthIndex!.get(localYearMonthKeyFromMs(createdAt));
        if (bi !== undefined) {
          buckets[bi]++;
        }
      } else {
        const rel = createdAt - fromMs;
        const bi = Math.floor(rel / bucketSize);
        if (bi >= 0 && bi < nBuckets) {
          buckets[bi]++;
        }
      }
    }

    const toBucketLabel = (ts: number): string => {
      const d = new Date(ts);
      if (useHourly) {
        return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:00`;
      }
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    };

    const byBucket = wantMonthly
      ? monthSlots!.map((s, i) => ({
          key: s.key,
          label: s.label,
          count: buckets[i] ?? 0,
        }))
      : buckets.map((count, i) => ({
          key: String(i),
          label: toBucketLabel(fromMs + i * bucketSize),
          count,
        }));

    const topFromMap = (m: Map<string, number>, n: number) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([agentId, count]) => ({ agentId, count }));

    const topSessionsFromMap = (m: Map<string, number>, n: number) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([sessionId, count]) => ({ sessionId, count }));

    return {
      total: rows.length,
      timeFromMs: fromMs,
      timeToMs: toMs,
      byKind,
      byCategory,
      byBucket,
      topAgents: topFromMap(agentCounts, 10),
      topSessions: topSessionsFromMap(sessionCounts, 10),
      importance: {
        low: impB.low,
        mid: impB.mid,
        high: impB.high,
        avg: impN > 0 ? impSum / impN : 0,
      },
      uniqueAgents: agentsSeen.size,
      uniqueSessions: sessionsSeen.size,
    };
  }

  /**
   * List rows for admin UI, paginated. Throws if match count > ADMIN_LIST_MAX_MATCHING.
   * - user/self: sort by createdAt; sortDesc=true → 新→旧。
   * - full: 按 batchId 分组；轮次间按 batch 时间 sortDesc；组内始终正序。
   */
  async listAdminFiltered(
    f: AdminListFilters,
    page: number,
    pageSize: number,
    options?: { adminTab?: "user" | "self" | "full"; sortDesc?: boolean },
  ): Promise<{ total: number; items: MemoryEntry[] }> {
    await this.ensureInitialized();
    await this.refreshToLatest();
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
        "batchId",
        "seqInBatch",
        "chunkIndex",
      ])
      .toArray();
    const entries = (rows as Array<Record<string, unknown>>).map((r) => rowToEntry(r));
    const tab = options?.adminTab ?? "user";
    const sortDesc = options?.sortDesc !== false;
    if (tab === "full") {
      sortFullContextAdminGrouped(entries, sortDesc);
    } else if (sortDesc) {
      entries.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      entries.sort((a, b) => a.createdAt - b.createdAt);
    }
    const p = Math.max(1, page);
    const ps = Math.max(1, Math.min(500, pageSize));
    const offset = (p - 1) * ps;
    return { total, items: entries.slice(offset, offset + ps) };
  }

  /**
   * Distinct agentId / sessionId for admin dropdowns (no agent/session filter).
   * Pass **categories = []** to scan all non-deleted rows (recommended for facets: legacy `full_context_memory`, unknown categories).
   * Non-empty categories adds `category IN (...)`.
   */
  /**
   * 拉取可供 BM25 打分的行（用户/自进化逻辑记忆），条数上限避免全表扫描过大。
   * 按 createdAt 新→旧排序。
   */
  async listRowsForBm25Recall(
    agentId: string,
    categories: MemoryCategory[],
    maxRows: number,
  ): Promise<MemoryEntry[]> {
    if (categories.length === 0) {
      return [];
    }
    await this.ensureInitialized();
    await this.refreshToLatest();
    const a = sqlEscapeLiteral(agentId);
    const list = categories.map((c) => `'${sqlEscapeLiteral(String(c))}'`).join(", ");
    const where = `id != '${sqlEscapeLiteral(BOOTSTRAP_ROW_ID)}' AND agentId = '${a}' AND isDeleted = 0 AND category IN (${list})`;
    const cap = Math.max(1, Math.min(maxRows, 50_000));
    const rows = await this.table!.query().where(where).limit(cap).toArray();
    const entries = (rows as Array<Record<string, unknown>>).map((r) => rowToEntry(r, agentId));
    entries.sort((a, b) => b.createdAt - a.createdAt);
    return entries;
  }

  async listAdminFacets(
    categories: MemoryCategory[],
    timeFromMs?: number,
    timeToMs?: number,
  ): Promise<{ agents: string[]; sessions: string[] }> {
    const f: AdminListFilters = {
      categories,
      timeFromMs,
      timeToMs,
    };
    await this.ensureInitialized();
    await this.refreshToLatest();
    const where = buildAdminWhereClause(f);
    let rows: Array<Record<string, unknown>>;
    try {
      rows = (await this.table!
        .query()
        .where(where)
        .select(["agentId", "sessionId"])
        .limit(25_000)
        .toArray()) as Array<Record<string, unknown>>;
    } catch (e) {
      console.warn("[openclaw-memory-alibaba-local] listAdminFacets query failed:", String(e));
      return { agents: [], sessions: [] };
    }
    const agents = new Set<string>();
    const sessions = new Set<string>();
    for (const row of rows) {
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
      batchId?: string | null;
      seqInBatch?: number | null;
      chunkIndex?: number | null;
    },
  ): Promise<MemoryEntry> {
    const [first] = await this.storeMany(agentId, [entry]);
    return first;
  }

  /**
   * Insert multiple vector rows (e.g. paragraph chunks). Each row gets a new id.
   * `text` should be the full logical memory text on every row for recall/LLM context.
   */
  async storeMany(
    agentId: string,
    entries: ReadonlyArray<{
      text: string;
      vector: number[];
      importance: number;
      category: MemoryCategory;
      userId?: string | null;
      sessionId?: string | null;
      batchId?: string | null;
      seqInBatch?: number | null;
      chunkIndex?: number | null;
    }>,
  ): Promise<MemoryEntry[]> {
    await this.ensureInitialized();
    if (entries.length === 0) {
      return [];
    }
    const createdAt = Date.now();
    const rows: Array<Record<string, unknown>> = [];
    const out: MemoryEntry[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const id = randomUUID();
      const batchId =
        entry.batchId != null && String(entry.batchId).trim() ? String(entry.batchId).trim() : "";
      const seqInBatch =
        typeof entry.seqInBatch === "number" && Number.isFinite(entry.seqInBatch)
          ? Math.floor(entry.seqInBatch)
          : 0;
      const chunkIndex =
        typeof entry.chunkIndex === "number" && Number.isFinite(entry.chunkIndex)
          ? Math.floor(entry.chunkIndex)
          : i;
      rows.push({
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
        batchId,
        seqInBatch,
        contentHash: "",
        chunkIndex,
      });
      out.push({
        id,
        agentId,
        text: entry.text,
        importance: entry.importance,
        category: entry.category,
        createdAt,
        batchId: batchId || undefined,
        seqInBatch,
        chunkIndex,
      });
    }
    await this.table!.add(rows);
    return out;
  }

  /** 是否已有相同 agent + session + category + 全文 的非删除行（用于自动捕获前跳过完全重复）。 */
  async existsSemanticDuplicate(
    agentId: string,
    sessionId: string,
    category: MemoryCategory,
    text: string,
  ): Promise<boolean> {
    const t = (text ?? "").trim();
    if (!t) {
      return false;
    }
    await this.ensureInitialized();
    await this.refreshToLatest();
    const a = sqlEscapeLiteral(agentId);
    const s = sqlEscapeLiteral(normSessionId(sessionId));
    const c = sqlEscapeLiteral(String(category));
    const tt = sqlEscapeLiteral(t);
    const where = `agentId = '${a}' AND sessionId = '${s}' AND category = '${c}' AND text = '${tt}' AND isDeleted = 0`;
    const rows = await this.table!.query().where(where).limit(1).toArray();
    return rows.length > 0;
  }

  /**
   * Vector search with multiple query embeddings; merge by category + text (chunk 行共享同一逻辑正文), keep max score.
   */
  async searchMerged(
    agentId: string,
    vectors: number[][],
    limit = 5,
    minScore = 0.5,
    categories?: MemoryCategory[],
  ): Promise<MemorySearchResult[]> {
    if (vectors.length === 0) {
      return [];
    }
    const perVec = Math.max(1, limit * 2);
    const merged = new Map<string, MemorySearchResult>();
    for (const v of vectors) {
      const hits = await this.search(agentId, v, perVec, minScore, categories);
      for (const h of hits) {
        const key = `${String(h.entry.category)}\0${h.entry.text}`;
        const prev = merged.get(key);
        if (!prev || h.score > prev.score) {
          merged.set(key, h);
        }
      }
    }
    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async search(
    agentId: string,
    vector: number[],
    limit = 5,
    minScore = 0.5,
    categories?: MemoryCategory[],
  ): Promise<MemorySearchResult[]> {
    await this.ensureInitialized();
    await this.refreshToLatest();
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

  async deleteMany(items: ReadonlyArray<{ agentId: string; id: string }>): Promise<number> {
    let n = 0;
    for (const it of items) {
      if (await this.delete(it.agentId, it.id)) {
        n++;
      }
    }
    return n;
  }

  /** 删除同一逻辑记忆的所有 chunk 行（agent + session + category + 正文完全一致）。 */
  async deleteByAgentSessionCategoryText(
    agentId: string,
    sessionId: string | null | undefined,
    category: MemoryCategory,
    text: string,
  ): Promise<number> {
    const t = (text ?? "").trim();
    if (!t) {
      return 0;
    }
    await this.ensureInitialized();
    const a = sqlEscapeLiteral(agentId);
    const s = sqlEscapeLiteral(normSessionId(sessionId));
    const c = sqlEscapeLiteral(String(category));
    const tt = sqlEscapeLiteral(t);
    const pred = `agentId = '${a}' AND sessionId = '${s}' AND category = '${c}' AND text = '${tt}'`;
    const res = await this.table!.delete(pred);
    return res.numDeletedRows ?? 0;
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
