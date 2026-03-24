/**
 * Memory admin panel — /plugins/memory (HTML + JSON API).
 * Auth aligned with openclaw-observability: gateway.auth.token → ?token= or Bearer.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MemoryCategory, MemoryConfig } from "../config.js";
import {
  FULL_CONTEXT_ASSISTANT,
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
} from "../categories.js";
import type { MemoryDB } from "../db.js";
import type { AdminListFilters } from "../db.js";
import { getMemoryPanelHtml } from "./memory-ui.js";

const MANUAL_ADD_MAX_CHARS = 8000;

export type MemoryPanelRoutesOpts = {
  /** Required for POST /api/add (embedding). */
  encodeForStorage?: (text: string) => Promise<{ chunks: string[]; vectors: number[][] }>;
};

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

function buildPanelConfigPayload(cfg: MemoryConfig) {
  return {
    enableFullContextMemory: cfg.enableFullContextMemory,
    enableSelfImprovingMemory: cfg.enableSelfImprovingMemory,
    categoryLabelsZh: { ...MEMORY_CATEGORY_LABEL_ZH },
    tabCategories: {
      user: [...USER_MEMORY_CATEGORIES],
      self: cfg.enableSelfImprovingMemory ? [...SELF_IMPROVING_CATEGORIES] : [],
      full: cfg.enableFullContextMemory ? [...FULL_CONTEXT_SOURCE_CATEGORIES] : [],
    },
  };
}

export type RegisterHttpRoute = (params: {
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean | void> | boolean | void;
  auth: "gateway" | "plugin";
  match?: "exact" | "prefix";
  replaceExisting?: boolean;
}) => void;

type PluginLogger = { info: (m: string) => void; warn: (m: string) => void };

function resolveGatewayToken(): string | undefined {
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
  const openclawConfigPath = process.env.OPENCLAW_CONFIG_PATH ?? path.join(stateDir, "openclaw.json");
  try {
    if (fs.existsSync(openclawConfigPath)) {
      const raw = fs.readFileSync(openclawConfigPath, "utf8");
      let t: string | undefined;
      try {
        const parsed = JSON.parse(raw) as { gateway?: { auth?: { token?: string } } };
        t = parsed?.gateway?.auth?.token;
      } catch {
        const m = raw.match(
          /"gateway"\s*:\s*\{[\s\S]*?"auth"\s*:\s*\{[\s\S]*?"token"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        );
        t = m?.[1]?.replace(/\\(.)/g, "$1");
      }
      if (typeof t === "string" && t.length > 0) {
        return t;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
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

function parseUrl(req: IncomingMessage): URL {
  return new URL(req.url || "/", "http://" + (req.headers.host || "localhost"));
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  });
  res.end(html);
}

function readBody(req: IncomingMessage, maxBytes = 1024 * 64): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        req.destroy();
        reject(new Error("body too large"));
        return;
      }
      data += chunk.toString();
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export function registerMemoryPanelRoutes(
  registerHttpRoute: RegisterHttpRoute,
  db: MemoryDB,
  cfg: MemoryConfig,
  logger: PluginLogger,
  opts?: MemoryPanelRoutesOpts | null,
): void {
  const requiredToken = resolveGatewayToken();
  const token = typeof requiredToken === "string" && requiredToken.length > 0 ? requiredToken : undefined;

  registerHttpRoute({
    path: "/plugins/memory",
    auth: "plugin",
    match: "prefix",
    handler: async (req, res) => {
      try {
        const url = parseUrl(req);
        const p = url.pathname;
        const isMemoryApi = p.startsWith("/plugins/memory/api/");

        // HTML shell is public so the browser can load the panel; JSON APIs stay token-protected.
        if (token && isMemoryApi) {
          const queryToken = (url.searchParams.get("token") ?? "").trim();
          const authHeader = (req.headers.authorization ?? req.headers.Authorization ?? "") as string;
          const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
          if (queryToken !== token && bearer !== token) {
            sendJson(res, 401, { error: { message: "Unauthorized", type: "unauthorized" } });
            return true;
          }
        }

        if (!isMemoryApi) {
          sendHtml(res, getMemoryPanelHtml());
          return true;
        }

        const tryDb = async (): Promise<boolean> => {
          try {
            await db.ensureReady();
            return true;
          } catch (e) {
            sendJson(res, 503, { error: "Database unavailable", detail: String(e) });
            return false;
          }
        };
        if (!(await tryDb())) {
          return true;
        }

        if (p === "/plugins/memory/api/config" && req.method === "GET") {
          sendJson(res, 200, buildPanelConfigPayload(cfg));
          return true;
        }

        if (p === "/plugins/memory/api/facets" && req.method === "GET") {
          try {
            // No category filter: include legacy `full_context_memory`, manual categories, and any future values.
            // List API still filters by tab category; dropdowns only need distinct agentId/sessionId from real rows.
            const facets = await db.listAdminFacets([], undefined, undefined);
            sendJson(res, 200, facets);
          } catch (e) {
            sendJson(res, 400, { error: String(e) });
          }
          return true;
        }

        if (p === "/plugins/memory/api/dashboard" && req.method === "GET") {
          const timeFromRaw = url.searchParams.get("timeFrom");
          const timeToRaw = url.searchParams.get("timeTo");
          const timeFromMs = parseOptionalTimeMs(timeFromRaw);
          const timeToMs = parseOptionalTimeMs(timeToRaw);
          if (timeFromMs === undefined || timeToMs === undefined) {
            sendJson(res, 400, { error: "timeFrom and timeTo are required (ISO 8601)" });
            return true;
          }
          const agentId = (url.searchParams.get("agentId") ?? "").trim();
          const sessionId = (url.searchParams.get("sessionId") ?? "").trim();
          try {
            const agg = await db.getAdminDashboardAggregates(timeFromMs, timeToMs, agentId, sessionId);
            sendJson(res, 200, agg);
          } catch (e) {
            sendJson(res, 400, { error: String(e) });
          }
          return true;
        }

        if (p === "/plugins/memory/api/list" && req.method === "GET") {
          const tab = url.searchParams.get("tab") || "user";
          const agentId = (url.searchParams.get("agentId") ?? "").trim();
          const sessionId = (url.searchParams.get("sessionId") ?? "").trim();
          if (!agentId && !sessionId) {
            sendJson(res, 400, { error: "agentId or sessionId required" });
            return true;
          }
          const cats = tabToCategories(tab, cfg);
          if (cats.length === 0) {
            sendJson(res, 200, { items: [], total: 0, page: 1, pageSize: 100 });
            return true;
          }
          const timeFromMs = parseOptionalTimeMs(url.searchParams.get("timeFrom"));
          const timeToMs = parseOptionalTimeMs(url.searchParams.get("timeTo"));
          const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
          const pageSize = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10) || 100));

          const filters: AdminListFilters = {
            categories: cats,
            timeFromMs,
            timeToMs,
          };
          if (agentId) {
            filters.agentId = agentId;
          }
          if (sessionId) {
            filters.sessionId = sessionId;
          }

          try {
            const sortDesc = url.searchParams.get("sortDesc") !== "false";
            const adminTab = tab === "full" ? "full" : tab === "self" ? "self" : "user";
            const { total, items } = await db.listAdminFiltered(filters, page, pageSize, {
              adminTab,
              sortDesc,
            });
            sendJson(res, 200, {
              items,
              total,
              page,
              pageSize,
            });
          } catch (e) {
            sendJson(res, 400, { error: String(e) });
          }
          return true;
        }

        if (p === "/plugins/memory/api/delete" && req.method === "POST") {
          const raw = await readBody(req);
          let body: { items?: Array<{ agentId?: string; id?: string }> };
          try {
            body = JSON.parse(raw || "{}") as typeof body;
          } catch {
            sendJson(res, 400, { error: "Invalid JSON" });
            return true;
          }
          const items = Array.isArray(body.items) ? body.items : [];
          const normalized: { agentId: string; id: string }[] = [];
          for (const it of items) {
            if (it?.agentId && it?.id) {
              normalized.push({ agentId: String(it.agentId), id: String(it.id) });
            }
          }
          if (normalized.length === 0) {
            sendJson(res, 400, { error: "items required" });
            return true;
          }
          const n = await db.deleteMany(normalized);
          sendJson(res, 200, { deleted: n });
          return true;
        }

        // Manual insert: embed once + db.store only. Skips storeOneCaptureItem, vector dedup, and conflict LLM.
        if (p === "/plugins/memory/api/add" && req.method === "POST") {
          const enc = opts?.encodeForStorage;
          if (!enc) {
            sendJson(res, 503, { error: "Embedding not configured; plugin needs embedding in config." });
            return true;
          }
          const raw = await readBody(req);
          let body: { agentId?: string; text?: string; category?: string };
          try {
            body = JSON.parse(raw || "{}") as typeof body;
          } catch {
            sendJson(res, 400, { error: "Invalid JSON" });
            return true;
          }
          const agentId = (body.agentId ?? "").trim();
          const textRaw = body.text == null ? "" : String(body.text);
          const category = (body.category ?? "").trim() as MemoryCategory;
          if (!agentId) {
            sendJson(res, 400, { error: "agentId required" });
            return true;
          }
          const text = textRaw.trim();
          if (!text.length) {
            sendJson(res, 400, { error: "text required" });
            return true;
          }
          const allowed = new Set(writableCategoriesForPanel(cfg));
          if (!allowed.has(category)) {
            sendJson(res, 400, { error: "invalid or disabled category" });
            return true;
          }
          const textForEmbed = text.length > MANUAL_ADD_MAX_CHARS ? text.slice(0, MANUAL_ADD_MAX_CHARS) : text;
          let vectors: number[][];
          try {
            const out = await enc(textForEmbed);
            vectors = out.vectors;
          } catch (e) {
            sendJson(res, 502, { error: `embed failed: ${String(e)}` });
            return true;
          }
          if (vectors.length === 0) {
            sendJson(res, 400, { error: "nothing to embed (empty after chunking)" });
            return true;
          }
          const stored = await db.storeMany(
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
          sendJson(res, 200, {
            id: stored[0]!.id,
            createdAt: stored[0]!.createdAt,
            chunkRows: stored.length,
          });
          return true;
        }

        sendJson(res, 404, { error: "Not found" });
        return true;
      } catch (err) {
        logger.warn(`openclaw-memory-alibaba-local memory panel: ${String(err)}`);
        sendJson(res, 500, { error: "Internal error" });
        return true;
      }
    },
  });

  logger.info("[openclaw-memory-alibaba-local] Memory admin UI at /plugins/memory/");
}

function parseOptionalTimeMs(iso: string | null): number | undefined {
  if (!iso) {
    return undefined;
  }
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return undefined;
  }
  return t;
}
