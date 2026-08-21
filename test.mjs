import fs from 'node:fs';

const required = [
  'index.html','login.html','signup.html','dashboard.html','search.html','create.html',
  'chat.html','messages.html','notifications.html','profile.html','app.js',
  'pixora-api.js','supabase.js','schema.sql','sw.js'
];

const root = new URL('.', import.meta.url).pathname;
let ok = true;

for(const file of required){
  if(!fs.existsSync(root + file)){
    console.error('Missing', file);
    ok = false;
  }
}

const api = fs.readFileSync(root + 'pixora-api.js','utf8');
const forbidden = [
  "from('post_likes')",
  "from('stories')",
  'recipient_id',
  "from('profiles').select('id').eq('id',"
];
for(const bad of forbidden){
  if(api.includes(bad)){
    console.error('Unexpected old database reference:', bad);
    ok = false;
  }
}

for(const requiredText of [
  "from('posts')",
  "from('follows')",
  "from('conversation_members')",
  "from('messages')",
  "from('notifications')",
  "from('posts')"
]){
  if(!api.includes(requiredText)){
    console.error('Missing backend reference:', requiredText);
    ok = false;
  }
}

if(!ok) process.exit(1);
console.log('Pixora source smoke test passed.');

const api2 = fs.readFileSync(root + 'pixora-api.js','utf8');
if(!api2.includes('author_id: user.id') || !api2.includes('user_id: user.id')){
  console.error('Post publishing fallback is missing author_id/user_id handling');
  process.exit(1);
}
const sw = fs.readFileSync(root + 'sw.js','utf8');
if(!sw.includes("pixora-v10") || !sw.includes("key.startsWith('pixora-')")){
  console.error('Cache-busting service worker is missing');
  process.exit(1);
}
const schema = fs.readFileSync(root + 'schema.sql','utf8');
if(!schema.includes("drop policy if exists") || !schema.includes('set row_security = off')){
  console.error('Supabase policy repair is missing');
  process.exit(1);
}
console.log('Pixora repair regression checks passed.');
