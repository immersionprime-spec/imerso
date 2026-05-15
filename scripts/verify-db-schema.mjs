/**
 * Compara schema public + migrations aplicadas com o esperado pelo repo.
 * Lê DATABASE_URL de .env.local (não imprime a URL).
 * Usa node-postgres com preferSimpleProtocol no pooler 6543 (evita prepared statements do PgBouncer).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_TABLES = [
  'corretores',
  'imobiliarias',
  'leads',
  'system_config',
  'tour_hotspots',
  'tour_views',
  'tour_waypoints',
  'tour_whatsapp_clicks',
  'tours',
  'upload_sessions',
  'user_roles',
];

const EXPECTED_TOUR_EXTRA_COLS = [
  'camera_start_position',
  'camera_start_target',
  'camera_up_inverted',
  'finalized_at',
  'splat_r2_key_lite',
  'splat_rotation_deg',
  'splat_size_bytes_lite',
];

const LOCAL_MIGRATION_FILES = fs
  .readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();

function loadDatabaseUrl() {
  const p = path.join(root, '.env.local');
  if (!fs.existsSync(p)) throw new Error('.env.local não encontrado');
  const text = fs.readFileSync(p, 'utf8');
  const m = text.match(/^\s*DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('DATABASE_URL não encontrado em .env.local');
  let v = m[1].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return v;
}

function migrationPrefix(version) {
  const m = String(version).match(/^(\d+)/);
  return m ? m[1] : String(version);
}

function pgClientOptions(connectionString) {
  const useSimple = connectionString.includes(':6543');
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  return {
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    ...(useSimple ? { preferSimpleProtocol: true } : {}),
  };
}

const tourColsInList = EXPECTED_TOUR_EXTRA_COLS.map((c) => `'${c}'`).join(',');

const snapshotSql = `
SELECT
  (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public') AS public_table_count,
  (SELECT string_agg(tablename, '|' ORDER BY tablename)
   FROM pg_tables WHERE schemaname = 'public') AS tables_csv,
  (SELECT string_agg(column_name, '|' ORDER BY column_name)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'tours'
   AND column_name IN (${tourColsInList})) AS tour_cols_csv,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
  ) AS has_migrations_schema;
`;

async function main() {
  const dbUrl = loadDatabaseUrl();
  const client = new Client(pgClientOptions(dbUrl));
  await client.connect();

  try {
    const { rows } = await client.query(snapshotSql);
    const row = rows[0];
    if (!row) {
      console.error('Resposta vazia do banco.');
      process.exit(1);
    }

    const publicTableCount = Number(row.public_table_count ?? 0);
    const dbTables = (row.tables_csv ?? '').split('|').filter(Boolean);
    const tourCols = (row.tour_cols_csv ?? '').split('|').filter(Boolean);
    const hasMigrationsSchema = Boolean(row.has_migrations_schema);

    let appliedVersions = [];
    if (hasMigrationsSchema) {
      const { rows: vrows } = await client.query(
        `SELECT string_agg(version::text, '|' ORDER BY version) AS versions_csv
         FROM supabase_migrations.schema_migrations;`
      );
      const row2 = vrows[0];
      appliedVersions = (row2?.versions_csv ?? '')
        .split('|')
        .filter(Boolean)
        .map((v) => migrationPrefix(v));
    }

    const missingTables = EXPECTED_TABLES.filter((t) => !dbTables.includes(t));
    const extraTables = dbTables.filter((t) => !EXPECTED_TABLES.includes(t));
    const missingTourCols = EXPECTED_TOUR_EXTRA_COLS.filter((c) => !tourCols.includes(c));

    const localVersionIds = LOCAL_MIGRATION_FILES.map((f) => {
      const m = f.match(/^(\d+)/);
      return m ? m[1] : f.replace(/\.sql$/, '');
    }).sort();
    const missingApplied = localVersionIds.filter((v) => !appliedVersions.includes(v));
    const extraApplied = appliedVersions.filter((v) => !localVersionIds.includes(v));

    console.log('--- Tabelas public (esperadas do initial_schema) ---');
    console.log(`Contagem em pg_tables (public): ${publicTableCount}`);
    if (publicTableCount === 0) {
      console.log(
        'Não há tabelas em public. Confirme no Dashboard → Table editor se a DATABASE_URL é deste projeto; para CLI prefira URI modo sessão (porta 5432) ou direct connection.'
      );
    }
    console.log(
      missingTables.length ? `Faltando: ${missingTables.join(', ')}` : 'Todas as tabelas esperadas existem.'
    );
    if (extraTables.length) console.log(`Tabelas extra no DB (não no blueprint): ${extraTables.join(', ')}`);

    console.log('\n--- Colunas extras em tours (migrations incrementais) ---');
    console.log(
      missingTourCols.length
        ? `Faltando: ${missingTourCols.join(', ')}`
        : 'camera_up, lite, rotation_deg, camera_start OK.'
    );
    if (missingTourCols.includes('splat_size_bytes_lite') && !missingTourCols.includes('splat_r2_key_lite')) {
      console.log(
        '\nCorreção rápida (SQL Editor): ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS splat_size_bytes_lite bigint;\nOu volte a executar supabase/migrations/20250511000001_tours_splat_lite.sql'
      );
    }

    console.log('\n--- Histórico supabase_migrations.schema_migrations ---');
    if (!hasMigrationsSchema) {
      console.log(
        'Tabela schema_migrations ausente (comum se o schema veio só do SQL Editor, sem `supabase db push`).'
      );
      console.log('Arquivos locais em supabase/migrations/ (aplicar na ordem no SQL Editor se necessário):');
      LOCAL_MIGRATION_FILES.forEach((f) => console.log('  -', f));
    } else if (!appliedVersions.length) {
      console.log('Tabela existe mas está vazia.');
      console.log('IDs locais esperados:', localVersionIds.join(', '));
    } else {
      console.log('Aplicadas no DB:', appliedVersions.join(', '));
      console.log('IDs locais:', localVersionIds.join(', '));
      if (missingApplied.length)
        console.log('Migrations locais SEM registro no schema_migrations:', missingApplied.join(', '));
      if (extraApplied.length)
        console.log('Versões no schema_migrations sem ficheiro local:', extraApplied.join(', '));
    }

    if (dbUrl.includes(':6543')) {
      console.log(
        '\n--- Nota: porta 6543 = pooler transacional. DDL e alguns clientes preferem sessão (5432) ou connection string “direct”.'
      );
    }

    const exitCode = missingTables.length || missingTourCols.length ? 1 : 0;
    process.exit(exitCode);
  } catch (e) {
    console.error('Erro ao consultar Postgres:', e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

await main();
