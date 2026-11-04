// Local-only browser certification harness. No real users or provider calls.
import { mock } from "node:test";
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { database, sql } from "../test/database.mjs";
import { prepareStaffAccess } from "../integrations/staff-access/prepare-source.mjs";
mock.module("postgres", { defaultExport: () => sql });
const id = "10000000-0000-4000-8000-000000000001",
  org = "10000000-0000-4000-8000-000000000010",
  sid = "10000000-0000-4000-8000-000000000020",
  reviewer = "10000000-0000-4000-8000-000000000002";
const people = "http://127.0.0.1:5196",
  broker = "http://localhost:5197",
  provider = "https://provider.qa.invalid";
const token =
  "fixture." +
  Buffer.from(
    JSON.stringify({
      sub: id,
      session_id: sid,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url") +
  ".synthetic";
Object.assign(process.env, {
  DATABASE_URL: "postgres://isolated/never-connected",
  SESSION_SECRET: "qa-people-only",
  NALLIN_SSO_SECRET: "qa-access-only",
  PEOPLE_STAFF_ACCESS_ENABLED: "true",
  PEOPLE_PLATFORM_ENFORCEMENT_ENABLED: "true",
  PEOPLE_STAFF_ACCESS_ENVIRONMENT: "development",
  PEOPLE_STAFF_ACCESS_ORGANISATION_ID: org,
  PEOPLE_STAFF_ACCESS_ORIGIN: people,
  PEOPLE_STAFF_ACCESS_ISSUER_ORIGIN: broker,
  PEOPLE_STAFF_ACCESS_COHORT_IDS: id,
  PEOPLE_CONTEXT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  PEOPLE_BROKER_SECRET: "qa-only-broker-key-more-than-32-characters",
  PEOPLE_PLATFORM_URL: provider,
  PEOPLE_PLATFORM_PUBLISHABLE_KEY: "qa-public",
  NEXT_PUBLIC_SUPABASE_URL: provider,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "qa-public",
  NALLIN_PEOPLE_URL: people,
});
delete process.env.VERCEL_ENV;
await database.exec(
  await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"),
);
await database.exec(
  await readFile(new URL("./platform-fixtures.sql", import.meta.url), "utf8"),
);
for (const name of [
  "20261104065230_people_reviewed_identity_bindings.sql",
  "20261104070415_people_handoff_and_binding_lifecycle.sql",
])
  await database.exec(
    await readFile(
      new URL("../supabase/migrations/" + name, import.meta.url),
      "utf8",
    ),
  );
await database.exec(
  `INSERT INTO platform.people_identity_bindings(auth_user_id,organisation_id,employee_id,review_status,reviewed_by,reviewed_at,approval_reference,changed_by,managed_legacy) VALUES('${id}','${org}','QA-ONE','approved','${reviewer}',now(),'synthetic browser QA','${reviewer}',true)`,
);
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const text = String(url);
  if (text.startsWith(provider)) {
    if (
      options.headers?.Authorization !== `Bearer ${token}` &&
      options.headers?.authorization !== `Bearer ${token}`
    )
      return { ok: false, json: async () => ({ error: "QA denied" }) };
    if (text.includes("/functions/"))
      return {
        ok: true,
        json: async () => ({
          user: { id, displayName: "QA Employee" },
          entitlements: [],
        }),
      };
    if (text.includes("/logout")) {
      await database.exec(
        "UPDATE auth.sessions SET not_after=now()-interval '1 second'",
      );
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => ({ id }) };
  }
  if (text.startsWith(people) || text.startsWith(broker))
    return nativeFetch(url, options);
  throw new Error("QA external network blocked");
};
const source = resolve(process.argv[2] || "../../nallin-access-picker"),
  destination = resolve("work/qa-access");
const hash = crypto
  .createHash("sha256")
  .update(await readFile(source + "/api/index.js"))
  .digest("hex");
const visualHash = crypto
  .createHash("sha256")
  .update(await readFile(source + "/lib/nallin-visual.cjs"))
  .digest("hex");
console.log(
  "QA Staff Access snapshot",
  await prepareStaffAccess(source, destination, hash, visualHash),
);
await writeFile(destination + "/package.json", '{"type":"commonjs"}');
const require = createRequire(import.meta.url),
  access = require(destination + "/api/index.js"),
  { seal } = require(destination + "/lib/crypto.js");
const visual = require(destination + "/lib/nallin-visual.cjs");
assert(
  visual
    .launcher({ displayName: "QA" }, [{ module: "hr" }])
    .includes('href="/module?module=hr"'),
);
process.env.PEOPLE_STAFF_ACCESS_ENABLED = "false";
assert(
  !visual
    .launcher({ displayName: "QA" }, [{ module: "hr" }])
    .includes('href="/module?module=hr"'),
);
process.env.PEOPLE_STAFF_ACCESS_ENABLED = "true";
console.log("Prepared canonical launcher ON/OFF checks: PASS");
const { default: api } = await import("../api/[[...path]].mjs");
function decorate(req, res) {
  const u = new URL(req.url, "http://localhost");
  req.query = Object.fromEntries(u.searchParams);
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(d));
    return res;
  };
}
http
  .createServer(async (req, res) => {
    try {
      decorate(req, res);
      const u = new URL(req.url, people);
      if (u.pathname.endsWith("/callback"))
        console.log("QA callback", {
          origin: req.headers.origin,
          hasNonce: /np_state_/.test(req.headers.cookie || ""),
        });
      if (u.pathname === "/_qa/revoke") {
        await database.exec("UPDATE platform.module_access SET active=false");
        res.end("Synthetic People entitlement revoked.");
        return;
      }
      if (u.pathname === "/_qa/executive") {
        await database.exec(
          "UPDATE platform.module_access SET active=true,module_role='executive',access_level='VIEW_ONLY'; UPDATE auth.sessions SET not_after=NULL",
        );
        res.writeHead(303, { Location: "/api/nallin-sso/start" });
        res.end();
        return;
      }
      if (u.pathname.startsWith("/api/")) return await api(req, res);
      let name = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
      if (name.includes("..")) {
        res.statusCode = 400;
        return res.end();
      }
      const body = await readFile("dist/" + name);
      res.setHeader(
        "Content-Type",
        name.endsWith(".js")
          ? "text/javascript"
          : name.endsWith(".css")
            ? "text/css"
            : name.endsWith(".svg")
              ? "image/svg+xml"
              : name.endsWith(".png")
                ? "image/png"
                : "text/html",
      );
      res.end(body);
    } catch {
      res.statusCode = 500;
      res.end("Isolated QA error");
    }
  })
  .listen(5196, "127.0.0.1");
http
  .createServer(async (req, res) => {
    try {
      if (req.url === "/_qa/login") {
        res.setHeader(
          "Set-Cookie",
          `nallin_session=${seal({ accessToken: token, refreshToken: "qa-no-real-refresh", exp: Math.floor(Date.now() / 1000) + 3600 }, process.env.NALLIN_SSO_SECRET)}; Path=/; HttpOnly; SameSite=Lax`,
        );
        res.writeHead(303, { Location: "/module?module=hr" });
        return res.end();
      }
      if (req.method === "POST") {
        let body = "";
        for await (const part of req) body += part;
        req.body = Object.fromEntries(new URLSearchParams(body));
      }
      await access(req, res);
    } catch {
      res.statusCode = 500;
      res.end("Isolated QA broker error");
    }
  })
  .listen(5197, "localhost");
console.log("Synthetic QA only: " + broker + "/_qa/login");
