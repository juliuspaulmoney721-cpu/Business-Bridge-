import fs from 'node:fs';
const required=['index.html','login.html','signup.html','dashboard.html','search.html','create.html','chat.html','messages.html','notifications.html','profile.html','app.js','pixora-api.js','supabase.js','schema.sql'];
const root=new URL('.',import.meta.url).pathname;
let ok=true;
for(const f of required){if(!fs.existsSync(root+f)){console.error('Missing',f);ok=false;}}
const api=fs.readFileSync(root+'pixora-api.js','utf8');
for(const bad of ["profiles:author_id","sender:sender_id","recipient:recipient_id","actor:actor_id","select('*,profiles:"]){if(api.includes(bad)){console.error('Unexpected relationship query',bad);ok=false;}}
if(!api.includes("from('notifications')")||!api.includes("read_at")){console.error('Notification code missing');ok=false;}
if(!ok)process.exit(1);
console.log('Pixora source smoke test passed.');
