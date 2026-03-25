/**
 * Shared admin-panel operations for memory DB (used by Gateway WebSocket RPC).
 */

import type { MemoryCategory, MemoryConfig } from "../config.js";
import {
  FULL_CONTEXT_ASSISTANT,
  FULL_CONTEXT_MEMORY,
  FULL_CONTEXT_OTHERS,
  FULL_CONTEXT_SOURCE_CATEGORIES,
  FULL_CONTEXT_SYSTEM,
  FULL_CONTEXT_TOOL,
  FULL_CONTEXT_TOOL_RESULT,
  FULL_CONTEXT_USER,
  MANUAL_INSERT_SESSION,
  MEMORY_CATEGORY_LABEL_ZH,
  SELF_IMPROVING_CATEGORIES,
  USER_MEMORY_CATEGORIES,
  isFullContextSourceCategory,
} from "../categories.js";
import type { AdminListFilters, MemoryDashboardAggregate, MemoryDB, MemoryEntry } from "../db.js";

const MANUAL_ADD_MAX_CHARS = 8000;

export type MemoryAdminOpsOpts = {
  encodeForStorage?: (text: string) => Promise<{ chunks: string[]; vectors: number[][] }>;
  vectorDim?: number;
};

export type MemoryAdminOpsContext = {
  db: MemoryDB;
  cfg: MemoryConfig;
  opts?: MemoryAdminOpsOpts | null;
};

export type AdminOpResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; body: Record<string, unknown> };

function categoryUsesRealEmbedding(category: MemoryCategory): boolean {
  return category !== FULL_CONTEXT_MEMORY && !isFullContextSourceCategory(category);
}

function writableCategoriesForPanel(cfg: MemoryConfig): MemoryCategory[] {
  const out: MemoryCategory[] = [...USER_MEMORY_CATEGORIES];
  if (cfg.enableFullContextMemory) {
    out.push(
      FULL_CONTEXT_USER,
      FULL_CONTEXT_ASSISTANT,
      FULL_CONTEXT_SYSTEM,
      FULL_CONTEXT_TOOL,
      FULL_CONTEXT_TOOL_RESULT,
      FULL_CONTEXT_OTHERS,
    );
  }
  if (cfg.enableSelfImprovingMemory) {
    out.push(...SELF_IMPROVING_CATEGORIES);
  }
  return out;
}

export function buildPanelConfigPayload(cfg: MemoryConfig) {
  return {
    enableFullContextMemory: cfg.enableFullContextMemory,
    enableSelfImprovingMemory: cfg.enableSelfImprovingMemory,
    categoryLabelsZh: { ...MEMORY_CATEGORY_LABEL_ZH },
    tabCategories: {
      user: [...USER_MEMORY_CATEGORIES],
      self: cfg.enableSelfImprovingMemory ? [...SELF_IMPROVING_CATEGORIES] : [],
      full: cfg.enableFullContextMemory ? [...FULL_CONTEXT_SOURCE_CATEGORIES] : [],
    },
    memoryTypeFilterOptions: cfg.adminPanelMemoryTypeOptions,
  };
}

function tabToCategories(tab: string, cfg: MemoryConfig): MemoryCategory[] {
  if (tab === "full") {
    return cfg.enableFullContextMemory ? [...FULL_CONTEXT_SOURCE_CATEGORIES] : [];
  }
  if (tab === "self") {
    return cfg.enableSelfImprovingMemory ? [...SELF_IMPROVING_CATEGORIES] : [];
  }
  return [...USER_MEMORY_CATEGORIES];
}

/** Epoch ms → ISO 8601 UTC（如 `2026-03-25T06:28:00.000Z`）。 */
export function epochMsToIso8601(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * 管理 RPC 时间筛选：优先 **ISO 8601 字符串**；仍接受 **数字毫秒**（兼容旧客户端）。
 */
function parseOptionalTimeParam(value: unknown): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  const t = Date.parse(String(value));
  return Number.isNaN(t) ? undefined : t;
}

export type MemoryAdminListItemRpc = Omit<MemoryEntry, "createdAt"> & { createdAt: string };

function memoryEntryToRpcPayload(e: MemoryEntry): MemoryAdminListItemRpc {
  return { ...e, createdAt: epochMsToIso8601(e.createdAt) };
}

/** 大盘 RPC 出参：`timeFrom` / `timeTo` 为 ISO 8601，不再返回 `timeFromMs` / `timeToMs`。 */
export type MemoryDashboardAggregateRpc = Omit<MemoryDashboardAggregate, "timeFromMs" | "timeToMs"> & {
  timeFrom: string;
  timeTo: string;
};

async function ensureDb(ctx: MemoryAdminOpsContext): Promise<AdminOpResult<null>> {
  try {
    await ctx.db.ensureReady();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, status: 503, body: { error: "Database unavailable", detail: String(e) } };
  }
}

export async function opMemoryAdminConfig(ctx: MemoryAdminOpsContext): Promise<AdminOpResult<unknown>> {
  const r = await ensureDb(ctx);
  if (!r.ok) {
    return r;
  }
  return { ok: true, data: buildPanelConfigPayload(ctx.cfg) };
}

export async function opMemoryAdminFacets(ctx: MemoryAdminOpsContext): Promise<AdminOpResult<unknown>> {
  const r = await ensureDb(ctx);
  if (!r.ok) {
    return r;
  }
  try {
    const facets = await ctx.db.listAdminFacets([], undefined, undefined);
    return { ok: true, data: facets };
  } catch (e) {
    return { ok: false, status: 400, body: { error: String(e) } };
  }
}

export async function opMemoryAdminDashboard(
  ctx: MemoryAdminOpsContext,
  params: Record<string, unknown>,
): Promise<AdminOpResult<unknown>> {
  const r = await ensureDb(ctx);
  if (!r.ok) {
    return r;
  }
  const timeFromMs = parseOptionalTimeParam(params.timeFrom);
  const timeToMs = parseOptionalTimeParam(params.timeTo);
  if (timeFromMs === undefined || timeToMs === undefined) {
    return {
      ok: false,
      status: 400,
      body: { error: "timeFrom and timeTo are required (ISO 8601 strings, e.g. 2026-03-25T06:28:00.000Z)" },
    };
  }
  const agentId = String(params.agentId ?? "").trim();
  const sessionId = String(params.sessionId ?? "").trim();
  if (!agentId) {
    return { ok: false, status: 400, body: { error: "缺少 agentId：请先选择 Agent" } };
  }
  try {
    const agg = await ctx.db.getAdminDashboardAggregates(timeFromMs, timeToMs, agentId, sessionId);
    const { timeFromMs: fromMs, timeToMs: toMs, ...rest } = agg;
    const data: MemoryDashboardAggregateRpc = {
      ...rest,
      timeFrom: epochMsToIso8601(fromMs),
      timeTo: epochMsToIso8601(toMs),
    };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, status: 400, body: { error: String(e) } };
  }
}

export async function opMemoryAdminList(
  ctx: MemoryAdminOpsContext,
  params: Record<string, unknown>,
): Promise<AdminOpResult<unknown>> {
  const r = await ensureDb(ctx);
  if (!r.ok) {
    return r;
  }
  const cfg = ctx.cfg;
  const tab = String(params.tab || "user");
  const agentId = String(params.agentId ?? "").trim();
  const sessionId = String(params.sessionId ?? "").trim();
  if (!agentId) {
    return { ok: false, status: 400, body: { error: "缺少 agentId：请先选择 Agent" } };
  }
  const baseCats = tabToCategories(tab, cfg);
  if (baseCats.length === 0) {
    return { ok: true, data: { items: [], total: 0, page: 1, pageSize: 100 } };
  }
  const timeFromMs = parseOptionalTimeParam(params.timeFrom);
  const timeToMs = parseOptionalTimeParam(params.timeTo);
  const page = Math.max(1, parseInt(String(params.page || "1"), 10) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(String(params.limit || "100"), 10) || 100));

  const categoryOne = String(params.category ?? "").trim();
  let filterCats = baseCats;
  if (categoryOne) {
    if (!baseCats.includes(categoryOne as MemoryCategory)) {
      return { ok: false, status: 400, body: { error: "category 与当前 Tab 不匹配" } };
    }
    const listTab = tab === "full" ? "full" : tab === "self" ? "self" : "user";
    const optList = cfg.adminPanelMemoryTypeOptions[listTab];
    if (!optList.some((o) => o.category === categoryOne)) {
      return { ok: false, status: 400, body: { error: "category 不在插件配置的记忆类型筛选项中" } };
    }
    filterCats = [categoryOne as MemoryCategory];
  }

  const filters: AdminListFilters = {
    categories: filterCats,
    timeFromMs,
    timeToMs,
    agentId,
  };
  if (sessionId) {
    filters.sessionId = sessionId;
  }

  try {
    const sortDesc = params.sortDesc !== false && String(params.sortDesc) !== "false";
    const adminTab = tab === "full" ? "full" : tab === "self" ? "self" : "user";
    const { total, items } = await ctx.db.listAdminFiltered(filters, page, pageSize, {
      adminTab,
      sortDesc,
    });
    return {
      ok: true,
      data: { items: items.map(memoryEntryToRpcPayload), total, page, pageSize },
    };
  } catch (e) {
    return { ok: false, status: 400, body: { error: String(e) } };
  }
}

export async function opMemoryAdminDelete(
  ctx: MemoryAdminOpsContext,
  params: Record<string, unknown>,
): Promise<AdminOpResult<unknown>> {
  const r = await ensureDb(ctx);
  if (!r.ok) {
    return r;
  }
  const itemsRaw = params.items;
  const items = Array.isArray(itemsRaw) ? itemsRaw : [];
  const normalized: { agentId: string; id: string }[] = [];
  for (const it of items) {
    const o = it as { agentId?: string; id?: string };
    if (o?.agentId && o?.id) {
      normalized.push({ agentId: String(o.agentId), id: String(o.id) });
    }
  }
  if (normalized.length === 0) {
    return { ok: false, status: 400, body: { error: "items required" } };
  }
  const n = await ctx.db.deleteMany(normalized);
  return { ok: true, data: { deleted: n } };
}

export async function opMemoryAdminAdd(
  ctx: MemoryAdminOpsContext,
  params: Record<string, unknown>,
): Promise<AdminOpResult<unknown>> {
  const r = await ensureDb(ctx);
  if (!r.ok) {
    return r;
  }
  const enc = ctx.opts?.encodeForStorage;
  const vectorDim =
    typeof ctx.opts?.vectorDim === "number" && ctx.opts.vectorDim > 0 ? ctx.opts.vectorDim : 768;
  const agentId = String(params.agentId ?? "").trim();
  const textRaw = params.text == null ? "" : String(params.text);
  const category = String(params.category ?? "").trim() as MemoryCategory;
  if (!agentId) {
    return { ok: false, status: 400, body: { error: "agentId required" } };
  }
  const text = textRaw.trim();
  if (!text.length) {
    return { ok: false, status: 400, body: { error: "text required" } };
  }
  const allowed = new Set(writableCategoriesForPanel(ctx.cfg));
  if (!allowed.has(category)) {
    return { ok: false, status: 400, body: { error: "invalid or disabled category" } };
  }
  const textForEmbed = text.length > MANUAL_ADD_MAX_CHARS ? text.slice(0, MANUAL_ADD_MAX_CHARS) : text;
  const needsRealEmbed = categoryUsesRealEmbedding(category);
  if (needsRealEmbed && !enc) {
    return { ok: false, status: 503, body: { error: "Embedding not configured; plugin needs embedding in config." } };
  }
  let vectors: number[][];
  if (needsRealEmbed) {
    try {
      const out = await enc!(textForEmbed);
      vectors = out.vectors;
    } catch (e) {
      return { ok: false, status: 502, body: { error: `embed failed: ${String(e)}` } };
    }
    if (vectors.length === 0) {
      return { ok: false, status: 400, body: { error: "nothing to embed (empty after chunking)" } };
    }
  } else {
    vectors = [Array.from({ length: vectorDim }, () => 0)];
  }
  const stored = await ctx.db.storeMany(
    agentId,
    vectors.map((vector, idx) => ({
      text: textForEmbed,
      vector,
      importance: 1,
      category,
      userId: "",
      sessionId: MANUAL_INSERT_SESSION,
      seqInBatch: 0,
      chunkIndex: idx,
    })),
  );
  return {
    ok: true,
    data: {
      id: stored[0]!.id,
      createdAt: epochMsToIso8601(stored[0]!.createdAt),
      chunkRows: stored.length,
    },
  };
}
