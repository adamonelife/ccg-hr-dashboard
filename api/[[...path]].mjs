// api/[[...path]].mjs
//
// Single catch-all Vercel function — this is the ONLY file in /api. Keeps us
// under the Hobby plan's 12-function cap the same way Ops Dash does it.
// All real logic lives in /lib and gets imported + registered below.
//
// Routing: mirrors Ops Dash's actual (working) pattern, not the naive
// version that shipped in the first cut of this file. Outside Next.js,
// Vercel's automatic bracket-file dynamic segments (req.query.path) aren't
// reliably populated without an explicit rewrite — Ops Dash sidesteps this
// entirely by parsing the real request path straight out of req.url, and
// only falls back to req.query.path if that comes up empty. vercel.json has
// a matching explicit rewrite that forces every /api/* request to this
// function regardless of how Vercel's own bracket-matching would resolve
// it on its own.
//
// Body parsing: bodyParser is off (see vercel.json) so we control it here.
// Routes that need the raw, unparsed body (e.g. webhook HMAC verification)
// go in RAW_BODY_ROUTES and get req.rawBody instead of req.body.

import { handleHealth } from '../lib/health.mjs';
import { handleLogin, handleLogout, handleMe, requireAuth, requireRole } from '../lib/auth.mjs';
import { handleEmployees } from '../lib/employees.mjs';
import { handleOrgChart } from '../lib/org.mjs';
import { handleSalaryHistory } from '../lib/salary-history.mjs';
import { handlePromotionHistory } from '../lib/promotion-history.mjs';

export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
};

// Routes that must receive the raw body untouched (webhook signature checks).
// Example once you add one: new Set(['webhooks/slack-events'])
const RAW_BODY_ROUTES = new Set([]);

// name -> handler. Add every new endpoint here.
// Wrap anything sensitive in requireAuth(...) — everything except
// health/auth/login should be wrapped once real HR data is involved.
const routes = {
  health: handleHealth,
  'auth/login': handleLogin,
  'auth/logout': handleLogout,
  'auth/me': handleMe,

  // Phase 1 — Employee Directory / Employment / Organisation Structure
  employees: requireAuth(handleEmployees),
  'org-chart': requireAuth(handleOrgChart),
  'salary-history': requireRole('administrator', 'hr', 'finance')(handleSalaryHistory),
  'promotion-history': requireRole('administrator', 'hr')(handlePromotionHistory),
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  const pathname = new URL(req.url, `https://${req.headers.host}`).pathname;
  let segments = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  if (segments.length === 0 && req.query.path) {
    const raw = req.query.path;
    segments = Array.isArray(raw) ? raw : String(raw).split('/').filter(Boolean);
  }
  const routeName = segments.join('/');

  const fn = routes[routeName];
  if (!fn) {
    res.status(404).json({ error: `No route for "${routeName}"` });
    return;
  }

  try {
    if (RAW_BODY_ROUTES.has(routeName)) {
      req.rawBody = await readRawBody(req);
    } else if (req.method !== 'GET' && req.method !== 'HEAD') {
      const raw = await readRawBody(req);
      if (raw.length) {
        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          try {
            req.body = JSON.parse(raw.toString('utf8'));
          } catch {
            res.status(400).json({ error: 'Invalid JSON body' });
            return;
          }
        } else {
          req.rawBody = raw;
        }
      } else {
        req.body = {};
      }
    }

    await fn(req, res);
  } catch (err) {
    console.error(`[api/${routeName}]`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
