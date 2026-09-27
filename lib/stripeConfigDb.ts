import { neon } from "@neondatabase/serverless";

function connectionString() {
  const value =
    process.env.STORAGE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;
  if (!value) throw new Error("Billing configuration database is not configured.");
  return value;
}

async function sql() {
  const client = neon(connectionString());
  await client`
    CREATE TABLE IF NOT EXISTS billing_config (
      config_key TEXT PRIMARY KEY,
      config_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  return client;
}

export async function getBillingConfig(key: string) {
  const client = await sql();
  const rows = await client`
    SELECT config_value
    FROM billing_config
    WHERE config_key = ${key}
    LIMIT 1
  `;
  return rows[0]?.config_value ? String(rows[0].config_value) : "";
}

export async function setBillingConfig(key: string, value: string) {
  const client = await sql();
  await client`
    INSERT INTO billing_config (config_key, config_value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_at = NOW()
  `;
}
