import { supabase } from './supabase.js';
const publicPages=new Set(['index.html','login.html','signup.html']);
const page=location.pathname.split('/').pop()||'index.html';
async function pixoraLogout(){try{await supabase.auth.signOut()}catch(e){console.warn(e)}['pixora_profile','bb_name','bb_username','bb_email'].forEach(k=>localStorage.removeItem(k));location.href='login.html'}
window.pixoraLogout=pixoraLogout;
function addLogout(){if(publicPages.has(page)||document.getElementById('pixoraLogoutBtn'))return;const top=document.querySelector('.topbar');if(!top)return;const b=document.createElement('button');b.id='pixoraLogoutBtn';b.className='pixora-logout';b.type='button';b.textContent='Log out';b.addEventListener('click',pixoraLogout);top.appendChild(b)}
document.addEventListener('DOMContentLoaded',addLogout);
