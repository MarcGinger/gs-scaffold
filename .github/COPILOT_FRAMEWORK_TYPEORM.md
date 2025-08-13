# COPILOT_INSTRUCTIONS.md — TypeORM + Projections (NestJS + ESDB)

> Purpose: In our event-sourced architecture, EventStoreDB (ESDB) is the source of truth. TypeORM is used for **read models (projections)**, **operational stores** (outbox, checkpoints, config), and **analytics helpers** (materialized views). These instructions tell GitHub Copilot exactly how to scaffold and maintain production‑grade TypeORM code that fits our patterns.

---

## 1) Core principles

- **ESDB is authoritative; SQL is derivative.** Never persist domain state with TypeORM that isn’t rebuildable from ESDB.
- **One DB/schema per service.** Use a dedicated schema (e.g., `banking_read`, `core_slack`). No shared schema across services.
- **No lazy loading, minimal magic.** Prefer QueryBuilder or raw SQL for clarity and performance; select only required columns.
- **Idempotent projectors.** All writes are UPSERTs (or equivalent merge) and wrapped in a checkpoint transaction.
- **Zero-downtime migrations.** Use expand/contract rollout, transactional DDL where possible, and chunked backfills.
- **Rebuildability is sacred.** Projections can be dropped and rebuilt from ESDB; keep migrations additive and safe.

---

## 2) Where TypeORM fits in our stack

- **Write model:** ESDB aggregates + events (source of truth)
- **Read model:** Postgres via TypeORM (projections)
- **Cache:** Redis snapshots for hot reads (rebuildable from ESDB/SQL)
- **Async:** BullMQ for backfills, heavy refresh, materialized view refresh
- **AuthZ:** OPA at app boundary; projections are service-internal

---

## 3) Project setup (NestJS 11 + TypeORM 0.3+)

### 3.1 Data source configuration

```ts
// src/infrastructure/database/app.datasource.ts
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.POSTGRES_URL, // managed via Doppler/Vault
  schema: process.env.DB_SCHEMA ?? 'banking_read',
  synchronize: false, // NEVER true in prod
  logging: ['warn', 'error'], // enable 'query' only temporarily
  maxQueryExecutionTime: 500, // ms for slow-query warning
  entities: [__dirname + '/../entities/*.entity.{ts,js}'],
  migrations: [__dirname + '/../migrations/*.{ts,js}'],
  extra: {
    statement_timeout: 15000,
    application_name: process.env.APP_NAME ?? 'banking-read',
  },
});
```

```ts
// src/infrastructure/database/typeorm.module.ts
import { Module } from '@nestjs/common';
import { AppDataSource } from './app.datasource';

@Module({
  providers: [
    {
      provide: 'DATA_SOURCE',
      useFactory: async () => {
        if (!AppDataSource.isInitialized) await AppDataSource.initialize();
        return AppDataSource;
      },
    },
  ],
  exports: ['DATA_SOURCE'],
})
export class TypeOrmDatabaseModule {}
```

**Pool hints:** keep total `max` across pods within DB capacity (typ. 10–20 per pod). Use server‑side timeouts and keep‑alives.

### 3.2 Health & observability

- Provide a `/health/db` check that runs `SELECT 1`.
- Log slow queries (`maxQueryExecutionTime`) and pool stats periodically.
- Emit metrics: active connections, queue length, migration version.

---

## 4) Entity and schema conventions

- **Naming:** snake_case table and column names; explicit lengths; avoid `eager` relations.
- **Audit columns:** `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ`, update `updated_at` in every UPSERT.
- **Tenanting:** include `tenant_id` where applicable; enforce with composite **unique** constraints (e.g., `(tenant_id, number)`).
- **Indexes:** match top read paths. Prefer composite indexes and partial indexes (e.g., `WHERE status = 'active'`).

Example:

```ts
// src/infrastructure/entities/transaction.entity.ts
import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity({ name: 'transaction' })
@Index('idx_txn_tenant_date', ['tenantId', 'occurredAt'])
export class TransactionEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' }) id: string;
  @Column({ name: 'tenant_id', type: 'varchar', length: 60 }) tenantId: string;
  @Column({ name: 'account_id', type: 'uuid' }) accountId: string;
  @Column({ name: 'amount_minor', type: 'bigint' }) amountMinor: string;
  @Column({ name: 'currency', type: 'char', length: 3 }) currency: string;
  @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt: Date;
  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt?: Date;
}
```

---

## 5) Migration strategy (safe, zero‑downtime)

**Rules**

1. `synchronize: false` in all environments except isolated local dev.
2. Prefer **handwritten** migrations (review auto‑generated output).
3. **Expand → backfill → switch → contract**:

   - Expand: add nullable column/table or defaulted column, ship code that reads old+new.
   - Backfill: populate in chunks via job or SQL.
   - Switch: cut traffic to the new path.
   - Contract: drop old column/table in a later release.

4. **Transactional DDL** where supported (Postgres: most DDL is transactional). For `CREATE INDEX CONCURRENTLY`, run outside transaction.
5. Keep migrations **fast**; move heavy backfills to BullMQ workers.

**Templates**

```ts
// src/infrastructure/migrations/1710000000000_add_indexes.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexes1710000000000 implements MigrationInterface {
  name = 'AddIndexes1710000000000';
  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_txn_tenant_date ON transaction (tenant_id, occurred_at DESC)`,
    );
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_txn_tenant_date`);
  }
}
```

```ts
// src/infrastructure/migrations/1710000000100_create_projection_meta.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProjectionMeta1710000000100 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS projection_checkpoint (
        subscription_id varchar(120) PRIMARY KEY,
        position        varchar(120) NOT NULL,
        updated_at      timestamptz  NOT NULL DEFAULT now()
      );
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS processed_event (
        subscription_id varchar(120) NOT NULL,
        event_id        varchar(120) NOT NULL,
        processed_at    timestamptz  NOT NULL DEFAULT now(),
        PRIMARY KEY (subscription_id, event_id)
      );
    `);
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS processed_event`);
    await q.query(`DROP TABLE IF EXISTS projection_checkpoint`);
  }
}
```

**Migration runner**

```ts
// src/infrastructure/migrations/run.ts
import 'reflect-metadata';
import { AppDataSource } from '../database/app.datasource';

(async () => {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  await AppDataSource.runMigrations();
  await AppDataSource.destroy();
})();
```

**package.json**

```json
{
  "scripts": {
    "typeorm:ts": "ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli",
    "migration:create": "npm run typeorm:ts -- migration:create src/infrastructure/migrations/manual",
    "migration:generate": "npm run typeorm:ts -- migration:generate src/infrastructure/migrations/auto",
    "migration:run": "ts-node -r tsconfig-paths/register src/infrastructure/migrations/run.ts"
  }
}
```

**Kubernetes hint:** run `migration:run` in a pre-deploy Job (or Helm hook) using a **migrations DB user**. App pods use a separate **runtime user** with limited privileges.

---

## 6) Projection writer pattern (checkpointed, idempotent)

```ts
// src/read-model/projections/projection-writer.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

export interface DomainEvent {
  type: string;
  id: string;
  data: any;
}

@Injectable()
export class ProjectionWriter {
  constructor(@Inject('DATA_SOURCE') private readonly ds: DataSource) {}

  async applyBatch(
    events: DomainEvent[],
    subscriptionId: string,
    commitPos: string,
  ) {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      for (const e of events) {
        // Optional coarse de-dupe
        await qr.query(
          `
          INSERT INTO processed_event(subscription_id, event_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
          [subscriptionId, e.id],
        );

        // If row already existed, skip work (optional)
        // await this.ensureNotProcessed(qr, subscriptionId, e.id);

        await this.applyOne(qr, e);
      }

      await qr.query(
        `
        INSERT INTO projection_checkpoint(subscription_id, position)
        VALUES ($1, $2)
        ON CONFLICT (subscription_id)
        DO UPDATE SET position = EXCLUDED.position, updated_at = now()
      `,
        [subscriptionId, commitPos],
      );

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async applyOne(qr: QueryRunner, e: DomainEvent) {
    switch (e.type) {
      case 'account.created.v1':
        return qr.query(
          `
          INSERT INTO account(id, tenant_id, number, holder_name, balance_minor, created_at, updated_at)
          VALUES ($1, $2, $3, $4, 0, now(), now())
          ON CONFLICT (id) DO NOTHING
        `,
          [e.data.id, e.data.tenantId, e.data.number, e.data.holderName],
        );

      case 'transaction.posted.v1':
        // Upsert transaction and update balance atomically
        return qr.query(
          `
          INSERT INTO transaction(id, tenant_id, account_id, amount_minor, currency, occurred_at, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, now(), now())
          ON CONFLICT (id) DO NOTHING;

          UPDATE account
          SET balance_minor = balance_minor + $4, updated_at = now()
          WHERE id = $3 AND tenant_id = $2;
        `,
          [
            e.data.id,
            e.data.tenantId,
            e.data.accountId,
            e.data.amountMinor,
            e.data.currency,
            e.data.occurredAt,
          ],
        );
    }
  }
}
```

**Notes**

- Use **one transaction per batch** to amortize overhead.
- For order-sensitive projections (e.g., running balance), ensure ordered consumption from ESDB and avoid parallel conflicting updates on the same aggregate.

---

## 7) Rebuild & versioning strategies

- **Small stores:** `TRUNCATE` tables, reset checkpoint, replay from ESDB.
- **Large stores / zero downtime:** write to a new schema (e.g., `banking_read_v2`).

  1. Create `*_v2` schema and tables.
  2. Start a second subscriber writing to `*_v2` with its own checkpoint.
  3. When caught up, flip the app’s schema setting (or use a DB view switch).
  4. Retire `v1` after a cooling period.

---

## 8) Query patterns & performance

- Prefer **keyset pagination**:

```ts
const qb = ds
  .createQueryBuilder(TransactionEntity, 't')
  .where('t.tenant_id = :tenant', { tenant })
  .andWhere('(t.occurred_at, t.id) < (:cursorDate, :cursorId)', {
    cursorDate,
    cursorId,
  })
  .orderBy('t.occurred_at', 'DESC')
  .addOrderBy('t.id', 'DESC')
  .limit(50);
```

- **Composite indexes** that match `(tenant_id, occurred_at DESC)` and tie‑breaker `id`.
- **Materialized views** for heavy aggregations; refresh via BullMQ after projector commits.

Refresh example:

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY account_daily_balances;
```

---

## 9) Backfills & heavy jobs (BullMQ)

- Move long backfills out of migrations; run chunked jobs that:

  - read source rows in primary key order,
  - compute aggregates,
  - write in batches (100–1000 rows/tx),
  - periodically checkpoint progress in a control table.

---

## 10) Testing strategy

- **E2E tests with Testcontainers** (Postgres): run migrations before tests.
- Projection tests must validate:

  1. **Idempotency**: applying the same event twice is benign.
  2. **Ordering**: balances don’t drift when events arrive in order.
  3. **Rebuild**: truncate + replay produces the same final state.

Skeleton:

```ts
// test/projection.e2e-spec.ts
it('applies transaction.posted idempotently', async () => {
  await writer.applyBatch([evt, evt], 'sub-banking', '42@123');
  const row = await repo.findOneBy({ id: evt.data.accountId });
  expect(row.balanceMinor).toBe(initial + evt.data.amountMinor);
});
```

---

## 11) Security & ops

- Separate DB roles: **migrations** (DDL) vs **runtime** (R/W limited to service schema).
- Enforce TLS, rotate credentials via secret manager.
- Set DB timezone to UTC; store `TIMESTAMPTZ` exclusively.
- Guard invariants with **unique constraints**; let DB do some work.
- Retry on transient errors (e.g., Postgres `40001`), with exponential backoff.

---

## 12) Copilot prompts (how to ask Copilot)

Use these patterns to get compliant code from Copilot:

- _“Generate a NestJS TypeORM data source for Postgres with `synchronize: false`, schema from `DB_SCHEMA`, and entities under `src/infrastructure/entities`.”_
- _“Create a migration that adds `projection_checkpoint` and `processed_event` tables with primary keys and timestamps.”_
- _“Write a ProjectionWriter service that applies a batch of events idempotently using UPSERTs and advances a checkpoint in the same transaction.”_
- _“Produce keyset pagination query for transactions ordered by `(occurred_at DESC, id DESC)` filtered by `tenant_id`.”_
- _“Show a BullMQ job that backfills a materialized view in chunks and records progress.”_

---

## 13) Do / Don’t checklist

**Do**

- Use UPSERTs and transactions around projector batches.
- Add composite indexes that reflect `WHERE` + `ORDER BY`.
- Keep migrations small; offload heavy work to jobs.
- Version large projections (`*_v2`) for zero downtime cutovers.
- Log slow queries and surface pool metrics.

**Don’t**

- Don’t enable `synchronize` in shared envs.
- Don’t rely on lazy relations or N+1 query patterns.
- Don’t mutate projections in ways that can’t be reproduced from ESDB.
- Don’t pack heavy backfills into a single DDL migration.

---

## 14) Appendix: SQL DDL snippets

```sql
-- Example read tables
CREATE TABLE IF NOT EXISTS account (
  id uuid PRIMARY KEY,
  tenant_id varchar(60) NOT NULL,
  number varchar(40) NOT NULL,
  holder_name varchar(120) NOT NULL,
  balance_minor bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_tenant_number ON account(tenant_id, number);

CREATE TABLE IF NOT EXISTS transaction (
  id uuid PRIMARY KEY,
  tenant_id varchar(60) NOT NULL,
  account_id uuid NOT NULL,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_txn_tenant_date ON transaction(tenant_id, occurred_at DESC);

-- Checkpoint and processed event tables (see migration above)
```

---

### Final note

This file defines how Copilot should scaffold and refactor TypeORM code so it stays consistent with our ESDB‑first architecture, supports safe migrations, and delivers fast, reliable projections. When in doubt, choose explicit SQL + clear transactions + rebuildability.
