import crypto from "node:crypto";
import { getSql, withRequestSql } from "./db.mjs";
import { inspectPeopleBinding } from "./people-binding-readiness.mjs";
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const random = () => crypto.randomBytes(32).toString("hex");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tokenId = /^[a-f0-9]{64}$/;
const fail = (code = "unverified") => {
  throw Object.assign(new Error("People Staff Access could not be verified"), {
    code,
  });
};
export function staffConfig(env = process.env) {
  const enabled = env.PEOPLE_STAFF_ACCESS_ENABLED === "true";
  const enforcement = env.PEOPLE_PLATFORM_ENFORCEMENT_ENABLED === "true";
  if (!enabled && !enforcement) return { enabled: false, enforcement: false };
  const environment = env.VERCEL_ENV || env.PEOPLE_STAFF_ACCESS_ENVIRONMENT;
  const organisationId = env.PEOPLE_STAFF_ACCESS_ORGANISATION_ID;
  const origin = env.PEOPLE_STAFF_ACCESS_ORIGIN,
    issuer = env.PEOPLE_STAFF_ACCESS_ISSUER_ORIGIN;
  if (
    !["development", "preview", "production"].includes(environment) ||
    !uuid.test(organisationId || "")
  )
    fail();
  const safeOrigin = (value) => {
    try {
      const u = new URL(value);
      return (
        u.origin === value &&
        (u.protocol === "https:" ||
          (environment === "development" &&
            u.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(u.hostname)))
      );
    } catch {
      return false;
    }
  };
  if (!safeOrigin(origin) || !safeOrigin(issuer)) fail();
  const cohort = (env.PEOPLE_STAFF_ACCESS_COHORT_IDS || "")
    .split(",")
    .filter(Boolean);
  if (!cohort.length || cohort.some((id) => !uuid.test(id))) fail();
  const key = Buffer.from(env.PEOPLE_CONTEXT_ENCRYPTION_KEY || "", "base64");
  const brokerSecret = env.PEOPLE_BROKER_SECRET;
  if (
    key.length !== 32 ||
    !brokerSecret ||
    brokerSecret.length < 32 ||
    (enabled && !enforcement)
  )
    fail();
  return {
    enabled,
    enforcement,
    environment,
    organisationId,
    origin,
    issuer,
    cohort,
    key,
    brokerSecret,
    providerUrl: env.PEOPLE_PLATFORM_URL,
    publishableKey: env.PEOPLE_PLATFORM_PUBLISHABLE_KEY,
  };
}
function encrypt(value, aad, c) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", c.key, iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}
function decrypt(value, aad, c) {
  const raw = Buffer.from(value, "base64url"),
    cipher = crypto.createDecipheriv("aes-256-gcm", c.key, raw.subarray(0, 12));
  cipher.setAAD(Buffer.from(aad));
  cipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([
    cipher.update(raw.subarray(28)),
    cipher.final(),
  ]).toString("utf8");
}
function claims(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
    if (
      !uuid.test(p.sub) ||
      !uuid.test(p.session_id) ||
      !Number.isFinite(p.exp) ||
      p.exp <= Date.now() / 1000
    )
      fail();
    return p;
  } catch {
    fail();
  }
}
export async function livePlatform(
  token,
  c,
  sql = getSql(),
  transport = fetch,
) {
  const p = claims(token);
  if (
    !c.providerUrl ||
    new URL(c.providerUrl).protocol !== "https:" ||
    !c.publishableKey
  )
    fail();
  // Decoded JWT fields are never trusted until the provider validates this token.
  const response = await transport(c.providerUrl + "/auth/v1/user", {
    headers: { authorization: "Bearer " + token, apikey: c.publishableKey },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) fail();
  const user = await response.json();
  if (user.id !== p.sub) fail();
  const [session] =
    await sql`SELECT id FROM auth.sessions WHERE id=${p.session_id} AND user_id=${p.sub} AND (not_after IS NULL OR not_after>now())`;
  if (!session) fail();
  return { ...p };
}
export async function livePeopleIdentity(subject, c, sql = getSql()) {
  if (!c.cohort.includes(subject)) fail();
  const inspected = await inspectPeopleBinding(sql, {
    platformUserId: subject,
    organisationId: c.organisationId,
  });
  if (!inspected.readyForCertification) fail();
  const [grant] =
    await sql`SELECT a.access_level,a.module_role FROM platform.module_access a
 JOIN platform.module_registry r ON r.module=a.module AND r.lifecycle='active'
 WHERE a.user_id=${subject} AND a.organisation_id=${c.organisationId} AND a.module='hr' AND a.active`;
  if (
    !grant ||
    !["ADMIN", "STANDARD", "VIEW_ONLY"].includes(grant.access_level) ||
    !["people", "executive"].includes(grant.module_role)
  )
    fail();
  const viewOnly =
    grant.access_level === "VIEW_ONLY" || grant.module_role === "executive";
  if (viewOnly && !inspected.profileSetupComplete) fail();
  const [account] =
    await sql`SELECT email FROM public.user_accounts WHERE employee_id=${inspected.employeeId}`;
  if (!account) fail();
  return { ...inspected, subject, viewOnly, user: account.email };
}
export function brokerSignature(body, timestamp, c) {
  return crypto
    .createHmac("sha256", c.brokerSecret)
    .update(timestamp + "\n" + body)
    .digest("hex");
}
export function verifyBroker(req, c) {
  const ts = req.headers["x-people-timestamp"],
    sig = req.headers["x-people-signature"];
  if (
    !/^\d+$/.test(ts || "") ||
    Math.abs(Date.now() / 1000 - Number(ts)) > 30 ||
    !/^[a-f0-9]{64}$/.test(sig || "")
  )
    fail();
  const expected = brokerSignature(JSON.stringify(req.body), ts, c);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) fail();
}
export async function startHandoff(c, sql = getSql()) {
  const id = random(),
    nonce = random();
  await sql`INSERT INTO platform.people_handoff_requests(id,browser_nonce_hash,environment,expires_at) VALUES(${id},${sha(nonce)},${c.environment},now()+interval '2 minutes')`;
  return { id, nonce };
}
export async function issueHandoff(
  { state, accessToken, subject },
  c,
  sql = getSql(),
  transport = fetch,
) {
  if (!c.enabled || !tokenId.test(state || "")) fail();
  const p = await livePlatform(accessToken, c, sql, transport);
  if (p.sub !== subject) fail();
  const identity = await livePeopleIdentity(subject, c, sql),
    code = random();
  const aad = `handoff:${c.environment}:${state}:${subject}`;
  const [row] =
    await sql`UPDATE platform.people_handoff_requests SET code_hash=${sha(code)},auth_user_id=${subject},binding_version=${identity.bindingVersion},encrypted_token=${encrypt(accessToken, aad, c)},provider_session_id=${p.session_id},token_expires_at=${new Date(p.exp * 1000)},expires_at=LEAST(expires_at,now()+interval '45 seconds') WHERE id=${state} AND environment=${c.environment} AND expires_at>now() AND code_hash IS NULL RETURNING id`;
  if (!row) fail();
  return { code, state };
}
export async function consumeHandoff(
  { state, code, nonce, currentEmployeeId, currentBootstrap },
  c,
  sql = getSql(),
  transport = fetch,
) {
  if (!c.enabled || ![state, code, nonce].every((x) => tokenId.test(x || "")))
    fail("handoff_format");
  return sql.begin(async (tx) => {
    const [h] =
      await tx`SELECT * FROM platform.people_handoff_requests WHERE id=${state} AND code_hash=${sha(code)} AND browser_nonce_hash=${sha(nonce)} AND environment=${c.environment} AND expires_at>now() AND consumed_at IS NULL FOR UPDATE`;
    if (!h) fail("handoff_state_missing");
    const token = decrypt(
      h.encrypted_token,
      `handoff:${c.environment}:${state}:${h.auth_user_id}`,
      c,
    );
    const p = await livePlatform(token, c, tx, transport),
      identity = await livePeopleIdentity(p.sub, c, tx);
    if (
      p.sub !== h.auth_user_id ||
      p.session_id !== h.provider_session_id ||
      String(h.binding_version) !== identity.bindingVersion ||
      currentBootstrap ||
      (currentEmployeeId && currentEmployeeId !== identity.employeeId)
    )
      fail();
    const id = random(),
      aad = `context:${c.environment}:${id}:${p.sub}:${identity.bindingVersion}`;
    await tx`UPDATE platform.people_handoff_requests SET consumed_at=now(),encrypted_token=NULL WHERE id=${state}`;
    await tx`INSERT INTO platform.people_auth_contexts(id,auth_user_id,employee_id,organisation_id,binding_version,provider_session_id,environment,encrypted_token,expires_at) VALUES(${id},${p.sub},${identity.employeeId},${c.organisationId},${identity.bindingVersion},${p.session_id},${c.environment},${encrypt(token, aad, c)},${new Date(Math.min(p.exp * 1000, Date.now() + 3600000))})`;
    return { id, identity };
  });
}
export async function resolveStaffContext(
  session,
  c,
  sql = getSql(),
  transport = fetch,
) {
  if (!c.enabled || !tokenId.test(session.context_id || "")) fail();
  const [ctx] =
    await sql`SELECT * FROM platform.people_auth_contexts WHERE id=${session.context_id} AND environment=${c.environment} AND expires_at>now() AND revoked_at IS NULL`;
  if (
    !ctx ||
    ctx.employee_id !== session.employee_id ||
    ctx.organisation_id !== c.organisationId
  )
    fail();
  const token = decrypt(
    ctx.encrypted_token,
    `context:${c.environment}:${ctx.id}:${ctx.auth_user_id}:${ctx.binding_version}`,
    c,
  );
  const p = await livePlatform(token, c, sql, transport),
    identity = await livePeopleIdentity(p.sub, c, sql);
  if (
    p.sub !== ctx.auth_user_id ||
    p.session_id !== ctx.provider_session_id ||
    identity.bindingVersion !== String(ctx.binding_version) ||
    identity.employeeId !== ctx.employee_id ||
    identity.user !== session.user
  )
    fail();
  return {
    view_only: identity.viewOnly,
    auth_source: "nallin",
    platform_managed: true,
    platform_subject: p.sub,
  };
}
export async function legacyPlatformCeiling(employeeId, c, sql = getSql()) {
  if (!c.enforcement) return {};
  const [b] =
    await sql`SELECT auth_user_id,review_status FROM platform.people_identity_bindings WHERE (employee_id=${employeeId} OR (employee_id IS NULL AND original_employee_id=${employeeId})) AND managed_legacy`;
  if (!b) return {};
  if (b.review_status !== "approved") fail();
  const identity = await livePeopleIdentity(b.auth_user_id, c, sql);
  return {
    view_only: identity.viewOnly,
    platform_managed: true,
    platform_subject: b.auth_user_id,
  };
}
export async function revokeLocalContext(session, sql = getSql()) {
  if (
    session?.auth_source === "nallin" &&
    tokenId.test(session.context_id || "")
  )
    await sql`UPDATE platform.people_auth_contexts SET revoked_at=now() WHERE id=${session.context_id}`;
}
export const staffReadRoutes = new Set([
  "employees",
  "org-chart",
  "org-units",
  "salary-history",
  "promotion-history",
  "skills",
  "leave-requests",
  "leave-balances",
  "documents",
  "company-documents",
  "change-requests",
]);
export function staffRequestAllowed(req, session) {
  if (!session.view_only) return true;
  const route = new URL(req.url, "https://people.invalid").pathname.replace(
    /^\/api\//,
    "",
  );
  return ["GET", "HEAD"].includes(req.method) && staffReadRoutes.has(route);
}

// Buffer responses until commit. Existing nested business transactions join this
// authority transaction, so a revocation/failure cannot commit partial writes.
export async function runStaffMutation(req, res, session, handler, revalidate) {
  const buffered = {
    code: 200,
    headers: {},
    status(code) {
      this.code = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    getHeader(k) {
      return this.headers[k];
    },
    end(body) {
      this.body = body;
      return this;
    },
  };
  const rejected = new Error("buffered rejection");
  try {
    await getSql().begin(async (tx) => {
      const transaction = new Proxy(tx, {
        get(target, key) {
          if (key === "begin") return (callback) => callback(transaction);
          return Reflect.get(target, key);
        },
      });
      await withRequestSql(transaction, async () => {
        await tx`SELECT auth_user_id FROM platform.people_identity_bindings WHERE auth_user_id=${session.platform_subject} FOR SHARE`;
        await tx`SELECT user_id FROM platform.memberships WHERE user_id=${session.platform_subject} FOR SHARE`;
        await tx`SELECT user_id FROM platform.module_access WHERE user_id=${session.platform_subject} AND module='hr' FOR SHARE`;
        await tx`SELECT user_id FROM platform.account_controls WHERE user_id=${session.platform_subject} FOR SHARE`;
        await tx`SELECT employee_id FROM public.employees WHERE employee_id=${session.employee_id} FOR SHARE`;
        if (session.auth_source === "nallin")
          await tx`SELECT s.id FROM auth.sessions s JOIN platform.people_auth_contexts c ON c.provider_session_id=s.id WHERE c.id=${session.context_id} FOR SHARE OF s`;
        const before = await revalidate();
        if (!before || before.view_only || before.role !== session.role)
          throw new Error("authority changed");
        await handler(req, buffered);
        if (buffered.code >= 400) throw rejected;
        const selfDeletion =
          req.method === "DELETE" &&
          new URL(req.url, "https://people.invalid").pathname ===
            "/api/employees" &&
          req.query.id === session.employee_id &&
          session.role === "Administrator";
        if (!selfDeletion) {
          const after = await revalidate();
          if (!after || after.view_only || after.role !== session.role)
            throw new Error("authority changed");
        }
      });
    });
  } catch (error) {
    if (error !== rejected)
      return res
        .status(401)
        .json({ error: "People access could not be verified" });
  }
  for (const [name, value] of Object.entries(buffered.headers))
    res.setHeader(name, value);
  return buffered.data === undefined
    ? (res.status(buffered.code), res.end(buffered.body))
    : res.status(buffered.code).json(buffered.data);
}
