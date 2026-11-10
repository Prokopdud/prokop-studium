(function(){
var s=document.currentScript,URL_=s.getAttribute('data-url'),KEY=s.getAttribute('data-key'),PUB=s.hasAttribute('data-public'),ADM=s.hasAttribute('data-admin')||s.hasAttribute('data-staff'),B=s.getAttribute('data-base')||'';
var H0=location.hash+'&'+location.search;window.sbRecovery=/(^|[#&?])type=recovery(&|$)/.test(H0);window.sbInitHash=location.hash;
var sb=window.supabase.createClient(URL_,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});
window.sbClient=sb;sb.auth.onAuthStateChange(function(ev){if(ev==='PASSWORD_RECOVERY'){window.sbRecovery=true;if(window.sbOnRecovery)window.sbOnRecovery()}});
function here(){var a=location.pathname.split('/'),p=a.pop()||'index.html';if(B&&a.length)p=a.pop()+'/'+p;return p+location.search+location.hash}
function show(){document.documentElement.classList.remove('gated')}
function escNav(t){return String(t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function loadProgress(){
 if(document.querySelector('script[src$="progress.js"]'))return;
 var css=document.createElement('link');css.rel='stylesheet';css.href=B+'progress.css';css.setAttribute('data-progress-css','1');document.head.appendChild(css);
 var sm=document.createElement('script');sm.src=B+'progress-merge.js';
 sm.onload=function(){var sp=document.createElement('script');sp.src=B+'progress.js';document.body.appendChild(sp)};
 document.body.appendChild(sm);
}
function accountLink(session){
 var m=document.getElementById('menu')||document.getElementById('hubback');
 if(!m)return;
 var old=document.getElementById('account');if(old)old.remove();
 m.querySelectorAll('a[href="'+B+'profil.html"],a[href="profil.html"]').forEach(function(n){if(n.id!=='account')n.remove()});
 var a=document.createElement('a');a.id='account';a.className='acct';
 if(session){
  a.href=B+'profil.html';
  a.innerHTML='<span aria-hidden="true">👤</span> Profil';
  window.sbSetNick=function(name){if(name)a.innerHTML='<span aria-hidden="true">👤</span> '+escNav(name)};
  if(/profil\.html$/.test(location.pathname)){a.classList.add('on');a.setAttribute('aria-current','page')}
 }else{
  a.href=B+'prihlaseni.html?next='+encodeURIComponent(here());
  a.innerHTML='<span aria-hidden="true">👤</span> Přihlásit';
  if(/prihlaseni\.html$/.test(location.pathname)){a.classList.add('on');a.setAttribute('aria-current','page')}
 }
 m.appendChild(a);
}
function noperm(){if(!/[?&]noperm=1/.test(location.search))return;var n=document.createElement('p');n.className='lmsg err nperm';n.setAttribute('role','alert');n.textContent='Nemáš oprávnění.';var m=document.querySelector('main')||document.body;m.insertBefore(n,m.firstChild)}
function ready(f){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',f);else f()}
window.sbRole=Promise.resolve('user');window.sbIsAdmin=Promise.resolve(false);window.sbIsStaff=Promise.resolve(false);
if(PUB){
 window.sbReady=sb.auth.getSession().then(function(r){
  var ses=r&&r.data&&r.data.session;
  ready(function(){accountLink(ses||null);if(ses)loadProgress()});
 });
 return;
}
window.sbReady=sb.auth.getSession().then(function(r){var ses=r&&r.data&&r.data.session;
 if(!ses){location.replace(B+'prihlaseni.html?next='+encodeURIComponent(here()));return}
 window.sbRole=sb.rpc('my_role').then(function(r){return (!r.error&&r.data)||'user'},function(){return 'user'});
 window.sbIsAdmin=window.sbRole.then(function(r){return r==='admin'});window.sbIsStaff=window.sbRole.then(function(r){return r==='admin'||r==='moderator'});
 if(ADM){window.sbIsStaff.then(function(ok){if(!ok){location.replace(B+'index.html?noperm=1');return}show()})}else show();
 ready(function(){accountLink(ses);loadProgress();noperm()});
 sb.auth.onAuthStateChange(function(ev){if(ev==='SIGNED_OUT')location.replace(B+'prihlaseni.html?next='+encodeURIComponent(here()))});
}).catch(function(){location.replace(B+'prihlaseni.html?next='+encodeURIComponent(here()))});
})();
