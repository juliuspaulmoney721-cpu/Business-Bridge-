import { supabase } from './supabase.js';
import { currentUser, ensureProfile, unreadCounts } from './pixora-api.js';

const publicPages = new Set(['index.html','login.html','signup.html']);
const page = location.pathname.split('/').pop() || 'index.html';

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

async function boot(){
  const user = await currentUser().catch(() => null);
  if(!user){
    if(!publicPages.has(page)) location.href = 'login.html';
    return;
  }

  const profile = await ensureProfile(user).catch(() => null);
  const avatar = document.querySelector('[data-user-avatar]');
  if(avatar){
    avatar.innerHTML = profile?.avatar_url
      ? `<img class="topbar-avatar" src="${esc(profile.avatar_url)}" alt="Profile picture">`
      : esc((profile?.name || '?')[0].toUpperCase());
  }

  updateBadges();

  supabase
    .channel('pixora-app-' + user.id)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${user.id}`},updateBadges)
    .subscribe();
}

async function updateBadges(){
  try{
    const counts = await unreadCounts();
    document.querySelectorAll('a[href="notifications.html"]').forEach(a => badge(a, counts.notifications));
  }catch{}
}

function badge(a,n){
  a.querySelector('.nav-badge')?.remove();
  if(!n) return;
  a.style.position = 'relative';
  const s = document.createElement('span');
  s.className = 'nav-badge';
  s.textContent = n > 99 ? '99+' : n;
  a.appendChild(s);
}

window.pixoraEsc = esc;
document.addEventListener('DOMContentLoaded', boot);
