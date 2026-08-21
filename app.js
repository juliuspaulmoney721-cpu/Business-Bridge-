import { supabase } from './supabase.js';
import { currentUser, ensureProfile, unreadCounts } from './pixora-api.js';

const publicPages=new Set(['index.html','login.html','signup.html']);
const page=location.pathname.split('/').pop()||'index.html';

async function boot(){
  const user=await currentUser().catch(()=>null);
  if(!user){ if(!publicPages.has(page)) location.href='login.html'; return; }
  await ensureProfile(user).catch(e=>console.warn('Profile setup:',e.message));
  const avatar=document.querySelector('[data-user-avatar]');
  if(avatar){
    const p=await ensureProfile(user);
    avatar.innerHTML=p?.avatar_url?`<img class="topbar-avatar" src="${esc(p.avatar_url)}" alt="Profile picture">`:esc((p?.name||'?')[0].toUpperCase());
  }
  if(!publicPages.has(page)) addLogout();
  updateBadges();
  supabase.channel('pixora-app-'+user.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`recipient_id=eq.${user.id}`},()=>updateBadges()).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`recipient_id=eq.${user.id}`},()=>updateBadges()).subscribe();
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function addLogout(){
  if(document.getElementById('pixoraLogoutBtn'))return;
  const top=document.querySelector('.topbar'); if(!top)return;
  const b=document.createElement('button');b.id='pixoraLogoutBtn';b.className='pixora-logout';b.textContent='Log out';
  b.onclick=async()=>{await supabase.auth.signOut();location.href='login.html'};top.appendChild(b);
}
async function updateBadges(){
  try{const c=await unreadCounts(); document.querySelectorAll('a[href="notifications.html"]').forEach(a=>badge(a,c.notifications));document.querySelectorAll('a[href="messages.html"]').forEach(a=>badge(a,c.messages));}catch{}
}
function badge(a,n){a.querySelector('.nav-badge')?.remove();if(!n)return;const s=document.createElement('span');s.className='nav-badge';s.textContent=n>99?'99+':n;a.style.position='relative';a.appendChild(s)}
window.pixoraEsc=esc;
document.addEventListener('DOMContentLoaded',boot);
