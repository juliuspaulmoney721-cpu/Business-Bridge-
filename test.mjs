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
