import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationName = readdirSync(join(process.cwd(), "supabase", "migrations"))
  .find((name) => name.endsWith("_gmail_oauth_nonce_replay_protection.sql"));
const migration = migrationName
  ? readFileSync(join(process.cwd(), "supabase", "migrations", migrationName), "utf8").toLowerCase()
  : "";

describe("Gmail OAuth nonce replay protection", () => {
  it("stores only a nonce hash with a ten-minute workspace and user binding", () => {
    expect(migration).toContain("create table app_private.gmail_oauth_nonces");
    expect(migration).toMatch(/nonce_hash text primary key[\s\S]*?workspace_id uuid[\s\S]*?user_id uuid[\s\S]*?expires_at timestamptz/);
    expect(migration).toContain("interval '10 minutes'");
  });

  it("consumes an unexpired nonce atomically and only once", () => {
    expect(migration).toMatch(/create or replace function public\.consume_gmail_oauth_nonce[\s\S]*?security definer[\s\S]*?set search_path = ''/);
    expect(migration).toMatch(/update app_private\.gmail_oauth_nonces[\s\S]*?set consumed_at = (?:pg_catalog\.)?clock_timestamp\(\)[\s\S]*?consumed_at is null[\s\S]*?expires_at > (?:pg_catalog\.)?clock_timestamp\(\)[\s\S]*?returning/);
    expect(migration).toMatch(/return (?:pg_catalog\.)?coalesce\([\s\S]*?false\)/);
  });

  it("exposes nonce creation and consumption to service_role only", () => {
    for (const signature of [
      "public.create_gmail_oauth_nonce(text, uuid, uuid)",
      "public.consume_gmail_oauth_nonce(text, uuid, uuid)",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
      expect(migration).toContain(`grant execute on function ${signature} to service_role`);
    }
    expect(migration).toContain("revoke all on app_private.gmail_oauth_nonces from public, anon, authenticated");
  });
});
