import { supabase } from './supabase.js';

const localRead=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
const localWrite=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const cleanUsername=v=>String(v||'pixorauser').replace(/^@/,'').toLowerCase().replace(/[^a-z0-9._]/g,'').slice(0,30)||'pixorauser';

export async function session(){const {data,error}=await supabase.auth.getSession();if(error)throw error;return data.session;}
export async function user(){const s=await session();return s?.user||null;}
export function localMe(){return localRead('pixora_profile',{name:localStorage.getItem('bb_name')||'Pixora User',username:localStorage.getItem('bb_username')||'pixorauser',avatar:'',cover:'',bio:''});}
export async function ensureProfile(){
  const u=await user();if(!u)return null;
  const m=u.user_metadata||{},local=localMe();
  const {data:existing,error}=await supabase.from('profiles').select('id,name,username,bio,avatar_url,cover_url,account_type').eq('id',u.id).maybeSingle();
  if(error)throw new Error('Pixora database is not set up yet. Run schema.sql in Supabase SQL Editor once. '+error.message);
  const base=cleanUsername(existing?.username||m.username||local.username||u.email?.split('@')[0]);
  const p={id:u.id,name:m.name||existing?.name||local.name||base,username:base,bio:m.bio??existing?.bio??local.bio??'',avatar_url:m.avatar??existing?.avatar_url??local.avatar??'',cover_url:m.cover??existing?.cover_url??local.cover??'',account_type:m.account_type??existing?.account_type??'Creator'};
  const {data:saved,error:saveError}=await supabase.from('profiles').upsert(p,{onConflict:'id'}).select('id,name,username,bio,avatar_url,cover_url,account_type').single();
  if(saveError)throw saveError;
  localWrite('pixora_profile',saved);localStorage.setItem('bb_name',saved.name);localStorage.setItem('bb_username',saved.username);localStorage.setItem('bb_email',u.email||'');return saved;
}
export async function findProfiles(q=''){
  const value=q.trim().replace(/[%(),]/g,'').toLowerCase();let query=supabase.from('profiles').select('id,name,username,bio,avatar_url,cover_url').order('name').limit(50);if(value)query=query.or(`name.ilike.%${value}%,username.ilike.%${value}%`);const {data,error}=await query;if(error)throw error;return data||[];
}
export async function createNotification(recipientId,type,actorId,actorName,text,meta={}){
  if(!recipientId||recipientId===actorId)return;
  const {error}=await supabase.from('notifications').insert({recipient_id:recipientId,actor_id:actorId,type,message:text,post_id:meta.post_id||null});
  if(error)throw error;
}
export async function getNotifications(){const u=await user();if(!u)return[];const {data,error}=await supabase.from('notifications').select('id,recipient_id,actor_id,type,message,post_id,created_at,read_at').eq('recipient_id',u.id).order('created_at',{ascending:false}).limit(100);if(error)throw error;return data||[];}
export async function markNotificationsRead(){const u=await user();if(!u)return;const {error}=await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('recipient_id',u.id).is('read_at',null);if(error)throw error;}
export async function unreadCount(){return(await getNotifications()).filter(n=>!n.read_at).length;}
export async function sendMessage(recipient,body){const u=await user();if(!u||!recipient?.id)throw new Error('Please log in first.');const text=String(body||'').trim();if(!text)throw new Error('Write a message first.');const {data,error}=await supabase.from('messages').insert({sender_id:u.id,recipient_id:recipient.id,body:text}).select('*').single();if(error)throw error;return data;}
export async function getConversation(otherId){const u=await user();if(!u)return[];const {data,error}=await supabase.from('messages').select('*').or(`and(sender_id.eq.${u.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${u.id})`).order('created_at',{ascending:true});if(error)throw error;return data||[];}
export async function getConversations(){const u=await user();if(!u)return[];const {data:msgs,error}=await supabase.from('messages').select('*').or(`sender_id.eq.${u.id},recipient_id.eq.${u.id}`).order('created_at',{ascending:false});if(error)throw error;if(!msgs?.length)return[];const ids=[...new Set(msgs.map(m=>m.sender_id===u.id?m.recipient_id:m.sender_id))];const {data:profiles}=await supabase.from('profiles').select('id,name,username,avatar_url').in('id',ids);const map=new Map((profiles||[]).map(p=>[p.id,p]));return ids.map(id=>({profile:map.get(id)||{id,name:'Pixora User',username:'user',avatar_url:''},message:msgs.find(m=>m.sender_id===id||m.recipient_id===id)}));}
export async function followUser(targetId){const u=await user();if(!u)throw new Error('Please log in first.');if(u.id===targetId)return false;const {error}=await supabase.from('follows').upsert({follower_id:u.id,following_id:targetId},{onConflict:'follower_id,following_id'});if(error)throw error;return true;}
export async function unfollowUser(targetId){const u=await user();if(!u)return false;const {error}=await supabase.from('follows').delete().eq('follower_id',u.id).eq('following_id',targetId);if(error)throw error;return true;}
export async function isFollowing(targetId){const u=await user();if(!u)return false;const {data,error}=await supabase.from('follows').select('follower_id').eq('follower_id',u.id).eq('following_id',targetId).maybeSingle();if(error)throw error;return!!data;}
export function subscribeToConversation(otherId,callback){return supabase.channel('pixora-chat-'+otherId+'-'+Date.now()).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},payload=>callback(payload.new)).subscribe();}
export function subscribeToNotifications(callback){return supabase.channel('pixora-notifications-'+Date.now()).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications'},payload=>callback(payload.new)).subscribe();}
export function removeChannel(channel){try{supabase.removeChannel(channel)}catch{}}
