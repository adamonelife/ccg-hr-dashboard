import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { database, sql, queries, failNext } from "./database.mjs";
mock.module("postgres", { defaultExport: () => sql });
process.env.DATABASE_URL = "postgres://isolated/never-connected";
process.env.SESSION_SECRET = "fixture-signing-only";
const { default: api } = await import("../api/[[...path]].mjs");
const auth = await import("../lib/auth.mjs");
const flow = await import("../lib/people-staff-access.mjs");
const { createPeopleBroker } = await import(
  "../integrations/staff-access/people-broker.mjs"
);
const id = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002",
  org = "10000000-0000-4000-8000-000000000010",
  sid = "10000000-0000-4000-8000-000000000020";
const fixtureEnv = {
  PEOPLE_STAFF_ACCESS_ENABLED: "true",
  PEOPLE_PLATFORM_ENFORCEMENT_ENABLED: "true",
  PEOPLE_STAFF_ACCESS_ENVIRONMENT: "development",
  PEOPLE_STAFF_ACCESS_ORGANISATION_ID: org,
  PEOPLE_STAFF_ACCESS_ORIGIN: "https://people.qa.invalid",
  PEOPLE_STAFF_ACCESS_ISSUER_ORIGIN: "https://access.qa.invalid",
  PEOPLE_STAFF_ACCESS_COHORT_IDS: id,
  PEOPLE_CONTEXT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  PEOPLE_BROKER_SECRET: "fixture-broker-secret-at-least-32-characters",
  PEOPLE_PLATFORM_URL: "https://provider.qa.invalid",
  PEOPLE_PLATFORM_PUBLISHABLE_KEY: "fixture-public-key",
};
const jwt = (body) =>
  "fixture." +
  Buffer.from(JSON.stringify(body)).toString("base64url") +
  ".provider-stub";
const token = jwt({
  sub: id,
  session_id: sid,
  exp: Math.floor(Date.now() / 1000) + 3600,
});
const cookies = (r) => {
  const v = r.headers["Set-Cookie"];
  return (Array.isArray(v) ? v : [v])
    .filter(Boolean)
    .map((s) => s.split(";")[0])
    .join("; ");
};
async function request(route, method = "GET", body, cookie = "", headers = {}) {
  const req = {
    method,
    url: "/api/" + route,
    query: Object.fromEntries(
      new URL("https://people.qa.invalid/api/" + route).searchParams,
    ),
    headers: {
      host: "people.qa.invalid",
      "content-type": "application/json",
      cookie,
      origin: "https://people.qa.invalid",
      ...headers,
    },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body));
    },
  };
  const res = {
    code: 200,
    headers: {},
    headersSent: false,
    status(c) {
      this.code = c;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    getHeader(k) {
      return this.headers[k];
    },
    json(d) {
      this.data = d;
      this.headersSent = true;
      return this;
    },
    end(d) {
      this.html = d;
      this.headersSent = true;
      return this;
    },
  };
  await api(req, res);
  return res;
}
const provider = async (url, opts) => {
  assert.equal(url, "https://provider.qa.invalid/auth/v1/user");
  return {
    ok: opts.headers.authorization === "Bearer " + token,
    json: async () => ({ id }),
  };
};
async function restore() {
  Object.assign(process.env, fixtureEnv);
  await database.exec(
    `UPDATE platform.module_access SET active=true,access_level='STANDARD',module_role='people'; UPDATE platform.module_registry SET lifecycle='active'; UPDATE platform.account_controls SET status='active'; UPDATE platform.memberships SET active=true; UPDATE employees SET permission_role='Director',employment_status='Active',profile_setup_completed_at=now() WHERE employee_id='QA-ONE'; UPDATE user_accounts SET password_hash='fixture-account-initialised' WHERE employee_id='QA-ONE';`,
  );
  globalThis.fetch = provider;
}
async function launch(currentCookie = "") {
  const start = await request("nallin-sso/start");
  assert.equal(start.code, 303);
  const state = new URL(start.headers.Location).searchParams.get(
      "people_state",
    ),
    cookie = cookies(start);
  const body = { state, accessToken: token, subject: id },
    ts = String(Math.floor(Date.now() / 1000));
  const issue = await request("nallin-sso/issue", "POST", body, "", {
    "x-people-timestamp": ts,
    "x-people-signature": flow.brokerSignature(
      JSON.stringify(body),
      ts,
      flow.staffConfig(),
    ),
  });
  assert.equal(issue.code, 200);
  const callback = await request(
    "nallin-sso/callback",
    "POST",
    issue.data,
    [cookie, currentCookie].filter(Boolean).join("; "),
  );
  return { start, issue, callback, cookie, state };
}
before(async () => {
  await database.exec(
    await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"),
  );
  await database.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA platform;
 CREATE TABLE auth.users(id uuid primary key);CREATE TABLE auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
 CREATE TABLE platform.organisations(id uuid primary key);CREATE TABLE platform.memberships(organisation_id uuid,user_id uuid,active boolean,UNIQUE(organisation_id,user_id));
 CREATE TABLE platform.internal_identity_bindings(auth_user_id uuid primary key,organisation_id uuid,internal_user_id text);
 CREATE TABLE platform.account_controls(user_id uuid primary key,status text);
 CREATE TABLE platform.module_access(user_id uuid,organisation_id uuid,module text,access_level text,module_role text,active boolean);
 CREATE TABLE platform.module_registry(module text primary key,lifecycle text);
 INSERT INTO auth.users VALUES('${id}'),('${other}');INSERT INTO auth.sessions VALUES('${sid}','${id}',NULL);
 INSERT INTO platform.organisations VALUES('${org}');INSERT INTO platform.memberships VALUES('${org}','${id}',true);
 INSERT INTO platform.internal_identity_bindings VALUES('${id}','${org}','usr_qa_one');INSERT INTO platform.account_controls VALUES('${id}','active');
 INSERT INTO platform.module_registry VALUES('hr','active');INSERT INTO platform.module_access VALUES('${id}','${org}','hr','STANDARD','people',true);
 INSERT INTO employees(employee_id,full_name,permission_role,employment_status,profile_setup_completed_at) VALUES('QA-ONE','QA employee','Director','Active',now()),('QA-OTHER','Other fixture','Employee','Active',now());
 INSERT INTO user_accounts(employee_id,email,password_hash) VALUES('QA-ONE','qa@example.invalid','fixture-account-initialised'),('QA-OTHER','other@example.invalid','fixture-account-initialised');`);
  for (const file of [
    "20261104065230_people_reviewed_identity_bindings.sql",
    "20261104070415_people_handoff_and_binding_lifecycle.sql",
  ])
    await database.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  await database.exec(
    `INSERT INTO platform.people_identity_bindings(auth_user_id,organisation_id,employee_id,review_status,reviewed_by,reviewed_at,approval_reference,changed_by,managed_legacy) VALUES('${id}','${org}','QA-ONE','approved','${other}',now(),'isolated QA only','${other}',true)`,
  );
  await restore();
});
after(async () => {
  await database.close();
});
test("Default OFF performs no binding/context queries and leaves legacy authentication operational", async () => {
  delete process.env.PEOPLE_STAFF_ACCESS_ENABLED;
  delete process.env.PEOPLE_PLATFORM_ENFORCEMENT_ENABLED;
  const n = queries.length;
  assert.equal((await request("nallin-sso/start")).code, 404);
  assert.equal(queries.length, n);
  const legacy = auth.createSessionToken({
    employee_id: "QA-ONE",
    user: "qa@example.invalid",
    role: "Director",
  });
  assert.equal(
    (await request("auth/me", "GET", undefined, "hr_session=" + legacy)).code,
    200,
  );
  await restore();
});
test("Optional handoff preflight enforces server-only RLS and deletion lifecycle", async () => {
  const { verifyPeopleHandoff } = await import(
    "../db/verify-people-handoff.mjs"
  );
  assert.equal((await verifyPeopleHandoff(sql)).ok, true);
  await database.exec(
    "GRANT SELECT ON platform.people_auth_contexts TO authenticated",
  );
  await assert.rejects(verifyPeopleHandoff(sql));
  await database.exec(
    "REVOKE SELECT ON platform.people_auth_contexts FROM authenticated",
  );
});
test("Provider failures and timeouts cannot fall back to the local People cookie", async () => {
  const cookie = cookies((await launch()).callback);
  globalThis.fetch = async () => {
    throw new Error("fixture provider timeout");
  };
  assert.equal((await request("auth/me", "GET", undefined, cookie)).code, 401);
  globalThis.fetch = provider;
});
test("Browser-bound issue/callback creates opaque hr_session without provider tokens", async () => {
  const r = await launch();
  assert.equal(r.callback.code, 303);
  const cookie = cookies(r.callback),
    session = auth.verifySessionToken(cookie.match(/hr_session=([^;]+)/)[1]);
  assert.equal(session.auth_source, "nallin");
  assert(!JSON.stringify(session).includes(token));
  assert(!r.start.headers.Location.includes(token));
  assert(!r.callback.headers.Location.includes(token));
  const me = await request("auth/me", "GET", undefined, cookie);
  assert.equal(me.code, 200);
  assert.equal(me.data.role, "Director");
  assert.equal(
    (await request("employees?id=QA-ONE", "GET", undefined, cookie)).code,
    200,
  );
});
test("Replay, missing/wrong browser nonce and cross-origin callback are denied", async () => {
  const r = await launch();
  assert.equal(
    (await request("nallin-sso/callback", "POST", r.issue.data, r.cookie)).code,
    403,
  );
  assert.equal(
    (await request("nallin-sso/callback", "POST", r.issue.data, "")).code,
    403,
  );
  assert.equal(
    (
      await request("nallin-sso/callback", "POST", r.issue.data, r.cookie, {
        origin: "https://evil.invalid",
      })
    ).code,
    403,
  );
});
test("Cross-user and bootstrap sessions are never silently replaced", async () => {
  for (const old of [
    {
      employee_id: "QA-OTHER",
      user: "other@example.invalid",
      role: "Employee",
    },
    { employee_id: null, user: "adam", role: "Administrator" },
  ]) {
    const r = await launch("hr_session=" + auth.createSessionToken(old));
    assert.equal(r.callback.code, 403);
    assert(!cookies(r.callback).includes("hr_session="));
  }
});
test("Invalid issuer signature, stale broker request, wrong subject and wrong environment fail closed", async () => {
  assert.equal(
    (
      await request("nallin-sso/issue", "POST", {
        state: "x",
        accessToken: token,
        subject: id,
      })
    ).code,
    403,
  );
  const c = flow.staffConfig(),
    start = await flow.startHandoff(c, sql);
  await assert.rejects(
    flow.issueHandoff(
      { state: start.id, accessToken: token, subject: other },
      c,
      sql,
      provider,
    ),
  );
  await assert.rejects(
    flow.issueHandoff(
      { state: start.id, accessToken: token, subject: id },
      { ...c, environment: "preview" },
      sql,
      provider,
    ),
  );
  const body = { accessToken: token },
    ts = "1";
  assert.throws(() =>
    flow.verifyBroker(
      {
        body,
        headers: {
          "x-people-timestamp": ts,
          "x-people-signature": flow.brokerSignature(
            JSON.stringify(body),
            ts,
            c,
          ),
        },
      },
      c,
    ),
  );
});
test("Expired handoff and expired context cannot be consumed or renewed silently", async () => {
  const c = flow.staffConfig(),
    start = await flow.startHandoff(c, sql),
    issued = await flow.issueHandoff(
      { state: start.id, accessToken: token, subject: id },
      c,
      sql,
      provider,
    );
  await sql`UPDATE platform.people_handoff_requests SET expires_at=now()-interval '1 second' WHERE id=${start.id}`;
  await assert.rejects(
    flow.consumeHandoff({ ...issued, nonce: start.nonce }, c, sql, provider),
  );
  const r = await launch(),
    cookie = cookies(r.callback);
  await database.exec(
    "UPDATE platform.people_auth_contexts SET expires_at=now()-interval '1 second'",
  );
  assert.equal((await request("auth/me", "GET", undefined, cookie)).code, 401);
});
test("Grant revocation denies both platform and managed legacy sessions on the next request", async () => {
  const cookie = cookies((await launch()).callback),
    legacy =
      "hr_session=" +
      auth.createSessionToken({
        employee_id: "QA-ONE",
        user: "qa@example.invalid",
        role: "Director",
      });
  await database.exec("UPDATE platform.module_access SET active=false");
  for (const s of [cookie, legacy])
    assert.equal((await request("auth/me", "GET", undefined, s)).code, 401);
  await restore();
});
test("Provider logout, disabled identity, inactive membership, resigned employee and missing account are denied", async () => {
  for (const mutation of [
    "UPDATE auth.sessions SET not_after=now()-interval '1 second'",
    "UPDATE platform.account_controls SET status='disabled'",
    "UPDATE platform.memberships SET active=false",
    "UPDATE employees SET employment_status='Resigned' WHERE employee_id='QA-ONE'",
    "UPDATE user_accounts SET password_hash=NULL WHERE employee_id='QA-ONE'",
  ]) {
    await restore();
    await database.exec("UPDATE auth.sessions SET not_after=NULL");
    const cookie = cookies((await launch()).callback);
    await database.exec(mutation);
    assert.equal(
      (await request("auth/me", "GET", undefined, cookie)).code,
      401,
    );
  }
  await restore();
  await database.exec("UPDATE auth.sessions SET not_after=NULL");
});
test("Executive ceiling denies every mutation and side-effectful GET without changing People role", async () => {
  await database.exec(
    "UPDATE platform.module_access SET module_role='executive',access_level='ADMIN'",
  );
  const cookie = cookies((await launch()).callback);
  const me = await request("auth/me", "GET", undefined, cookie);
  assert.equal(me.data.role, "Director");
  assert.equal(me.data.view_only, true);
  for (const [route, method, body] of [
    ["employees", "PATCH", { employee_id: "QA-ONE", job_title: "bad" }],
    ["skills", "POST", {}],
    ["leave-requests", "POST", {}],
    ["admin/org-cleanup", "GET"],
    ["admin/migrate-from-sheets", "GET"],
    ["documents", "DELETE", {}],
  ])
    assert.equal((await request(route, method, body, cookie)).code, 403, route);
  const detail = await request("employees?id=QA-ONE", "GET", undefined, cookie);
  assert.deepEqual(detail.data.permissions.editable_fields, []);
  assert.equal(detail.data.permissions.can_delete, false);
  await database.exec(
    "UPDATE employees SET profile_setup_completed_at=NULL WHERE employee_id='QA-ONE'",
  );
  assert.equal((await request("auth/me", "GET", undefined, cookie)).code, 401);
  await restore();
});
test("Incomplete setup remains incomplete for ordinary Staff Access entry", async () => {
  await database.exec(
    "UPDATE employees SET profile_setup_completed_at=NULL WHERE employee_id='QA-ONE'",
  );
  const cookie = cookies((await launch()).callback);
  const me = await request("auth/me", "GET", undefined, cookie);
  assert.equal(me.code, 200);
  assert.equal(me.data.profile_setup_completed_at, null);
  await restore();
});
test("Context logout revokes locally and returns canonical Staff Access logout", async () => {
  const cookie = cookies((await launch()).callback),
    r = await request("auth/logout", "POST", {}, cookie);
  assert.equal(r.code, 200);
  assert.equal(r.data.logout_url, "https://access.qa.invalid/logout");
  assert.equal((await request("auth/me", "GET", undefined, cookie)).code, 401);
});
test("Flag OFF revokes platform entry while managed legacy enforcement can remain ON", async () => {
  const cookie = cookies((await launch()).callback);
  process.env.PEOPLE_STAFF_ACCESS_ENABLED = "false";
  assert.equal((await request("auth/me", "GET", undefined, cookie)).code, 401);
  await database.exec("UPDATE platform.module_access SET active=false");
  const legacy =
    "hr_session=" +
    auth.createSessionToken({
      employee_id: "QA-ONE",
      user: "qa@example.invalid",
      role: "Director",
    });
  assert.equal((await request("auth/me", "GET", undefined, legacy)).code, 401);
  await restore();
});
test("Logout remains safe after both flags are disabled", async () => {
  const cookie = cookies((await launch()).callback);
  process.env.PEOPLE_STAFF_ACCESS_ENABLED = "false";
  process.env.PEOPLE_PLATFORM_ENFORCEMENT_ENABLED = "false";
  const result = await request("auth/logout", "POST", {}, cookie);
  assert.equal(result.code, 200);
  assert.equal(result.data.logout_url, "https://access.qa.invalid/logout");
  delete process.env.PEOPLE_STAFF_ACCESS_ISSUER_ORIGIN;
  assert.equal(
    (await request("auth/logout", "POST", {}, cookie)).data.logout_url,
    undefined,
  );
  await restore();
});
test("Broker adapter Open Here/New Tab starts a fresh flow; tokens remain in backchannel only", async () => {
  const calls = [],
    env = {
      PEOPLE_STAFF_ACCESS_ENABLED: "true",
      NALLIN_PEOPLE_URL: "https://people.qa.invalid",
      PEOPLE_BROKER_SECRET: fixtureEnv.PEOPLE_BROKER_SECRET,
    };
  const broker = createPeopleBroker({
    env,
    transport: async (url, options) => {
      calls.push({ url, options });
      const r = await request(
        "nallin-sso/" + url.split("/").pop(),
        "POST",
        JSON.parse(options.body),
        "",
        options.headers,
      );
      return { ok: r.code === 200, json: async () => r.data };
    },
  });
  assert.equal((await broker.entitlement({ accessToken: token })).module, "hr");
  const response = {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end() {},
  };
  await broker.launch({ accessToken: token, subject: id }, {}, response);
  assert.equal(
    response.headers.Location,
    "https://people.qa.invalid/api/nallin-sso/start",
  );
  assert(calls.every((c) => !c.url.includes(token)));
});
test("Every existing People role keeps its target, field and salary-route permissions through Staff Access", async () => {
  const { editableEmployeeFields } = await import(
    "../shared/employee-policy.mjs"
  );
  for (const role of [
    "Administrator",
    "Director",
    "HR",
    "Finance",
    "Main Lead",
    "Team Lead",
    "Employee",
  ]) {
    await database.query(
      "UPDATE employees SET permission_role=$1 WHERE employee_id=$2",
      [role, "QA-ONE"],
    );
    const cookie = cookies((await launch()).callback),
      me = await request("auth/me", "GET", undefined, cookie);
    assert.equal(me.data.role, role);
    const detail = await request(
      "employees?id=QA-ONE",
      "GET",
      undefined,
      cookie,
    );
    assert.deepEqual(
      detail.data.permissions.editable_fields,
      editableEmployeeFields({ role, employee_id: "QA-ONE" }, "QA-ONE"),
    );
    const outside = await request(
      "employees?id=QA-OTHER",
      "GET",
      undefined,
      cookie,
    );
    assert.equal(
      outside.code,
      ["Main Lead", "Team Lead", "Employee"].includes(role) ? 403 : 200,
    );
    const salary = await request(
      "salary-history?employeeId=QA-ONE",
      "GET",
      undefined,
      cookie,
    );
    assert.equal(
      salary.code,
      ["Administrator", "HR", "Finance"].includes(role) ? 200 : 403,
    );
    const list = await request("employees", "GET", undefined, cookie);
    assert.equal(list.code, 200);
    assert(!JSON.stringify(list.data).includes("current_salary"));
    const mutation = await request(
      "employees",
      "PATCH",
      { employee_id: "QA-ONE", job_title: "QA " + role },
      cookie,
    );
    assert.equal(
      mutation.code,
      ["Main Lead", "Team Lead", "Employee"].includes(role) ? 403 : 200,
      role,
    );
  }
  await restore();
});
test("Authority failure immediately before commit rolls back the business write", async () => {
  const cookie = cookies((await launch()).callback),
    before = (
      await sql`SELECT job_title FROM employees WHERE employee_id='QA-OTHER'`
    )[0].job_title;
  let reads = 0;
  globalThis.fetch = async (...args) => {
    reads++;
    if (reads === 3) return { ok: false };
    return provider(...args);
  };
  const r = await request(
    "employees",
    "PATCH",
    { employee_id: "QA-OTHER", job_title: "must rollback" },
    cookie,
  );
  assert.equal(r.code, 401);
  assert.equal(
    (await sql`SELECT job_title FROM employees WHERE employee_id='QA-OTHER'`)[0]
      .job_title,
    before,
  );
  globalThis.fetch = provider;
});
test("Existing nested salary transaction stays atomic in the outer authority transaction", async () => {
  await database.exec(
    "UPDATE employees SET permission_role='HR' WHERE employee_id='QA-ONE'",
  );
  const cookie = cookies((await launch()).callback);
  const before = (await sql`SELECT count(*)::int n FROM salary_history`)[0].n;
  failNext(/UPDATE employees SET/);
  const r = await request(
    "salary-history",
    "POST",
    {
      employee_id: "QA-ONE",
      effective_date: "2026-01-01",
      amount: 500,
      currency: "IDR",
    },
    cookie,
  );
  assert(r.code >= 400);
  assert.equal(
    (await sql`SELECT count(*)::int n FROM salary_history`)[0].n,
    before,
  );
  await restore();
});
test("Binding version changes invalidate outstanding handoffs and active contexts", async () => {
  const c = flow.staffConfig(),
    start = await flow.startHandoff(c, sql),
    issued = await flow.issueHandoff(
      { state: start.id, accessToken: token, subject: id },
      c,
      sql,
      provider,
    );
  const cookie = cookies((await launch()).callback);
  await database.exec(
    "UPDATE platform.people_identity_bindings SET approval_reference='QA re-review'",
  );
  await assert.rejects(
    flow.consumeHandoff({ ...issued, nonce: start.nonce }, c, sql, provider),
  );
  assert.equal((await request("auth/me", "GET", undefined, cookie)).code, 401);
});
test("Independent new-tab flows have distinct browser state; concurrent replay yields at most one context", async () => {
  const c = flow.staffConfig(),
    a = await flow.startHandoff(c, sql),
    b = await flow.startHandoff(c, sql);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.nonce, b.nonce);
  const issued = await flow.issueHandoff(
    { state: a.id, accessToken: token, subject: id },
    c,
    sql,
    provider,
  );
  const results = await Promise.allSettled([
    flow.consumeHandoff({ ...issued, nonce: a.nonce }, c, sql, provider),
    flow.consumeHandoff({ ...issued, nonce: a.nonce }, c, sql, provider),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});
test("A failed bound employee deletion rolls back employee, binding, context and audit together", async () => {
  const cookie = cookies((await launch()).callback);
  const before = (
    await sql`SELECT count(*)::int n FROM platform.people_binding_audit`
  )[0].n;
  await assert.rejects(
    sql.begin(async (tx) => {
      await tx`DELETE FROM employees WHERE employee_id='QA-ONE'`;
      throw new Error("fixture rollback");
    }),
  );
  assert.equal(
    (
      await sql`SELECT review_status FROM platform.people_identity_bindings WHERE auth_user_id=${id}`
    )[0].review_status,
    "approved",
  );
  assert.equal(
    (await sql`SELECT count(*)::int n FROM platform.people_binding_audit`)[0].n,
    before,
  );
  assert.equal((await request("auth/me", "GET", undefined, cookie)).code, 200);
});
test("Expired encrypted contexts are removable without deleting bindings or audit evidence", async () => {
  const { cleanupPeopleContexts } = await import(
    "../db/cleanup-people-contexts.mjs"
  );
  const cookie = cookies((await launch()).callback);
  const before = (
    await sql`SELECT count(*)::int n FROM platform.people_binding_audit`
  )[0].n;
  await database.exec(
    "UPDATE platform.people_auth_contexts SET expires_at=now()-interval '1 second'",
  );
  assert((await cleanupPeopleContexts(sql)).contexts > 0);
  assert.equal(
    (
      await sql`SELECT count(*)::int n FROM platform.people_identity_bindings`
    )[0].n,
    1,
  );
  assert.equal(
    (await sql`SELECT count(*)::int n FROM platform.people_binding_audit`)[0].n,
    before,
  );
  assert.equal((await request("auth/me", "GET", undefined, cookie)).code, 401);
});
test("Bound Administrator self-deletion revokes context and preserves audit identity; ID reuse cannot restore access", async () => {
  await database.exec(
    "UPDATE employees SET permission_role='Administrator' WHERE employee_id='QA-ONE'",
  );
  const cookie = cookies((await launch()).callback);
  const deleted = await request(
    "employees?id=QA-ONE",
    "DELETE",
    undefined,
    cookie,
  );
  assert.equal(deleted.code, 200);
  const [binding] =
    await sql`SELECT * FROM platform.people_identity_bindings WHERE auth_user_id=${id}`;
  assert.equal(binding.employee_id, null);
  assert.equal(binding.original_employee_id, "QA-ONE");
  assert.equal(binding.review_status, "revoked");
  const audit = (
    await database.query(
      "SELECT * FROM platform.people_binding_audit ORDER BY id DESC LIMIT 1",
    )
  ).rows[0];
  assert.equal(audit.actor_context.employee_id, "QA-ONE");
  assert.equal(audit.actor_user_id, null);
  assert.equal((await request("auth/me", "GET", undefined, cookie)).code, 401);
  await database.exec(
    "INSERT INTO employees(employee_id,full_name,permission_role) VALUES('QA-ONE','Different fixture','Employee')",
  );
  assert.equal((await request("auth/me", "GET", undefined, cookie)).code, 401);
});
