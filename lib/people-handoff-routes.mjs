import { getSql } from "./db.mjs";
import {
  staffConfig,
  verifyBroker,
  startHandoff,
  issueHandoff,
  consumeHandoff,
  livePlatform,
  livePeopleIdentity,
  activeHandoffIdentity,
} from "./people-staff-access.mjs";
import {
  getSessionFromRequest,
  createSessionToken,
  setSessionCookie,
} from "./auth.mjs";
const cookies = (req) =>
  Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim().split("=")),
  );
const page = (res, status, text) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(status);
  res.end(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Nallin People</title><p>${text}</p><a href="/">Return to People</a></html>`,
  );
};
function appendCookie(res, value) {
  const old = res.getHeader?.("Set-Cookie");
  res.setHeader(
    "Set-Cookie",
    old ? [...(Array.isArray(old) ? old : [old]), value] : value,
  );
}
export async function handlePeopleHandoff(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  try {
    const c = staffConfig();
    if (!c.enabled) return page(res, 404, "Staff Access entry is not enabled.");
    const action = new URL(req.url, c.origin).pathname.split("/").pop();
    if (action === "start" && req.method === "GET") {
      const { id, nonce } = await startHandoff(c);
      appendCookie(
        res,
        `np_state_${id}=${nonce}; Path=/api/nallin-sso; HttpOnly; Secure; SameSite=Lax; Max-Age=120`,
      );
      res.status(303);
      res.setHeader(
        "Location",
        c.issuer + "/module?module=hr&people_state=" + id,
      );
      return res.end();
    }
    if (action === "entry" && req.method === "GET") {
      res.setHeader("Referrer-Policy", "same-origin");
      // Static script is same-origin, clears fragment before submitting. No tokens in URLs.
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      );
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200);
      return res.end(
        '<!doctype html><html lang="en"><meta charset="utf-8"><title>Nallin People</title><p>Opening Nallin People…</p><script src="/people-handoff.js"></script></html>',
      );
    }
    if (["issue", "access"].includes(action) && req.method === "POST") {
      verifyBroker(req, c);
      if (action === "access") {
        const p = await livePlatform(req.body.accessToken, c);
        const identity = await livePeopleIdentity(p.sub, c);
        return res
          .status(200)
          .json({
            module: "hr",
            platformUserId: p.sub,
            organisationId: c.organisationId,
            accessLevel: identity.viewOnly ? "VIEW_ONLY" : "STANDARD",
            moduleRole: identity.viewOnly ? "executive" : "people",
          });
      }
      const issued = await issueHandoff(req.body, c);
      return res.status(200).json(issued);
    }
    if (action === "callback" && req.method === "POST") {
      if (req.headers.origin !== c.origin) throw new Error("origin");
      const body =
        req.body ||
        Object.fromEntries(new URLSearchParams(req.rawBody?.toString() || ""));
      const old = await activeHandoffIdentity(getSessionFromRequest(req),c);
      const { id, identity } = await consumeHandoff(
        {
          ...body,
          nonce: cookies(req)["np_state_" + body.state],
          currentEmployeeId: old?.employee_id,
          currentBootstrap: Boolean(old && !old.employee_id),
        },
        c,
      );
      setSessionCookie(
        res,
        createSessionToken({
          auth_source: "nallin",
          context_id: id,
          employee_id: identity.employeeId,
          user: identity.user,
        }),
      );
      appendCookie(
        res,
        `np_state_${body.state}=; Path=/api/nallin-sso; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      );
      res.status(303);
      res.setHeader("Location", "/");
      return res.end();
    }
    return page(res, 405, "This action is unavailable.");
  } catch (error) {
    console.error("People Staff Access rejected", {
      code: /^[a-z_]+$/.test(error.code || "") ? error.code : "unverified",
    });
    return page(
      res,
      403,
      "We could not verify Staff Access. Return to People or sign in again.",
    );
  }
}
