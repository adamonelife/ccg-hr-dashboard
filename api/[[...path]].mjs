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
import { handleLogin, handleLogout, handleMe, handleSetPassword, requireAuth, requireRole } from '../lib/auth.mjs';
import { handleEmployees } from '../lib/employees.mjs';
import { handleOrgChart, handleOrgUnits } from '../lib/org.mjs';
import { handleSalaryHistory } from '../lib/salary-history.mjs';
import { handlePromotionHistory } from '../lib/promotion-history.mjs';
import { handleSkills } from '../lib/skills.mjs';
import { handleMigrateFromSheets } from '../lib/migrate.mjs';
import { handleOrgCleanup } from '../lib/org-cleanup.mjs';
import { handleAccounts } from '../lib/accounts.mjs';
import { handleLeaveBalances, handleLeaveRequests } from '../lib/leave.mjs';
import { handlePersonalDocuments, handleCompanyDocuments } from '../lib/documents.mjs';
import { handleChangeRequests } from '../lib/change-requests.mjs';

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
  // Public — no session exists yet when someone's setting their password
  // for the first time (or resetting it) via a one-time link.
  'auth/set-password': handleSetPassword,

  // Phase 1 — Employee Directory / Employment / Organisation Structure
  employees: requireAuth(handleEmployees),
  'org-chart': requireAuth(handleOrgChart),
  // org-units now supports create/assign-lead/delete too (see lib/org.mjs).
  // Left as requireAuth here rather than requireRole, because GET still
  // needs to be reachable by anyone filling out the Employee form
  // (department/team dropdowns) — handleOrgUnits itself checks
  // session.role for the mutating methods (POST/PATCH/DELETE) instead of
  // gating the whole route.
  'org-units': requireAuth(handleOrgUnits),
  'salary-history': requireRole('Administrator', 'HR', 'Finance')(handleSalaryHistory),
  'promotion-history': requireRole('Administrator', 'HR')(handlePromotionHistory),
  // skills is requireAuth, not requireRole — visibility is scoped per
  // employee inside lib/skills.mjs (lib/permissions.mjs's canView), not a
  // flat role gate, since a Team Lead needs access to their own team's
  // skills but nobody else's.
  skills: requireAuth(handleSkills),

  // One-time admin operation: copies the old HR Google Sheet into Postgres.
  // GET so it can be triggered by visiting the URL directly in a browser
  // tab while logged in — see lib/migrate.mjs for the safety/re-run notes.
  'admin/migrate-from-sheets': requireRole('Administrator')(handleMigrateFromSheets),

  // One-time-ish data fix: retype the old "Company" org units to "Team"
  // (CC/CC Landscape/Pelago are separate companies externally but just
  // teams internally) and set a custom sort_order for Operations' direct
  // children so the creative companies group together. See
  // lib/org-cleanup.mjs. Same "visit the URL" pattern, safe to re-run.
  'admin/org-cleanup': requireRole('Administrator')(handleOrgCleanup),

  // Phase 3 — who has a login. See lib/accounts.mjs.
  'admin/accounts': requireRole('Administrator')(handleAccounts),

  // Phase 3 — Leave Management. Both requireAuth, not requireRole — fine-
  // grained checks (who can view/submit/approve what) live inside
  // lib/leave.mjs itself, same pattern as skills/org-units.
  'leave-requests': requireAuth(handleLeaveRequests),
  'leave-balances': requireAuth(handleLeaveBalances),

  // Phase 2 — Documents (personal + company, built together). Both
  // requireAuth, not requireRole — same reasoning as skills/org-units/
  // leave: visibility and mutate-rights are per-row/per-role checks inside
  // lib/documents.mjs itself, not a flat route-level gate. Both tables are
  // created defensively (CREATE TABLE IF NOT EXISTS) the first time
  // they're queried, so no separate migration visit is needed.
  documents: requireAuth(handlePersonalDocuments),
  'company-documents': requireAuth(handleCompanyDocuments),

  // Phase 3 — self-service change requests (first-login setup gate +
  // permanent HR-approval workflow for further self-edits to profile/
  // skills data). requireAuth, not requireRole — handleChangeRequests
  // itself checks FULL_VISIBILITY_ROLES for the review queue (GET
  // ?scope=queue) and the approve/reject PATCH, and checks "is this your
  // own record" for the plain GET ?employeeId=. See lib/change-requests.mjs.
  'change-requests': requireAuth(handleChangeRequests),
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
