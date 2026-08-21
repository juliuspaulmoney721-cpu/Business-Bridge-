import { supabase } from './supabase.js';

export async function currentUser(){
  const {data,error}=await supabase.auth.getUser();
  if(error) throw error;
  return data.user;
}

export async function ensureProfile(user){
  if(!user) return null;
  const meta=user.user_metadata||{};
  const {data:existing}=await supabase.from('profiles').select('*').eq('id',user.id).maybeSingle();
  if(existing) return existing;
  const base=(meta.username || meta.name || user.email?.split('@')[0] || 'pixorauser')
    .toString().toLowerCase().replace(/[^a-z0-9._]/g,'').slice(0,30) || 'pixorauser';
  let username=base;
  for(let i=0;i<20;i++){
    const {data:found}=await supabase.from('profiles').select('id').eq('username',username).maybeSingle();
    if(!found) break;
    username=(base.slice(0,24)+'_'+Math.floor(1000+Math.random()*9000)).slice(0,30);
  }
  const profile={id:user.id,name:meta.name||base,username,bio:meta.bio||'',avatar_url:meta.avatar||'',cover_url:meta.cover||'',account_type:meta.account_type||'Creator'};
  const {data,error}=await supabase.from('profiles').upsert(profile,{onConflict:'id'}).select().single();
  if(error) throw error;
  return data;
}

export async function myProfile(){ return ensureProfile(await currentUser()); }
export async function getProfileByUsername(username){
  const {data,error}=await supabase.from('profiles').select('*').eq('username',username.replace(/^@/,'').toLowerCase()).maybeSingle();
  if(error) throw error; return data;
}
export async function searchProfiles(q){
  const {data,error}=await supabase.from('profiles').select('*').or(`name.ilike.%${q}%,username.ilike.%${q}%`).order('name').limit(50);
  if(error) throw error; return data||[];
}
export async function updateProfile(values){
  const user=await currentUser();
  const payload={name:values.name,username:values.username.toLowerCase(),bio:values.bio||'',avatar_url:values.avatar_url||'',cover_url:values.cover_url||''};
  const {data,error}=await supabase.from('profiles').update(payload).eq('id',user.id).select().single();
  if(error) throw error; return data;
}
export async function uploadImage(file,folder='uploads'){
  const user=await currentUser();
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  const path=`${user.id}/${folder}/${crypto.randomUUID()}.${ext}`;
  const {error}=await supabase.storage.from('pixora-media').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg'});
  if(error) throw error;
  const {data}=supabase.storage.from('pixora-media').getPublicUrl(path);
  return data.publicUrl;
}
export async function listPosts(){
  const {data,error}=await supabase.from('posts').select('*,profiles:author_id(id,name,username,avatar_url)').order('created_at',{ascending:false}).limit(100);
  if(error) throw error; return data||[];
}
export async function createPost({caption,imageUrl}){
  const user=await currentUser();
  const {data,error}=await supabase.from('posts').insert({author_id:user.id,caption:caption||'',image_url:imageUrl||null}).select().single();
  if(error) throw error; return data;
}
export async function toggleLike(postId){
  const user=await currentUser();
  const {data:like}=await supabase.from('post_likes').select('post_id').eq('post_id',postId).eq('user_id',user.id).maybeSingle();
  if(like){ const {error}=await supabase.from('post_likes').delete().eq('post_id',postId).eq('user_id',user.id); if(error)throw error; return false; }
  const {error}=await supabase.from('post_likes').insert({post_id:postId,user_id:user.id}); if(error)throw error; return true;
}
export async function isFollowing(userId){
  const me=await currentUser(); const {data,error}=await supabase.from('follows').select('follower_id').eq('follower_id',me.id).eq('following_id',userId).maybeSingle(); if(error)throw error; return !!data;
}
export async function toggleFollow(userId){
  const me=await currentUser(); if(me.id===userId)return false;
  const {data}=await supabase.from('follows').select('follower_id').eq('follower_id',me.id).eq('following_id',userId).maybeSingle();
  if(data){const {error}=await supabase.from('follows').delete().eq('follower_id',me.id).eq('following_id',userId);if(error)throw error;return false;}
  const {error}=await supabase.from('follows').insert({follower_id:me.id,following_id:userId});if(error)throw error;return true;
}
export async function getCounts(userId){
  const [{count:followers},{count:following},{count:posts}]=await Promise.all([
    supabase.from('follows').select('*',{count:'exact',head:true}).eq('following_id',userId),
    supabase.from('follows').select('*',{count:'exact',head:true}).eq('follower_id',userId),
    supabase.from('posts').select('*',{count:'exact',head:true}).eq('author_id',userId)
  ]); return {followers:followers||0,following:following||0,posts:posts||0};
}
export async function listConversations(){
  const me=await currentUser();
  const {data,error}=await supabase.from('messages').select('*,sender:sender_id(id,name,username,avatar_url),recipient:recipient_id(id,name,username,avatar_url)').or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`).order('created_at',{ascending:false}).limit(200);
  if(error)throw error;
  const map=new Map();
  for(const m of data||[]){const other=m.sender_id===me.id?m.recipient:m.sender;if(!other)continue;if(!map.has(other.id))map.set(other.id,{user:other,last:m});}
  return [...map.values()];
}
export async function listMessages(otherId){
  const me=await currentUser();
  const {data,error}=await supabase.from('messages').select('*,sender:sender_id(id,name,username,avatar_url),recipient:recipient_id(id,name,username,avatar_url)').or(`and(sender_id.eq.${me.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${me.id})`).order('created_at',{ascending:true});
  if(error)throw error;
  await supabase.from('messages').update({read_at:new Date().toISOString()}).eq('sender_id',otherId).eq('recipient_id',me.id).is('read_at',null);
  return data||[];
}
export async function sendMessage(recipientId,body){
  const me=await currentUser();
  const text=body.trim(); if(!text) return null;
  const {data,error}=await supabase.from('messages').insert({sender_id:me.id,recipient_id:recipientId,body:text}).select().single();
  if(error)throw error; return data;
}
export async function listNotifications(){
  const me=await currentUser();
  const {data,error}=await supabase.from('notifications').select('*,actor:actor_id(id,name,username,avatar_url)').eq('recipient_id',me.id).order('created_at',{ascending:false}).limit(100);
  if(error)throw error; return data||[];
}
export async function markNotificationsRead(){const me=await currentUser();const {error}=await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('recipient_id',me.id).is('read_at',null);if(error)throw error;}
export async function unreadCounts(){
  const me=await currentUser();
  const {count:notifications}=await supabase.from('notifications').select('*',{count:'exact',head:true}).eq('recipient_id',me.id).is('read_at',null);
  const {count:messages}=await supabase.from('messages').select('*',{count:'exact',head:true}).eq('recipient_id',me.id).is('read_at',null);
  return {notifications:notifications||0,messages:messages||0};
}
export async function createStory({caption,imageUrl}){const user=await currentUser();const {data,error}=await supabase.from('stories').insert({author_id:user.id,caption:caption||'',image_url:imageUrl||null}).select().single();if(error)throw error;return data;}
export async function listStories(){const {data,error}=await supabase.from('stories').select('*,profiles:author_id(id,name,username,avatar_url)').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false});if(error)throw error;return data||[];}
