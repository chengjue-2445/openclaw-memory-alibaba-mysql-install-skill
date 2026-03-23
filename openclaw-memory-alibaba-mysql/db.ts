import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import type { Connection } from "mysql2/promise";
import type { MemoryCategory } from "./config.js";
import { USER_MEMORY_FACT } from "./categories.js";
import type { MysqlConnectionConfig } from "./config.js";

export type MemoryEntry = {
  id: string;
  agentId: string;
  text: string;
  importance: number;
  category: MemoryCategory;
  createdAt: number;
  /** 0 = active, 1 = soft-deleted. Omitted when reading from old rows without column. */
  isDeleted?: number;
};

export type MemorySearchResult = {
  entry: MemoryEntry;
  score: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strip 4-byte UTF-8 (e.g. emojis) so text is safe for MySQL utf8 charset. Use as-is when table is utf8mb4. */
function stripFourByteUtf8(text: string): string {
  return text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "");
}

export class MemoryDB {
  private vectorIndexCreated = false;

  constructor(
    private readonly mysqlConfig: MysqlConnectionConfig,
    private readonly tableName: string,
    private readonly vectorDim: number,
  ) {}

  /** Short-lived connection: create, ensure table, run fn, close. */
  private async withConnection<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
    const conn = await mysql.createConnection({
      host: this.mysqlConfig.host,
      port: this.mysqlConfig.port,
      user: this.mysqlConfig.user,
      password: this.mysqlConfig.password,
      database: this.mysqlConfig.database,
      ssl: this.mysqlConfig.ssl ? {} : undefined,
    });
    try {
      await conn.query("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await this.ensureTable(conn);
      return await fn(conn);
    } finally {
      await conn.end();
    }
  }

  private async ensureTable(conn: Connection): Promise<void> {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`${this.tableName}\` (
        id         VARCHAR(36)   NOT NULL PRIMARY KEY,
        agent_id   VARCHAR(128)  NOT NULL,
        user_id    VARCHAR(128)  NULL DEFAULT NULL,
        session_id VARCHAR(128)  NULL DEFAULT NULL,
        text       LONGTEXT      NOT NULL,
        embedding  VECTOR(${this.vectorDim}) NOT NULL,
        importance FLOAT         DEFAULT 0,
        category   VARCHAR(64)   DEFAULT '${USER_MEMORY_FACT}',
        created_at BIGINT        NOT NULL,
        is_deleted TINYINT       NOT NULL DEFAULT 0,
        INDEX idx_agent_id (agent_id),
        INDEX idx_agent_session_category (agent_id, session_id, category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await this.ensureIsDeletedColumn(conn);
    await this.ensureSessionCategoryIndex(conn);
    await this.tryCreateVectorIndex(conn);
  }

  private async ensureIsDeletedColumn(conn: Connection): Promise<void> {
    const [rows] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'is_deleted'`,
      [this.tableName],
    );
    if ((rows as Array<unknown>).length > 0) return;
    await conn.query(
      `ALTER TABLE \`${this.tableName}\` ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0`,
    );
  }

  private async ensureSessionCategoryIndex(conn: Connection): Promise<void> {
    const [rows] = await conn.query(
      `SELECT COUNT(1) AS cnt FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = 'idx_agent_session_category'`,
      [this.tableName],
    );
    if (((rows as Array<{ cnt: number }>)[0]?.cnt ?? 0) > 0) return;
    await conn.query(
      `ALTER TABLE \`${this.tableName}\` ADD INDEX idx_agent_session_category (agent_id, session_id, category)`,
    );
  }

  private async tryCreateVectorIndex(conn: Connection): Promise<void> {
    if (this.vectorIndexCreated) {
      return;
    }
    try {
      const [rows] = await conn.query(
        `SELECT COUNT(1) AS cnt FROM information_schema.statistics
         WHERE table_schema = DATABASE()
           AND table_name = ?
           AND index_name = 'idx_embedding'`,
        [this.tableName],
      );
      const cnt = (rows as Array<{ cnt: number }>)[0]?.cnt ?? 0;
      if (cnt > 0) {
        this.vectorIndexCreated = true;
        return;
      }
      await conn.query(
        `ALTER TABLE \`${this.tableName}\` ADD VECTOR INDEX idx_embedding (embedding) DISTANCE=COSINE`,
      );
      this.vectorIndexCreated = true;
    } catch {
      // HNSW index creation may fail on empty tables; will retry after first insert.
    }
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
    return this.withConnection(async (conn) => {
      const id = randomUUID();
      const createdAt = Date.now();
      const vectorStr = JSON.stringify(entry.vector);
      const userId = entry.userId ?? null;
      const sessionId = entry.sessionId ?? null;
      const textSafe = stripFourByteUtf8(entry.text);

      await conn.query(
        `INSERT INTO \`${this.tableName}\` (id, agent_id, user_id, session_id, text, embedding, importance, category, created_at, is_deleted)
         VALUES (?, ?, ?, ?, ?, VEC_FROMTEXT(?), ?, ?, ?, 0)`,
        [id, agentId, userId, sessionId, textSafe, vectorStr, entry.importance, entry.category, createdAt],
      );

      if (!this.vectorIndexCreated) {
        await this.tryCreateVectorIndex(conn);
      }

      return {
        id,
        agentId,
        text: textSafe,
        importance: entry.importance,
        category: entry.category,
        createdAt,
      };
    });
  }

  /**
   * Upsert for full-context by (agent_id, session_id, category): one row per session per category.
   * If a row exists, UPDATE it; otherwise INSERT. Returns action and entry.
   */
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
    return this.withConnection(async (conn) => {
      const textSafe = stripFourByteUtf8(entry.text);
      const vectorStr = JSON.stringify(entry.vector);
      const userId = entry.userId ?? null;
      const createdAt = Date.now();

      const [existingRows] = await conn.query(
        `SELECT id FROM \`${this.tableName}\`
         WHERE agent_id = ? AND category = ? AND is_deleted = 0
           AND ((? IS NULL AND session_id IS NULL) OR (session_id = ?))
         LIMIT 1`,
        [agentId, entry.category, sessionId, sessionId],
      );
      const existing = (existingRows as Array<{ id: string }>)[0];

      if (existing) {
        await conn.query(
          `UPDATE \`${this.tableName}\` SET text = ?, embedding = VEC_FROMTEXT(?), importance = ?, created_at = ?, user_id = ?
           WHERE id = ? AND agent_id = ?`,
          [textSafe, vectorStr, entry.importance, createdAt, userId, existing.id, agentId],
        );
        return {
          action: "updated",
          entry: {
            id: existing.id,
            agentId,
            text: textSafe,
            importance: entry.importance,
            category: entry.category,
            createdAt,
          },
        };
      }

      const id = randomUUID();
      await conn.query(
        `INSERT INTO \`${this.tableName}\` (id, agent_id, user_id, session_id, text, embedding, importance, category, created_at, is_deleted)
         VALUES (?, ?, ?, ?, ?, VEC_FROMTEXT(?), ?, ?, ?, 0)`,
        [id, agentId, userId, sessionId, textSafe, vectorStr, entry.importance, entry.category, createdAt],
      );

      if (!this.vectorIndexCreated) {
        await this.tryCreateVectorIndex(conn);
      }

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
    });
  }

  /**
   * Search memories by vector similarity.
   * @param categories - When non-empty, only return rows with category IN (categories). Omit for no category filter.
   */
  async search(
    agentId: string,
    vector: number[],
    limit = 5,
    minScore = 0.5,
    categories?: MemoryCategory[],
  ): Promise<MemorySearchResult[]> {
    return this.withConnection(async (conn) => {
      const vectorStr = JSON.stringify(vector);
      const hasCategoryFilter = Array.isArray(categories) && categories.length > 0;
      const placeholders = hasCategoryFilter ? categories!.map(() => "?").join(", ") : "";
      const whereClause = hasCategoryFilter
        ? `WHERE  agent_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND category IN (${placeholders})`
        : `WHERE  agent_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`;
      const args: unknown[] = hasCategoryFilter
        ? [vectorStr, agentId, ...categories!, limit]
        : [vectorStr, agentId, limit];

      const [rows] = await conn.query(
        `SELECT id, text, importance, category, created_at, is_deleted,
                VEC_DISTANCE_COSINE(embedding, VEC_FROMTEXT(?)) AS distance
         FROM   \`${this.tableName}\`
         ${whereClause}
         ORDER  BY distance ASC
         LIMIT  ?`,
        args,
      );

      const results: MemorySearchResult[] = [];
      for (const row of rows as Array<Record<string, unknown>>) {
        const distance = Number(row.distance) || 0;
        const score = 1 - distance;
        if (score < minScore) {
          continue;
        }
        const isDeleted = row.is_deleted;
        results.push({
          entry: {
            id: row.id as string,
            agentId,
            text: row.text as string,
            importance: Number(row.importance) || 0,
            category: (row.category as MemoryCategory) || USER_MEMORY_FACT,
            createdAt: Number(row.created_at) || 0,
            isDeleted: isDeleted !== undefined && isDeleted !== null ? Number(isDeleted) : undefined,
          },
          score,
        });
      }
      return results;
    });
  }

  /** Soft-delete: set is_deleted = 1. Returns true if a row was updated. */
  async softDelete(agentId: string, id: string): Promise<boolean> {
    if (!UUID_RE.test(id)) {
      throw new Error(`Invalid memory ID format: ${id}`);
    }
    return this.withConnection(async (conn) => {
      const [result] = await conn.query(
        `UPDATE \`${this.tableName}\` SET is_deleted = 1 WHERE id = ? AND agent_id = ?`,
        [id, agentId],
      );
      return ((result as mysql.ResultSetHeader).affectedRows ?? 0) > 0;
    });
  }

  async delete(agentId: string, id: string): Promise<boolean> {
    if (!UUID_RE.test(id)) {
      throw new Error(`Invalid memory ID format: ${id}`);
    }
    return this.withConnection(async (conn) => {
      const [result] = await conn.query(
        `DELETE FROM \`${this.tableName}\` WHERE id = ? AND agent_id = ?`,
        [id, agentId],
      );
      return ((result as mysql.ResultSetHeader).affectedRows ?? 0) > 0;
    });
  }

  async close(): Promise<void> {
    this.vectorIndexCreated = false;
  }
}
