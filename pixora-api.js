import { supabase } from './supabase.js';

const PROFILE_FIELDS = 'id,name,username,avatar_url,bio,created_at,updated_at';

function cleanUsername(value){
  return String(value || 'pixorauser')
    .replace(/^@/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 30) || 'pixorauser';
}

function errorMessage(error, fallback='Pixora database error'){
  return error?.message ? `${fallback}: ${error.message}` : fallback;
}

export async function currentUser(){
  const { data, error } = await supabase.auth.getUser();
  if(error) throw error;
  return data.user || null;
}

export async function ensureProfile(user){
  if(!user) return null;

  const meta = user.user_metadata || {};
  const { data: existing, error: readError } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', user.id)
    .maybeSingle();

  if(readError) throw new Error(errorMessage(readError, 'Could not load your Pixora profile'));
  if(existing) return existing;

  const base = cleanUsername(meta.username || meta.name || user.email?.split('@')[0]);
  let username = base;

  for(let i=0; i<50; i++){
    const { data: found, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if(error) throw new Error(errorMessage(error, 'Could not check your Pixora username'));
    if(!found) break;
    username = cleanUsername(`${base.slice(0,24)}_${1000 + Math.floor(Math.random()*9000)}`);
  }

  const profile = {
    id: user.id,
    name: String(meta.name || base || 'Pixora User').trim(),
    username,
    avatar_url: meta.avatar_url || '',
    bio: meta.bio || ''
  };

  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile, { onConflict: 'id' })
    .select(PROFILE_FIELDS)
    .single();

  if(error) throw new Error(errorMessage(error, 'Could not create your Pixora profile'));
  return data;
}

export async function myProfile(){
  return ensureProfile(await currentUser());
}

export async function getProfileById(id){
  if(!id) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', id)
    .maybeSingle();
  if(error) throw new Error(errorMessage(error, 'Could not load this Pixora profile'));
  return data;
}

export async function getProfileByUsername(username){
  const key = cleanUsername(username);
  if(!key) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('username', key)
    .maybeSingle();

  if(error) throw new Error(errorMessage(error, 'Could not load this Pixora profile'));
  return data;
}

export async function searchProfiles(q=''){
  const value = String(q || '').trim().replace(/[%(),]/g, '');
  let query = supabase.from('profiles').select(PROFILE_FIELDS).order('name').limit(50);
  if(value) query = query.or(`name.ilike.%${value}%,username.ilike.%${value}%`);

  const { data, error } = await query;
  if(error) throw new Error(errorMessage(error, 'Could not search Pixora users'));
  return data || [];
}

export async function updateProfile(values){
  const user = await currentUser();
  if(!user) throw new Error('Please log in first.');

  const username = cleanUsername(values.username);
  const payload = {
    name: String(values.name || 'Pixora User').trim() || 'Pixora User',
    username,
    bio: String(values.bio || '').trim(),
    avatar_url: values.avatar_url || ''
  };

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', user.id)
    .select(PROFILE_FIELDS)
    .single();

  if(error) throw new Error(errorMessage(error, 'Could not update your Pixora profile'));
  return data;
}

export async function uploadImage(file, folder='posts'){
  const user = await currentUser();
  if(!user) throw new Error('Please log in first.');
  if(!file) throw new Error('Choose an image first.');

  const ext = (file.name?.split('.').pop() || 'jpg')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${user.id}/${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('posts')
    .upload(path, file, {
      upsert: false,
      contentType: file.type || 'image/jpeg'
    });

  if(error) throw new Error(errorMessage(error, 'Image upload failed. Make sure the posts storage bucket exists.'));
  return supabase.storage.from('posts').getPublicUrl(path).data.publicUrl;
}

async function getProfilesByIds(ids){
  const unique = [...new Set((ids || []).filter(Boolean))];
  if(!unique.length) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .in('id', unique);

  if(error) throw new Error(errorMessage(error, 'Could not load Pixora profiles'));
  return new Map((data || []).map(p => [p.id, p]));
}

export async function listPosts(){
  // Read the complete row so this build can temporarily tolerate an older
  // posts.user_id column while the Supabase repair is being applied.
  const { data: rawPosts, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if(error) throw new Error(errorMessage(error, 'Could not load Pixora posts'));

  const posts = (rawPosts || []).map(p => ({
    ...p,
    author_id: p.author_id || p.user_id || null
  }));
  const profiles = await getProfilesByIds(posts.map(p => p.author_id));
  return posts.map(p => ({
    ...p,
    profile: profiles.get(p.author_id) || null
  }));
}

export async function createPost({content, imageUrl}){
  const user = await currentUser();
  if(!user) throw new Error('Please log in first.');

  const payload = {
    author_id: user.id,
    content: String(content || '').trim(),
    image_url: imageUrl || null
  };

  // First use the clean Pixora schema (posts.author_id). If the live
  // database is still an older schema, handle the two common legacy shapes
  // without making the user delete/recreate their tables.
  let result = await supabase
    .from('posts')
    .insert(payload)
    .select('*')
    .single();

  if(result.error){
    const msg = result.error.message || '';
    const needsLegacyUserId = /user_id.*not-null|column.*user_id/i.test(msg);
    const authorColumnMissing = /author_id.*column|column.*author_id.*does not exist/i.test(msg);

    if(needsLegacyUserId){
      // Old table has both columns and user_id is still NOT NULL.
      result = await supabase
        .from('posts')
        .insert({
          author_id: user.id,
          user_id: user.id,
          content: payload.content,
          image_url: payload.image_url
        })
        .select('*')
        .single();

      // If author_id is not present at all, fall back to the original
      // legacy shape (user_id only).
      if(result.error && /author_id.*column|column.*author_id.*does not exist/i.test(result.error.message || '')){
        result = await supabase
          .from('posts')
          .insert({
            user_id: user.id,
            content: payload.content,
            image_url: payload.image_url
          })
          .select('*')
          .single();
      }
    } else if(authorColumnMissing){
      result = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          content: payload.content,
          image_url: payload.image_url
        })
        .select('*')
        .single();
    }
  }

  if(result.error) throw new Error(errorMessage(result.error, 'Could not publish post'));
  return result.data;
}


export async function updatePost(postId, {content, imageUrl} = {}){
  const me = await currentUser();
  if(!me) throw new Error('Please log in first.');
  if(!postId) throw new Error('Post not found.');

  const payload = {
    content: String(content || '').trim(),
    image_url: imageUrl || null
  };

  let result = await supabase
    .from('posts')
    .update(payload)
    .eq('id', postId)
    .eq('author_id', me.id)
    .select('*')
    .single();

  if(result.error && /author_id.*column|column.*author_id.*does not exist/i.test(result.error.message || '')){
    result = await supabase
      .from('posts')
      .update(payload)
      .eq('id', postId)
      .eq('user_id', me.id)
      .select('*')
      .single();
  }

  if(result.error) throw new Error(errorMessage(result.error, 'Could not update post'));
  return result.data;
}

export async function deletePost(postId){
  const me = await currentUser();
  if(!me) throw new Error('Please log in first.');
  if(!postId) throw new Error('Post not found.');

  let result = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('author_id', me.id);

  if(result.error && /author_id.*column|column.*author_id.*does not exist/i.test(result.error.message || '')){
    result = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', me.id);
  }

  if(result.error) throw new Error(errorMessage(result.error, 'Could not delete post'));
}

export async function deletePostImage(imageUrl){
  if(!imageUrl) return;
  try{
    const marker = '/storage/v1/object/public/posts/';
    const i = String(imageUrl).indexOf(marker);
    if(i < 0) return;
    const path = decodeURIComponent(String(imageUrl).slice(i + marker.length));
    if(path) await supabase.storage.from('posts').remove([path]);
  }catch{}
}

export async function isFollowing(userId){
  const me = await currentUser();
  if(!me || !userId) return false;

  const { data, error } = await supabase
    .from('follows')
    .select('follower_id,following_id')
    .eq('follower_id', me.id)
    .eq('following_id', userId)
    .maybeSingle();

  if(error) throw new Error(errorMessage(error, 'Could not check follow status'));
  return !!data;
}

export async function toggleFollow(userId){
  const me = await currentUser();
  if(!me) throw new Error('Please log in first.');
  if(me.id === userId) return false;

  const { data, error: readError } = await supabase
    .from('follows')
    .select('follower_id,following_id')
    .eq('follower_id', me.id)
    .eq('following_id', userId)
    .maybeSingle();

  if(readError) throw new Error(errorMessage(readError, 'Could not check follow status'));

  if(data){
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', me.id)
      .eq('following_id', userId);
    if(error) throw new Error(errorMessage(error, 'Could not unfollow this user'));
    return false;
  }

  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: me.id, following_id: userId });
  if(error) throw new Error(errorMessage(error, 'Could not follow this user'));
  return true;
}

export async function getCounts(userId){
  const followResults = await Promise.all([
    supabase.from('follows').select('*', { count:'exact', head:true }).eq('following_id', userId),
    supabase.from('follows').select('*', { count:'exact', head:true }).eq('follower_id', userId)
  ]);
  if(followResults.some(r => r.error)) throw new Error(errorMessage(followResults.find(r => r.error)?.error, 'Could not load profile counts'));

  let postCount = await supabase.from('posts').select('*', { count:'exact', head:true }).eq('author_id', userId);
  if(postCount.error && /author_id|column/i.test(postCount.error.message || '')){
    postCount = await supabase.from('posts').select('*', { count:'exact', head:true }).eq('user_id', userId);
  }
  if(postCount.error) throw new Error(errorMessage(postCount.error, 'Could not load profile counts'));

  return {
    followers: followResults[0].count || 0,
    following: followResults[1].count || 0,
    posts: postCount.count || 0
  };
}

async function getOrCreateConversation(otherId){
  const me = await currentUser();
  if(!me) throw new Error('Please log in first.');
  if(me.id === otherId) throw new Error('You cannot message yourself.');

  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
    p_other_user_id: otherId
  });
  if(error) throw new Error(errorMessage(error, 'Could not open this conversation'));
  if(!data) throw new Error('Could not open this conversation.');
  return data;
}

export async function listConversations(){
  const me = await currentUser();
  if(!me) throw new Error('Please log in first.');

  // The membership RPC is the authoritative source for the people in a
  // conversation. Keep a message-based fallback so the inbox still works
  // on projects where the older RPC has not refreshed in Supabase yet.
  let members = null;
  const rpc = await supabase.rpc('get_my_conversation_members', { p_user_id: me.id });
  if(!rpc.error) members = rpc.data || [];

  if(members?.length){
    const conversationIds = [...new Set(members.map(x => x.conversation_id))];
    const otherIds = [...new Set(members.filter(m => m.user_id !== me.id).map(m => m.user_id))];
    const profiles = await getProfilesByIds(otherIds);
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id,conversation_id,sender_id,content,created_at,read_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending:false });
    if(error) throw new Error(errorMessage(error, 'Could not load messages'));
    const latest = new Map();
    for(const message of (messages || [])) if(!latest.has(message.conversation_id)) latest.set(message.conversation_id, message);
    const result=conversationIds.map(conversationId=>{
      const member=members.find(m=>m.conversation_id===conversationId&&m.user_id!==me.id);
      if(!member)return null;
      return {conversation_id:conversationId,user:profiles.get(member.user_id)||{id:member.user_id,name:'Pixora User',username:'user',avatar_url:''},last:latest.get(conversationId)||null};
    }).filter(Boolean);

    // Merge recently messaged recipients so a brand-new outgoing chat is
    // visible immediately, even before the membership RPC cache catches up.
    try{
      const recent=JSON.parse(localStorage.getItem('pixora_recent_conversations')||'[]');
      for(const recipientId of recent){
        if(result.some(x=>x.user?.id===recipientId)) continue;
        const profile=profiles.get(recipientId)||await getProfileById(recipientId);
        if(!profile||profile.id===me.id) continue;
        const conversationId=await getOrCreateConversation(recipientId);
        const {data:recentMessages}=await supabase.from('messages').select('id,conversation_id,sender_id,content,created_at,read_at').eq('conversation_id',conversationId).order('created_at',{ascending:false}).limit(1);
        result.push({conversation_id:conversationId,user:profile,last:recentMessages?.[0]||null});
      }
    }catch{}
    return result.sort((a,b)=>new Date(b.last?.created_at||0)-new Date(a.last?.created_at||0));
  }

  // Fallback: RLS lets a conversation member read messages in their own
  // conversations. If the membership RPC is unavailable/empty, use the
  // participants visible in those messages to build the inbox.
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id,conversation_id,sender_id,content,created_at,read_at')
    .order('created_at',{ascending:false})
    .limit(500);
  if(error) throw new Error(errorMessage(error, 'Could not load messages'));
  if(!messages?.length) return [];

  const byConversation=new Map();
  for(const message of messages){
    let row=byConversation.get(message.conversation_id);
    if(!row) row={conversation_id:message.conversation_id,messages:[]};
    row.messages.push(message);byConversation.set(message.conversation_id,row);
  }
  const otherIds=[];
  const result=[];
  for(const row of byConversation.values()){
    const otherMessage=row.messages.find(m=>m.sender_id!==me.id);
    if(!otherMessage) continue;
    const otherId=otherMessage.sender_id;
    otherIds.push(otherId);
    result.push({conversation_id:row.conversation_id,otherId,last:row.messages[0]});
  }
  const profiles=await getProfilesByIds(otherIds);
  return result.map(x=>({...x,user:profiles.get(x.otherId)||{id:x.otherId,name:'Pixora User',username:'user',avatar_url:''}}));
}

export async function listMessages(otherId){
  const conversationId = await getOrCreateConversation(otherId);
  const { data, error } = await supabase
    .from('messages')
    .select('id,conversation_id,sender_id,content,created_at,read_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending:true });
  if(error) throw new Error(errorMessage(error, 'Could not load this conversation'));
  return data || [];
}

export async function sendMessage(recipientId, content){
  const me = await currentUser();
  if(!me) throw new Error('Please log in first.');
  if(!recipientId) throw new Error('Recipient not found.');
  if(me.id === recipientId) throw new Error('You cannot message yourself.');

  const text = String(content || '').trim();
  if(!text) return null;

  const { data: recipient, error: recipientError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', recipientId)
    .maybeSingle();
  if(recipientError) throw new Error(errorMessage(recipientError, 'Could not find this user'));
  if(!recipient) throw new Error('User not found.');

  const conversationId = await getOrCreateConversation(recipientId);
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id:conversationId, sender_id:me.id, content:text })
    .select('id,conversation_id,sender_id,content,created_at,read_at')
    .single();
  if(error) throw new Error(errorMessage(error, 'Message could not be sent'));

  // Keep the recipient locally as a lightweight inbox index. This makes the
  // conversation appear immediately even when the membership RPC is stale.
  try{
    const key='pixora_recent_conversations';
    const current=JSON.parse(localStorage.getItem(key)||'[]');
    const next=[recipientId,...current.filter(id=>id!==recipientId)].slice(0,50);
    localStorage.setItem(key,JSON.stringify(next));
  }catch{}
  return data;
}

export async function listNotifications(){
  const me = await currentUser();
  if(!me) throw new Error('Please log in first.');

  const { data, error } = await supabase
    .from('notifications')
    .select('id,user_id,actor_id,type,title,message,post_id,conversation_id,is_read,created_at')
    .eq('user_id', me.id)
    .order('created_at', { ascending:false })
    .limit(100);
  if(error) throw new Error(errorMessage(error, 'Could not load notifications'));

  const profiles = await getProfilesByIds((data || []).map(n => n.actor_id));
  return (data || []).map(n => ({ ...n, actor:profiles.get(n.actor_id) || null }));
}

export async function markNotificationsRead(){
  const me = await currentUser();
  if(!me) return;
  const { error } = await supabase
    .from('notifications')
    .update({ is_read:true })
    .eq('user_id', me.id)
    .eq('is_read', false);
  if(error) throw new Error(errorMessage(error, 'Could not mark notifications as read'));
}

export async function unreadCounts(){
  const me = await currentUser();
  if(!me) return { notifications:0, messages:0 };

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count:'exact', head:true })
    .eq('user_id', me.id)
    .eq('is_read', false);
  if(error) throw new Error(errorMessage(error, 'Could not load notification count'));

  return { notifications:count || 0, messages:0 };
}
