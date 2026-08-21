import { supabase } from './supabase.js';

const localRead=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
const localWrite=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const MSG='pixora_messages', NOTIF='pixora_notifications';

export async function session(){ const {data}=await supabase.auth.getSession(); return data.session; }
export async function user(){ const s=await session(); return s?.user||null; }
export function localMe(){
  return localRead('pixora_profile',{name:localStorage.getItem('bb_name')||'Pixora User',username:localStorage.getItem('bb_username')||'pixorauser',avatar:'',cover:'',bio:''});
}
export async function ensureProfile(){
  const u=await user(); if(!u)return null;
  const m=u.user_metadata||{}, base=(u.email?.split('@')[0]||'pixorauser').toLowerCase().replace(/[^a-z0-9._]/g,'').slice(0,30)||'pixorauser';
  const p={id:u.id,name:m.name||localMe().name||base,username:(m.username||localMe().username||base).replace(/^@/,'').toLowerCase(),bio:m.bio||'',avatar:m.avatar||'',cover:m.cover||''};
  localWrite('pixora_profile',p);localStorage.setItem('bb_name',p.name);localStorage.setItem('bb_username',p.username);localStorage.setItem('bb_email',u.email||'');
  const cached=localRead('pixora_profiles',[]); const ix=cached.findIndex(x=>x.username===p.username||x.id===p.id); if(ix>=0) cached[ix]={...cached[ix],...p}; else cached.push(p); localWrite('pixora_profiles',cached);
  try{await supabase.from('profiles').upsert(p,{onConflict:'id'});}catch(e){/* local fallback when schema is not installed */}
  return p;
}
export async function findProfiles(q=''){
  q=q.trim().toLowerCase();
  try{
    let query=supabase.from('profiles').select('id,name,username,bio,avatar,cover').order('name').limit(50);
    if(q) query=query.or(`name.ilike.%${q}%,username.ilike.%${q}%`);
    const {data,error}=await query; if(!error&&data?.length)return data;
  }catch{}
  const all=localRead('pixora_profiles',[]); return all.filter(p=>!q||String(p.name).toLowerCase().includes(q)||String(p.username).toLowerCase().includes(q));
}
export async function createNotification(recipientId,type,actorId,actorName,text,meta={}){
  if(!recipientId||recipientId===actorId)return;
  try{const {error}=await supabase.from('notifications').insert({recipient_id:recipientId,actor_id:actorId,type,actor_name:actorName,text,meta});if(!error)return;}catch{}
  const all=localRead(NOTIF,{});all[recipientId]=all[recipientId]||[];all[recipientId].unshift({id:crypto.randomUUID?.()||String(Date.now()),recipient_id:recipientId,actor_id:actorId,type,actor_name:actorName,text,meta,created_at:new Date().toISOString(),read:false});localWrite(NOTIF,all);
}
export async function getNotifications(){
  const u=await user();if(!u)return[];
  try{const {data,error}=await supabase.from('notifications').select('*').eq('recipient_id',u.id).order('created_at',{ascending:false}).limit(100);if(!error)return data||[];}catch{}
  return (localRead(NOTIF,{})[u.id]||[]).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
}
export async function markNotificationsRead(){
  const u=await user();if(!u)return;
  try{await supabase.from('notifications').update({read:true}).eq('recipient_id',u.id).eq('read',false);}catch{}
  const all=localRead(NOTIF,{});if(all[u.id]){all[u.id]=all[u.id].map(n=>({...n,read:true}));localWrite(NOTIF,all)}
}
export async function unreadCount(){return (await getNotifications()).filter(n=>!n.read).length;}
export async function sendMessage(recipient,body){
  const u=await user(), me=await ensureProfile(); if(!u||!recipient?.id)throw new Error('Please log in first.');
  const row={sender_id:u.id,recipient_id:recipient.id,body:String(body).trim()};
  try{const {data,error}=await supabase.from('messages').insert(row).select('*').single();if(!error){await createNotification(recipient.id,'message',u.id,me?.name||'Someone',`sent you a message`,{message_id:data.id});return data;}}catch{}
  const all=localRead(MSG,[]);const item={...row,id:crypto.randomUUID?.()||String(Date.now()),created_at:new Date().toISOString()};all.push(item);localWrite(MSG,all);await createNotification(recipient.id,'message',u.id,me?.name||'Someone','sent you a message',{message_id:item.id});return item;
}
export async function getConversation(otherId){
  const u=await user();if(!u)return[];
  try{const {data,error}=await supabase.from('messages').select('*').or(`and(sender_id.eq.${u.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${u.id})`).order('created_at',{ascending:true});if(!error)return data||[];}catch{}
  return localRead(MSG,[]).filter(m=>(m.sender_id===u.id&&m.recipient_id===otherId)||(m.sender_id===otherId&&m.recipient_id===u.id)).sort((a,b)=>a.created_at.localeCompare(b.created_at));
}
export async function getConversations(){
  const u=await user();if(!u)return[];
  let msgs=[];
  try{const {data,error}=await supabase.from('messages').select('*').or(`sender_id.eq.${u.id},recipient_id.eq.${u.id}`).order('created_at',{ascending:false});if(!error)msgs=data||[];}catch{}
  if(!msgs.length)msgs=localRead(MSG,[]).filter(m=>m.sender_id===u.id||m.recipient_id===u.id).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const ids=[...new Set(msgs.map(m=>m.sender_id===u.id?m.recipient_id:m.sender_id))];
  const profiles=await findProfiles('');const map=new Map(profiles.map(p=>[p.id,p]));
  return ids.map(id=>({profile:map.get(id)||{id,name:'Pixora User',username:'user',avatar:''},message:msgs.find(m=>(m.sender_id===id||m.recipient_id===id))}));
}
