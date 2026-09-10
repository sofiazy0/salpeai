import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("real Postgres policies isolate accounts, block direct writes, revoke sessions and enforce quotas", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; grant usage on schema auth to authenticated,service_role;
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;`);
    await db.exec(await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"));
    const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222", sa = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sb = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ca = "33333333-3333-4333-8333-333333333333", cb = "44444444-4444-4444-8444-444444444444";
    await db.query("insert into auth.users values($1,now()),($2,now())", [a,b]);
    await db.query("insert into auth.sessions values($1,$2),($3,$4)", [sa,a,sb,b]);
    await db.query("insert into salpe_conversations(id,user_id,title,model) values($1,$2,'A','model'),($3,$4,'B','model')", [ca,a,cb,b]);
    await db.query("insert into salpe_messages(conversation_id,user_id,role,content) values($1,$2,'assistant','private A'),($3,$4,'assistant','private B')", [ca,a,cb,b]);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [a,JSON.stringify({ session_id: sa })]);
    assert.deepEqual((await db.query("select title from salpe_conversations")).rows, [{title:"A"}]);
    assert.deepEqual((await db.query("select content from salpe_messages")).rows, [{content:"private A"}]);
    assert.equal((await db.query("delete from salpe_conversations where id=$1 returning id", [cb])).rows.length,0);
    await assert.rejects(db.query("insert into salpe_conversations(user_id,title,model) values($1,'bypass','m')",[a]),/permission denied/);
    await assert.rejects(db.query("select salpe_consume_quota($1,2,60)",["f".repeat(64)]),/permission denied/);
    await db.exec("reset role"); await db.query("delete from auth.sessions where id=$1",[sa]); await db.exec("set role authenticated");
    assert.equal((await db.query("select * from salpe_messages")).rows.length,0);
    assert.deepEqual((await db.query("select salpe_session_active() as active")).rows,[{active:false}]);
    await db.exec("reset role; set role service_role");
    for (const expected of [true,true,false,false]) assert.deepEqual((await db.query("select salpe_consume_quota($1,2,86400) as allowed",["f".repeat(64)])).rows,[{allowed:expected}]);
    await db.exec("reset role");
    await assert.rejects(db.query("insert into salpe_messages(conversation_id,user_id,role,content) values($1,$2,'user','cross account')",[ca,b]),/foreign key/);
    await assert.rejects(db.query("insert into salpe_messages(conversation_id,user_id,role,content) values($1,$2,'system','injected role')",[ca,a]),/check constraint/);
  } finally { await db.close(); }
});
