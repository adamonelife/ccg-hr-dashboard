// Canonical Staff Access companion. Install in its reviewed deployment behind
// its own OFF-by-default flag; not imported by the People application.
import crypto from "node:crypto";
import {getVercelOidcToken} from '@vercel/oidc';
export function createPeopleBroker({ env = process.env, transport = fetch }) {
  const enabled = () => env.PEOPLE_STAFF_ACCESS_ENABLED === "true";
  function origin() {
    const url = new URL(env.NALLIN_PEOPLE_URL);
    if (
      (url.protocol !== "https:" &&
        !(
          env.PEOPLE_STAFF_ACCESS_ENVIRONMENT === "development" &&
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        )) ||
      url.origin !== env.NALLIN_PEOPLE_URL
    )
      throw new Error("Invalid People origin");
    return url.origin;
  }
  async function call(action, body) {
    if (
      !enabled() ||
      !env.PEOPLE_BROKER_SECRET ||
      env.PEOPLE_BROKER_SECRET.length < 32
    )
      throw new Error("People disabled");
    const data = JSON.stringify(body),
      timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto
      .createHmac("sha256", env.PEOPLE_BROKER_SECRET)
      .update(timestamp + "\n" + data)
      .digest("hex");
    let machineToken;
    if(env.VERCEL_ENV){try{machineToken=await getVercelOidcToken();}catch{}}
    const response = await transport(origin() + "/api/nallin-sso/" + action, {
      method: "POST",
      headers: {
        ...(machineToken ? {'x-vercel-trusted-oidc-idp-token':machineToken} : {}),
        "content-type": "application/json",
        "x-people-timestamp": timestamp,
        "x-people-signature": signature,
      },
      body: data,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("People access denied");
    return response.json();
  }
  return {
    async entitlement(session) {
      if (!enabled()) return null;
      try {
        return await call("access", { accessToken: session.accessToken });
      } catch {
        return null;
      }
    },
    async launch(session, query, res) {
      if (!enabled()) throw new Error("People disabled");
      if (!/^[a-f0-9]{64}$/.test(query.people_state || "")) {
        res.statusCode = 303;
        res.setHeader("Location", origin() + "/api/nallin-sso/start");
        return res.end();
      }
      // Existing Staff Access must supply a server-validated subject, never query data.
      const { state, code } = await call("issue", {
        state: query.people_state,
        accessToken: session.accessToken,
        subject: session.subject,
      });
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.statusCode = 303;
      res.setHeader(
        "Location",
        origin() +
          "/api/nallin-sso/entry#" +
          new URLSearchParams({ state, code }),
      );
      return res.end();
    },
  };
}
