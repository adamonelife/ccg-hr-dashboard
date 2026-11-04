import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";
import { prepareStaffAccess } from "../integrations/staff-access/prepare-source.mjs";
import { createPeopleBroker } from "../integrations/staff-access/people-broker.mjs";
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
test("Companion broker defaults OFF without network or redirects", async () => {
  let called = false;
  const broker = createPeopleBroker({
    env: {},
    transport: async () => {
      called = true;
      throw new Error("unexpected network");
    },
  });
  assert.equal(await broker.entitlement({}), null);
  await assert.rejects(broker.launch({}, {}, {}));
  assert.equal(called, false);
});
test("Preparation pins API and launcher revisions, preserves source and rejects overlapping destinations", async () => {
  const root = await mkdtemp(join(tmpdir(), "people-broker-"));
  try {
    const source = join(root, "source"),
      destination = join(root, "prepared");
    await mkdir(source + "/api", { recursive: true });
    await mkdir(source + "/lib", { recursive: true });
    const api = [
      "const SECRET=()=>process.env.NALLIN_SSO_SECRET;",
      "try{return await supabase('/functions/v1/nallin-staff-admin?scope=access',{headers:{Authorization:`Bearer ${session.accessToken}`,'x-region':'ap-northeast-2'}})}finally",
      "function handoff(res,session,resolved,module,returnTo){",
      "module:MODULES.includes(query.module)?query.module:null,",
      "choice.module,query.return)",
      "choice.module,state.returnTo)",
    ].join("\n");
    const visual =
      "moduleCard(key,modules[key].state==='COMING_SOON'?'COMING_SOON':'AVAILABLE');if(state==='AVAILABLE'&&m.state==='COMING_SOON')";
    await writeFile(source + "/api/index.js", api);
    await writeFile(source + "/lib/nallin-visual.cjs", visual);
    await assert.rejects(
      prepareStaffAccess(source, source, hash(api), hash(visual)),
    );
    await assert.rejects(
      prepareStaffAccess(source, destination, hash("wrong"), hash(visual)),
    );
    await assert.rejects(
      prepareStaffAccess(source, destination, hash(api), hash("wrong")),
    );
    const result = await prepareStaffAccess(
      source,
      destination,
      hash(api),
      hash(visual),
    );
    assert.equal(result.productionChanged, false);
    assert.equal(await readFile(source + "/api/index.js", "utf8"), api);
    assert.equal(
      await readFile(source + "/lib/nallin-visual.cjs", "utf8"),
      visual,
    );
    const prepared = await readFile(destination + "/api/index.js", "utf8");
    assert(
      prepared.includes(
        "peopleEnabled=()=>process.env.PEOPLE_STAFF_ACCESS_ENABLED==='true'",
      ),
    );
    assert(prepared.includes("peopleState"));
    assert(
      (await readFile(destination + "/lib/nallin-visual.cjs", "utf8")).includes(
        "granted.has('hr')?'AVAILABLE'",
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
