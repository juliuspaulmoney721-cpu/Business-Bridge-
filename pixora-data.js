(function(){
  const PROFILE='pixora_profile', PROFILES='pixora_profiles', FOLLOWS='pixora_follows', POSTS='bb_posts', COMMENTS='pixora_comments', SAVED='pixora_saved';
  const DEMO_NAMES=['Thank God','Alex Morgan','Naheivydw Jiptwqyrrew','Naheivydw Jiptwqyrrew7272'];
  const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch(e){return f}};
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const normalize=(p)=>({...p,name:String(p?.name||'Pixora User').trim(),username:String(p?.username||'pixorauser').replace(/^@/,'').trim().toLowerCase(),bio:p?.bio||'',avatar:p?.avatar||'',cover:p?.cover||''});
  function me(){return normalize(read(PROFILE,{name:localStorage.getItem('bb_name')||'Pixora User',username:localStorage.getItem('bb_username')||'pixorauser',avatar:'',cover:'',bio:''}));}
  function saveMe(p){p=normalize(p);write(PROFILE,p);localStorage.setItem('bb_name',p.name);localStorage.setItem('bb_username',p.username);register(p);return p;}
  function register(p){p=normalize(p);const list=read(PROFILES,[]);const i=list.findIndex(x=>x.username===p.username);if(i>=0)list[i]={...list[i],...p};else list.push(p);write(PROFILES,list);}
  function profiles(){const map=new Map();register(me());read(PROFILES,[]).forEach(p=>map.set(normalize(p).username,normalize(p)));read(POSTS,[]).forEach(p=>{if(p?.username&&!map.has(p.username))map.set(p.username,normalize({name:p.user,username:p.username,avatar:p.avatar||''}))});return [...map.values()];}
  function follows(){return read(FOLLOWS,{});}
  function isFollowing(target){const m=me().username;return (follows()[m]||[]).includes(target);}
  function toggleFollow(target){target=String(target||'').replace(/^@/,'').toLowerCase();const m=me().username;if(!target||target===m)return false;const f=follows();const arr=new Set(f[m]||[]);arr.has(target)?arr.delete(target):arr.add(target);f[m]=[...arr];write(FOLLOWS,f);return arr.has(target);}
  function followingCount(u){return (follows()[u]||[]).length;}
  function followersCount(u){const f=follows();return Object.values(f).filter(a=>Array.isArray(a)&&a.includes(u)).length;}
  function cleanDemo(){
    const demo=new Set(DEMO_NAMES.map(x=>x.toLowerCase()));
    const ps=read(POSTS,[]).filter(p=>!demo.has(String(p?.user||'').toLowerCase())); if(ps.length!==read(POSTS,[]).length)write(POSTS,ps);
    const profiles=read(PROFILES,[]).filter(p=>!demo.has(String(p?.name||'').toLowerCase())&&!demo.has(String(p?.username||'').toLowerCase()));write(PROFILES,profiles);
  }
  function migratePosts(){
    let ps=read(POSTS,[]), changed=false; const m=me();
    ps=ps.map(p=>{const q={...p}; if(!q.username){q.username=(q.user===m.name?m.username:String(q.user||'pixorauser').toLowerCase().replace(/[^a-z0-9._]/g,'').slice(0,30)||'pixorauser');changed=true} if(!Array.isArray(q.likedBy)){q.likedBy=q.liked?[m.username]:[];q.likes=q.likedBy.length;changed=true}else{q.likes=q.likedBy.length;q.liked=q.likedBy.includes(m.username)} if(q.user===m.name&&q.avatar!==m.avatar){q.avatar=m.avatar;changed=true} return q}); if(changed)write(POSTS,ps); return ps;
  }
  function setPostLike(postId,username){const ps=read(POSTS,[]);const p=ps.find(x=>String(x.id)===String(postId));if(!p)return;const set=new Set(Array.isArray(p.likedBy)?p.likedBy:[]);set.has(username)?set.delete(username):set.add(username);p.likedBy=[...set];p.likes=p.likedBy.length;p.liked=set.has(username);write(POSTS,ps);return p;}
  window.PixoraData={read,write,me,saveMe,register,profiles,isFollowing,toggleFollow,followingCount,followersCount,cleanDemo,migratePosts,setPostLike,normalize,KEYS:{PROFILE,PROFILES,FOLLOWS,POSTS,COMMENTS,SAVED}};
  cleanDemo(); register(me()); migratePosts();
})();
