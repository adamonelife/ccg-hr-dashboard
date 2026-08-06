// lib/health.mjs — simple unauthenticated liveness check, useful for uptime
// monitors and for confirming a fresh deploy actually booted.
export async function handleHealth(req, res) {
  res.status(200).json({ ok: true, time: new Date().toISOString() });
}
