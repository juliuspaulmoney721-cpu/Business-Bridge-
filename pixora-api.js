import { supabase } from './supabase.js';

const PROFILE_FIELDS = 'id,name,username,bio,avatar_url,cover_url,account_type,created_at';

function cleanUsername(value){
  return String(value || 'pixorauser').replace(/^@/,'').toLowerCase().replace(/[^a-z0-9._]/g,'').slice(0,30) || 'pixorauser';
}
function errorMessage(error, fallback='Pixora database error'){
  return error?.message ? `${fallback}: ${error.message}` : fallback;
}

export async function currentUser(){
  const {data,error}=await supabase.auth.getUser();
  if(error) throw error;
  return data.user;
}

export async function ensureProfile(user){
  if(!user) return null;
  const meta=user.user_metadata||{};
  const {data:existing,error:readError}=await supabase.from('profiles').select(PROFILE_FIELDS).eq('id',user.id).maybeSingle();
  if(readError) throw new Error(errorMessage(readError,'Pixora profiles table is not ready. Run schema.sql once in Supabase SQL Editor'));
  if(existing) return existing;

  const base=cleanUsername(meta.username || meta.name || user.email?.split('@')[0]);
  let username=base;
  for(let i=0;i<50;i++){
    const {data:found,error}=await supabase.from('profiles').select('id').eq('username',username).maybeSingle();
    if(error) throw new Error(errorMessage(error,'Could not check Pixora username'));
    if(!found) break;
    username=cleanUsername(`${base.slice(0,24)}_${Math.floor(1000+Math.random()*9000)}`);
  }
  const profile={id:user.id,name:meta.name||base,username,bio:meta.bio||'',avatar_url:meta.avatar||'',cover_url:meta.cover||'',account_type:meta.account_type||'Creator'};
  const {data,error}=await supabase.from('profiles').upsert(profile,{onConflict:'id'}).select(PROFILE_FIELDS).single();
  if(error) throw new Error(errorMessage(error,'Could not create your Pixora profile'));
  return data;
}

export async function myProfile(){ return ensureProfile(await currentUser()); }

export async function getProfileByUsername(username){
  const key=cleanUsername(username);
  if(!key) return null;
  const {data,error}=await supabase.from('profiles').select(PROFILE_FIELDS).eq('username',key).maybeSingle();
  if(error) throw new Error(errorMessage(error,'Could not load this Pixora profile'));
  return data;
}

export async function searchProfiles(q=''){
  const value=String(q||'').trim().replace(/[%(),]/g,'');
  let query=supabase.from('profiles').select(PROFILE_FIELDS).order('name').limit(50);
  if(value) query=query.or(`name.ilike.%${value}%,username.ilike.%${value}%`);
  const {data,error}=await query;
  if(error) throw new Error(errorMessage(error,'Could not search Pixora users'));
  return data||[];
}

export async function updateProfile(values){
  const user=await currentUser();
  const username=cleanUsername(values.username);
  const payload={name:String(values.name||'Pixora User').trim()||'Pixora User',username,bio:String(values.bio||''),avatar_url:values.avatar_url||'',cover_url:values.cover_url||''};
  const {data,error}=await supabase.from('profiles').update(payload).eq('id',user.id).select(PROFILE_FIELDS).single();
  if(error) throw new Error(errorMessage(error,'Could not update your Pixora profile'));
  return data;
}

export async function uploadImage(file,folder='uploads'){
  const user=await currentUser();
  if(!user) throw new Error('Please log in first.');
  if(!file) throw new Error('Choose an image first.');
  const ext=(file.name?.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
  const path=`${user.id}/${folder}/${crypto.randomUUID()}.${ext}`;
  const {error}=await supabase.storage.from('pixora-media').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg'});
  if(error) throw new Error(errorMessage(error,'Image upload failed. Make sure the pixora-media bucket exists by running schema.sql.'));
  return supabase.storage.from('pixora-media').getPublicUrl(path).data.publicUrl;
}

async function getProfilesByIds(ids){
  const unique=[...new Set((ids||[]).filter(Boolean))];
  if(!unique.length) return new Map();
  const {data,error}=await supabase.from('profiles').select(PROFILE_FIELDS).in('id',unique);
  if(error) throw new Error(errorMessage(error,'Could not load Pixora profiles'));
  return new Map((data||[]).map(p=>[p.id,p]));
}

export async function listPosts(){
  const {data:posts,error}=await supabase.from('posts').select('id,author_id,caption,image_url,created_at').order('created_at',{ascending:false}).limit(100);
  if(error) throw new Error(errorMessage(error,'Could not load Pixora posts'));
  const profiles=await getProfilesByIds((posts||[]).map(p=>p.author_id));
  return (posts||[]).map(p=>({...p,profiles:profiles.get(p.author_id)||null}));
}

export async function createPost({caption,imageUrl}){
  const user=await currentUser();
  const {data,error}=await supabase.from('posts').insert({author_id:user.id,caption:caption||'',image_url:imageUrl||null}).select('id,author_id,caption,image_url,created_at').single();
  if(error) throw new Error(errorMessage(error,'Could not publish post'));
  return data;
}

export async function toggleLike(postId){
  const user=await currentUser();
  const {data:like,error:readError}=await supabase.from('post_likes').select('post_id').eq('post_id',postId).eq('user_id',user.id).maybeSingle();
  if(readError) throw readError;
  if(like){
    const {error}=await supabase.from('post_likes').delete().eq('post_id',postId).eq('user_id',user.id);
    if(error) throw error;
    return false;
  }
  const {error}=await supabase.from('post_likes').insert({post_id:postId,user_id:user.id});
  if(error) throw error;
  return true;
}

export async function isFollowing(userId){
  const me=await currentUser();
  const {data,error}=await supabase.from('follows').select('follower_id').eq('follower_id',me.id).eq('following_id',userId).maybeSingle();
  if(error) throw error;
  return !!data;
}

export async function toggleFollow(userId){
  const me=await currentUser();
  if(me.id===userId) return false;
  const {data,error:readError}=await supabase.from('follows').select('follower_id').eq('follower_id',me.id).eq('following_id',userId).maybeSingle();
  if(readError) throw readError;
  if(data){
    const {error}=await supabase.from('follows').delete().eq('follower_id',me.id).eq('following_id',userId);
    if(error) throw error;
    return false;
  }
  const {error}=await supabase.from('follows').insert({follower_id:me.id,following_id:userId});
  if(error) throw error;
  return true;
}

export async function getCounts(userId){
  const [{count:followers},{count:following},{count:posts}]=await Promise.all([
    supabase.from('follows').select('*',{count:'exact',head:true}).eq('following_id',userId),
    supabase.from('follows').select('*',{count:'exact',head:true}).eq('follower_id',userId),
    supabase.from('posts').select('*',{count:'exact',head:true}).eq('author_id',userId)
  ]);
  return {followers:followers||0,following:following||0,posts:posts||0};
}

export async function listConversations(){
  const me=await currentUser();
  const {data,error}=await supabase.from('messages').select('id,sender_id,recipient_id,body,created_at,read_at').or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`).order('created_at',{ascending:false}).limit(200);
  if(error) throw new Error(errorMessage(error,'Could not load messages'));
  const msgs=data||[];
  const ids=[...new Set(msgs.map(m=>m.sender_id===me.id?m.recipient_id:m.sender_id))];
  const profiles=await getProfilesByIds(ids);
  const map=new Map();
  for(const m of msgs){
    const otherId=m.sender_id===me.id?m.recipient_id:m.sender_id;
    if(!map.has(otherId)) map.set(otherId,{user:profiles.get(otherId)||{id:otherId,name:'Pixora User',username:'user',avatar_url:''},last:m});
  }
  return [...map.values()];
}

export async function listMessages(otherId){
  const me=await currentUser();
  const {data,error}=await supabase.from('messages').select('id,sender_id,recipient_id,body,created_at,read_at').or(`and(sender_id.eq.${me.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${me.id})`).order('created_at',{ascending:true});
  if(error) throw new Error(errorMessage(error,'Could not load this conversation'));
  const {error:markError}=await supabase.from('messages').update({read_at:new Date().toISOString()}).eq('sender_id',otherId).eq('recipient_id',me.id).is('read_at',null);
  if(markError) throw markError;
  return data||[];
}

export async function sendMessage(recipientId,body){
  const me=await currentUser();
  if(!recipientId) throw new Error('Recipient not found.');
  if(me.id===recipientId) throw new Error('You cannot message yourself.');
  const text=String(body||'').trim();
  if(!text) return null;
  const {data:recipient,error:recipientError}=await supabase.from('profiles').select('id').eq('id',recipientId).maybeSingle();
  if(recipientError) throw recipientError;
  if(!recipient) throw new Error('User not found.');
  const {data,error}=await supabase.from('messages').insert({sender_id:me.id,recipient_id:recipientId,body:text}).select('id,sender_id,recipient_id,body,created_at,read_at').single();
  if(error) throw new Error(errorMessage(error,'Message could not be sent'));
  return data;
}

export async function listNotifications(){
  const me=await currentUser();
  const {data,error}=await supabase.from('notifications').select('id,recipient_id,actor_id,type,message,post_id,created_at,read_at').eq('recipient_id',me.id).order('created_at',{ascending:false}).limit(100);
  if(error) throw new Error(errorMessage(error,'Could not load notifications'));
  const profiles=await getProfilesByIds((data||[]).map(n=>n.actor_id));
  return (data||[]).map(n=>({...n,actor:profiles.get(n.actor_id)||null}));
}

export async function markNotificationsRead(){
  const me=await currentUser();
  const {error}=await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('recipient_id',me.id).is('read_at',null);
  if(error) throw error;
}

export async function unreadCounts(){
  const me=await currentUser();
  const [{count:notifications},{count:messages}]=await Promise.all([
    supabase.from('notifications').select('*',{count:'exact',head:true}).eq('recipient_id',me.id).is('read_at',null),
    supabase.from('messages').select('*',{count:'exact',head:true}).eq('recipient_id',me.id).is('read_at',null)
  ]);
  return {notifications:notifications||0,messages:messages||0};
}

export async function createStory({caption,imageUrl}){
  const user=await currentUser();
  const {data,error}=await supabase.from('stories').insert({author_id:user.id,caption:caption||'',image_url:imageUrl||null}).select('id,author_id,caption,image_url,created_at,expires_at').single();
  if(error) throw new Error(errorMessage(error,'Could not publish story'));
  return data;
}

export async function listStories(){
  const {data,error}=await supabase.from('stories').select('id,author_id,caption,image_url,created_at,expires_at').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false});
  if(error) throw new Error(errorMessage(error,'Could not load stories'));
  const profiles=await getProfilesByIds((data||[]).map(s=>s.author_id));
  return (data||[]).map(s=>({...s,profiles:profiles.get(s.author_id)||null}));
}
