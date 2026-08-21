import { supabase } from './supabase.js';

const publicPages = new Set(['index.html','login.html','signup.html']);
const page = location.pathname.split('/').pop() || 'index.html';

const ICONS = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-5v6h-5A1.5 1.5 0 0 1 3 19.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  create: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  message: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-5 3v-3.5a2 2 0 0 1-2-2v-7.5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17h12l-1.2-1.7a4 4 0 0 1-.8-2.4V10a4 4 0 0 0-8 0v2.9a4 4 0 0 1-.8 2.4zM10 20h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 20c.7-4 2.9-6 6.5-6s5.8 2 6.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
};

function currentPage(){ return page === 'index.html' ? 'dashboard.html' : page; }

async function pixoraLogout(){
  try { await supabase.auth.signOut(); } catch(e) { console.warn('Pixora logout:', e); }
  ['pixora_profile','bb_name','bb_username','bb_email'].forEach(k => localStorage.removeItem(k));
  location.href = 'login.html';
}
window.pixoraLogout = pixoraLogout;

function profileData(){
  try { return JSON.parse(localStorage.getItem('pixora_profile') || 'null'); } catch { return null; }
}
function initials(name){ return (String(name || 'Pixora User').trim()[0] || 'P').toUpperCase(); }

function setAvatar(el){
  if(!el) return;
  const p = profileData();
  el.innerHTML = p?.avatar
    ? `<img class="topbar-avatar" src="${p.avatar}" alt="Profile picture">`
    : initials(p?.name);
}

function buildTopNav(){
  const top = document.querySelector('.topbar');
  if(!top) return;
  const brand = top.querySelector('.brand');
  if(brand) brand.href = 'dashboard.html';
  let nav = top.querySelector('.topnav');
  if(!nav){ nav = document.createElement('nav'); nav.className='topnav'; top.appendChild(nav); }
  const items = [
    ['dashboard.html','home','Home'],
    ['search.html','search','Search'],
    ['create.html','create','Create'],
    ['messages.html','message','Messages'],
    ['notifications.html','bell','Notifications']
  ];
  nav.innerHTML = items.map(([href,key,label]) => `<a href="${href}" aria-label="${label}" title="${label}" class="${currentPage()===href?'active':''}">${ICONS[key]}</a>`).join('');
  let avatar = top.querySelector('.avatar');
  if(!avatar){ avatar=document.createElement('a'); avatar.className='avatar'; top.appendChild(avatar); }
  avatar.href='profile.html'; avatar.setAttribute('aria-label','Profile'); setAvatar(avatar);
}

function buildBottomNav(){
  const nav = document.querySelector('.bottom-nav');
  if(!nav) return;
  const items = [
    ['dashboard.html','home','Home'],
    ['search.html','search','Search'],
    ['create.html','create','Create'],
    ['messages.html','message','Messages'],
    ['profile.html','profile','Profile']
  ];
  nav.innerHTML = items.map(([href,key,label]) => `<a href="${href}" class="${currentPage()===href?'active':''}"><span>${ICONS[key]}</span>${label}</a>`).join('');
}

function addLogout(){
  if(publicPages.has(page)) return;
  const top = document.querySelector('.topbar');
  if(!top || top.querySelector('.account-menu')) return;
  const avatar = top.querySelector('.avatar');
  if(!avatar) return;
  const menu = document.createElement('div');
  menu.className='account-menu';
  menu.innerHTML = `<a href="profile.html">Profile</a><button type="button" id="pixoraLogoutBtn">Log out</button>`;
  top.appendChild(menu);
  avatar.addEventListener('click', e => { e.preventDefault(); menu.classList.toggle('open'); });
  menu.querySelector('#pixoraLogoutBtn').addEventListener('click', pixoraLogout);
  document.addEventListener('click', e => { if(!top.contains(e.target)) menu.classList.remove('open'); });
}

function init(){
  buildTopNav();
  buildBottomNav();
  addLogout();
}

document.addEventListener('DOMContentLoaded', init);
