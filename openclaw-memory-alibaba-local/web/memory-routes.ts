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
  FULL_CONTEXT_SOURCE_CATEGORIES,
  SELF_IMPROVING_CATEGORIES,
  USER_MEMORY_CATEGORIES,
} from "../categories.js";
import type { MemoryDB } from "../db.js";
import type { AdminListFilters } from "../db.js";
import { getMemoryPanelHtml } from "./memory-ui.js";

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
    "Cache-Control": "no-cache",
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

        if (token) {
          const queryToken = (url.searchParams.get("token") ?? "").trim();
          const authHeader = (req.headers.authorization ?? req.headers.Authorization ?? "") as string;
          const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
          if (queryToken !== token && bearer !== token) {
            sendJson(res, 401, { error: { message: "Unauthorized", type: "unauthorized" } });
            return true;
          }
        }

        if (!p.startsWith("/plugins/memory/api/")) {
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
          sendJson(res, 200, {
            enableFullContextMemory: cfg.enableFullContextMemory,
            enableSelfImprovingMemory: cfg.enableSelfImprovingMemory,
          });
          return true;
        }

        if (p === "/plugins/memory/api/facets" && req.method === "GET") {
          const tab = url.searchParams.get("tab") || "user";
          const cats = tabToCategories(tab, cfg);
          const includeDeleted = url.searchParams.get("includeDeleted") === "1";
          const timeFromMs = parseOptionalTimeMs(url.searchParams.get("timeFrom"));
          const timeToMs = parseOptionalTimeMs(url.searchParams.get("timeTo"));
          if (cats.length === 0) {
            sendJson(res, 200, { agents: [], sessions: [] });
            return true;
          }
          const facets = await db.listAdminFacets(cats, timeFromMs, timeToMs, includeDeleted);
          sendJson(res, 200, facets);
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
          const includeDeleted = url.searchParams.get("includeDeleted") === "1";
          const timeFromMs = parseOptionalTimeMs(url.searchParams.get("timeFrom"));
          const timeToMs = parseOptionalTimeMs(url.searchParams.get("timeTo"));
          const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
          const pageSize = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10) || 100));

          const filters: AdminListFilters = {
            categories: cats,
            includeDeleted,
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
            const { total, items } = await db.listAdminFiltered(filters, page, pageSize);
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

        if (p === "/plugins/memory/api/soft-delete" && req.method === "POST") {
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
          const n = await db.softDeleteMany(normalized);
          sendJson(res, 200, { updated: n });
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
