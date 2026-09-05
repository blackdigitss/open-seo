// The fork's copy of upstream's schema-parity guard, scoped to our tables so we
// never have to register them in upstream's test (a hot file). Same idea: the
// provider-aware `db` types Postgres as the SQLite schema via a cast, so the
// two dialects must stay structurally interchangeable.
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import { getTableConfig as getSqliteTableConfig } from "drizzle-orm/sqlite-core";
import { getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";
import { sort } from "remeda";
import { describe, expect, it } from "vitest";
import * as sqliteCustom from "./schema";
import * as pgCustom from "./pg.schema";

type Dialect = "sqlite" | "pg";

const sortStrings = (values: string[]) =>
  sort(values, (a, b) => a.localeCompare(b));

function tablesFrom(mod: Record<string, unknown>) {
  const out = new Map<string, Table>();
  for (const value of Object.values(mod)) {
    if (is(value, Table)) out.set(getTableName(value), value);
  }
  return out;
}

const getConfig = (table: Table, dialect: Dialect) =>
  dialect === "pg" ? getPgTableConfig(table) : getSqliteTableConfig(table);

function columnsOf(table: Table) {
  const columns = Object.values(getTableColumns(table)).map((col) => ({
    name: col.name,
    notNull: col.notNull,
    dataType: typeof col.dataType === "string" ? col.dataType : "unknown",
    hasDefault: col.hasDefault,
    enumValues: Array.isArray(col.enumValues)
      ? sortStrings(
          col.enumValues.filter((v): v is string => typeof v === "string"),
        )
      : null,
  }));
  return sort(columns, (a, b) => a.name.localeCompare(b.name));
}

function columnName(candidate: unknown): string | null {
  return candidate &&
    typeof candidate === "object" &&
    "name" in candidate &&
    typeof candidate.name === "string"
    ? candidate.name
    : null;
}

function uniqueColumnTuples(table: Table, dialect: Dialect) {
  const config = getConfig(table, dialect);
  const tuples = new Set<string>();
  for (const index of config.indexes) {
    if (!index.config.unique) continue;
    const cols = index.config.columns
      .map(columnName)
      .filter((name): name is string => name !== null);
    tuples.add(sortStrings(cols).join(","));
  }
  for (const constraint of config.uniqueConstraints) {
    tuples.add(sortStrings(constraint.columns.map((c) => c.name)).join(","));
  }
  for (const col of Object.values(getTableColumns(table))) {
    if (col.isUnique) tuples.add(col.name);
  }
  return sortStrings([...tuples]);
}

function primaryKeyColumns(table: Table, dialect: Dialect) {
  const config = getConfig(table, dialect);
  const pk = new Set<string>();
  for (const col of Object.values(getTableColumns(table))) {
    if (col.primary) pk.add(col.name);
  }
  for (const composite of config.primaryKeys) {
    for (const col of composite.columns) pk.add(col.name);
  }
  return sortStrings([...pk]);
}

function foreignKeys(table: Table, dialect: Dialect) {
  const config = getConfig(table, dialect);
  return sortStrings(
    config.foreignKeys.map((fk) => {
      const ref = fk.reference();
      const cols = sortStrings(ref.columns.map((c) => c.name)).join(",");
      const refTable = getTableName(ref.foreignTable);
      const refCols = sortStrings(ref.foreignColumns.map((c) => c.name)).join(
        ",",
      );
      return `${cols}->${refTable}.${refCols} onDelete=${fk.onDelete ?? "none"}`;
    }),
  );
}

const sqliteTables = tablesFrom(sqliteCustom);
const pgTables = tablesFrom(pgCustom);

describe("custom schema parity", () => {
  it("defines the same tables on both backends", () => {
    expect(sortStrings([...pgTables.keys()])).toEqual(
      sortStrings([...sqliteTables.keys()]),
    );
  });

  it("every table is named custom_*", () => {
    for (const name of sqliteTables.keys()) {
      expect(name.startsWith("custom_")).toBe(true);
    }
  });

  for (const [name, sqliteTable] of sqliteTables) {
    const pgTable = pgTables.get(name);
    if (!pgTable) continue;
    describe(name, () => {
      it("columns", () => {
        expect(columnsOf(pgTable)).toEqual(columnsOf(sqliteTable));
      });
      it("primary key", () => {
        expect(primaryKeyColumns(pgTable, "pg")).toEqual(
          primaryKeyColumns(sqliteTable, "sqlite"),
        );
      });
      it("unique constraints", () => {
        expect(uniqueColumnTuples(pgTable, "pg")).toEqual(
          uniqueColumnTuples(sqliteTable, "sqlite"),
        );
      });
      it("foreign keys", () => {
        expect(foreignKeys(pgTable, "pg")).toEqual(
          foreignKeys(sqliteTable, "sqlite"),
        );
      });
    });
  }
});
