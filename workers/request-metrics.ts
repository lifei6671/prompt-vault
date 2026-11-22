export function createRequestMetrics() {
  return {
    d1Queries: 0,
    d1RowsRead: 0 as number | null,
    d1Errors: 0,
    exploreOptionsCacheHits: 0,
    exploreOptionsCacheMisses: 0,
    exploreOptionsCacheReadErrors: 0,
    exploreOptionsCacheWriteErrors: 0,
  };
}
export type RequestMetrics = ReturnType<typeof createRequestMetrics>;

const requestMetrics = new WeakMap<object, RequestMetrics>();

export function recordExploreOptionsCache(db: D1Database, event: "hit" | "miss" | "readError" | "writeError") {
  const metrics = requestMetrics.get(db);
  if (!metrics) return;
  switch (event) {
    case "hit": metrics.exploreOptionsCacheHits++; break;
    case "miss": metrics.exploreOptionsCacheMisses++; break;
    case "readError": metrics.exploreOptionsCacheReadErrors++; break;
    case "writeError": metrics.exploreOptionsCacheWriteErrors++; break;
  }
}

export function observeDatabase(database: D1Database) {
  const metrics = createRequestMetrics();
  const pending = new Set<Promise<unknown>>();
  const statements = new WeakMap<D1PreparedStatement, D1PreparedStatement>();

  function execute<T>(count: number, run: () => Promise<T>, metadata: (result: T) => D1Result[] | null) {
    metrics.d1Queries += count;
    const operation = (async () => {
      try {
        const result = await run();
        const results = metadata(result);
        if (results === null) metrics.d1RowsRead = null;
        else for (const item of results) {
          const rows = item.meta?.rows_read;
          if (!Number.isFinite(rows) || rows < 0) metrics.d1RowsRead = null;
          else if (metrics.d1RowsRead !== null) metrics.d1RowsRead += rows;
        }
        return result;
      } catch (error) {
        metrics.d1Errors++;
        metrics.d1RowsRead = null;
        throw error;
      }
    })();
    pending.add(operation);
    void operation.then(() => pending.delete(operation), () => pending.delete(operation));
    return operation;
  }

  function statement(original: D1PreparedStatement): D1PreparedStatement {
    const wrapped = new Proxy(original, {
      get(target, property) {
        if (property === "bind") return (...values: unknown[]) => statement(target.bind(...values));
        if (property === "all" || property === "run")
          return () => execute(1, () => target[property](), (result) => [result]);
        if (property === "first") return async (column?: string) => {
          // all() exposes the metadata hidden by first(), with the same single SQL execution.
          const result = await execute(1, () => target.all<Record<string, unknown>>(), (result) => [result]);
          const row = result.results[0];
          if (!row) return null;
          if (column === undefined) return row;
          if (row[column] === undefined) {
            metrics.d1Errors++;
            throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${column})`, { cause: new Error("Column not found") });
          }
          return row[column];
        };
        // raw() does not expose metadata. Preserve its result and report unknown rows.
        if (property === "raw") return (options?: { columnNames?: false }) =>
          execute(1, () => target.raw(options), () => null);
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    statements.set(wrapped, original);
    return wrapped;
  }

  function wrap<T extends D1Database | D1DatabaseSession>(original: T): T {
    const wrapped = new Proxy(original, {
      get(target, property) {
        if (property === "prepare") return (sql: string) => statement(target.prepare(sql));
        if (property === "batch") return (batch: D1PreparedStatement[]) => execute(batch.length,
          () => target.batch(batch.map((item) => statements.get(item) ?? item)), (results) => results);
        if (property === "withSession" && "withSession" in target)
          return (constraint?: D1SessionBookmark | D1SessionConstraint) => wrap(target.withSession(constraint));
        if (property === "exec" && "exec" in target) return (sql: string) => execute(1, async () => {
          const result = await target.exec(sql);
          metrics.d1Queries += result.count - 1;
          return result;
        }, () => null);
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    requestMetrics.set(wrapped, metrics);
    return wrapped;
  }

  return {
    db: wrap(database), metrics,
    async finish() {
      // A failed Promise.all can leave sibling queries in flight; include their completion.
      while (pending.size) await Promise.allSettled([...pending]);
    },
  };
}
