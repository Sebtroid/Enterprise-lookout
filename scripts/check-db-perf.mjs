import fs from "node:fs";
import postgres from "postgres";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const sql = postgres(env.SUPABASE_DB_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
});

async function timed(name, fn) {
  const startedAt = Date.now();
  try {
    const rows = await fn();
    console.log(name, `${Date.now() - startedAt}ms`, `rows=${rows.length}`);
  } catch (error) {
    console.error(name, "ERR", error.message);
  }
}

const scope = "pastoral-invierno-2026";

await timed("campaigns", () => sql`
  select slug, name
  from campaigns
  order by created_at asc
`);

await timed("companies", () => sql`
  select co.id::text as id
  from companies co
  left join campaign_contacts cc on cc.company_id = co.id
  left join campaigns c on c.id = cc.campaign_id
  where c.slug = ${scope}
  group by co.id
  order by co.canonical_name asc
`);

await timed("contacts", () => sql`
  select distinct ct.id::text as id, ct.full_name
  from contacts ct
  join campaign_contacts cc on cc.contact_id = ct.id
  join campaigns c on c.id = cc.campaign_id
  where c.slug = ${scope}
  order by ct.full_name asc
`);

await timed("messages", () => sql`
  select m.id::text as id
  from messages m
  join campaigns c on c.id = m.campaign_id
  where m.kind in ('outbound_initial', 'outbound_followup', 'outbound_reply')
    and c.slug = ${scope}
  order by coalesce(m.sent_at, m.updated_at, m.created_at) desc
`);

await timed("replies", () => sql`
  select m.id::text as id
  from messages m
  join campaigns c on c.id = m.campaign_id
  where m.kind = 'inbound_reply'
    and c.slug = ${scope}
  order by coalesce(m.received_at, m.created_at) desc
`);

await timed("senders", () => sql`
  select sa.id::text as id
  from campaign_sender_accounts csa
  join sender_accounts sa on sa.id = csa.sender_account_id
  join campaigns c on c.id = csa.campaign_id
  where c.slug = ${scope}
  order by c.name asc, csa.priority asc, sa.email asc
`);

await timed("imports", () => sql`
  select ib.id::text as id
  from import_batches ib
  join campaigns c on c.id = ib.campaign_id
  where c.slug = ${scope}
  order by ib.created_at desc
`);

await sql.end();
