// Run serially: permission fixtures deliberately change the same synthetic actor.
import fs from 'node:fs/promises';
import {runHostedCase} from './hosted-runner.mjs';
import {sql} from './hosted-common.mjs';
const output=new URL('../../../output/people-staff-access-hosted-qa/http-results.json',import.meta.url);
let results=[];try{results=JSON.parse(await fs.readFile(output,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
try{for(const name of process.argv.slice(2)){
 const row={...(await runHostedCase(name)),verifiedAt:new Date().toISOString(),transport:'Direct HTTPS to protected immutable Vercel Preview; real Supabase provider/database'};
 results.push(row);await fs.writeFile(output,JSON.stringify(results,null,2));console.log(JSON.stringify(row));if(!row.ok){process.exitCode=1;break;}
}}finally{await sql.end();}
