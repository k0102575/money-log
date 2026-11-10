import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
export function testDb() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(
    readFileSync(
      new URL("../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  const prepare = (text: string) => {
    let args: unknown[] = [];
    const query = {
      bind(...values: unknown[]) {
        args = values;
        return query;
      },
      async first<T>() {
        return (sql.prepare(text).get(...(args as never[])) ??
          null) as T | null;
      },
      async all<T>() {
        return { results: sql.prepare(text).all(...(args as never[])) as T[] };
      },
      async run() {
        const result = sql.prepare(text).run(...(args as never[]));
        return { success: true, meta: { changes: Number(result.changes) } };
      },
      execute() {
        const statement = sql.prepare(text);
        return {
          results: statement.columns().length
            ? statement.all(...(args as never[]))
            : (statement.run(...(args as never[])), []),
        };
      },
    };
    return query;
  };
  const db = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sql.exec("BEGIN");
      try {
        const results = statements.map((s) => s.execute());
        sql.exec("COMMIT");
        return results;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { db: db as unknown as D1Database, sql, close: () => sql.close() };
}
