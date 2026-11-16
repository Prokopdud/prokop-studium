// Lekce: klik na kartu tématu neotevře hned, ale ukáže volbu. Seznam možností je datový – stačí přidat položku {label,url|null,note}.
(function(){
var SOON='připravuje se';
// Doplňkové možnosti podle slugu (study session = výchozí odkaz karty, přidává se automaticky jako první)
var EXTRA={
 'svaly-hlavy-krku':[{icon:'📖',label:'Lekce',note:'Čti → procvič → Anki pauza, 8 kapitol',url:'svaly-hlavy-krku-lekce.html'}],
 'biologie-p01':[{icon:'📖',label:'Lekce',note:'9 kapitol: čtení, cvičení a slidy',url:'biologie-p01-lekce.html'}]
};
var DEFAULT_EXTRA=[{icon:'📖',label:'Lekce',note:SOON,url:null}];
function opts(slug,href){return [{icon:'✏️',label:'Study session',note:'Procvičování, obrázky, kvízy',url:href}].concat(EXTRA[slug]||DEFAULT_EXTRA)}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
var box=document.getElementById('lessons');if(!box)return;
function slugOf(c){var m=/[?&]l=([^&]+)/.exec(c.getAttribute('data-href')||'');return m?decodeURIComponent(m[1]):''}
function panel(c){var p=c.querySelector('.volba');if(p)return p;var h=c.getAttribute('data-href');
 p=document.createElement('div');p.className='volba';p.hidden=true;p.setAttribute('role','group');p.setAttribute('aria-label','Vyber, jak se chceš učit');
 p.innerHTML=opts(slugOf(c),h).map(function(o){return o.url?'<a class="vopt" href="'+esc(o.url)+'"><b>'+o.icon+' '+esc(o.label)+'</b><small>'+esc(o.note||'')+'</small></a>':'<span class="vopt off" aria-disabled="true"><b>'+o.icon+' '+esc(o.label)+'</b><small>'+esc(o.note||SOON)+'</small></span>'}).join('');
 var h3=c.querySelector('h3');(h3||c.firstChild).insertAdjacentElement('afterend',p);return p}
function toggle(c){var p=panel(c),open=p.hidden;box.querySelectorAll('.volba').forEach(function(x){x.hidden=true;x.parentNode.setAttribute('aria-expanded','false')});p.hidden=!open;c.setAttribute('aria-expanded',open?'true':'false');if(open){var f=p.querySelector('a.vopt');if(f&&c.matches(':focus'))f.focus()}}
document.addEventListener('click',function(e){var c=e.target.closest&&e.target.closest('#lessons [data-href]');if(!c)return;
 if(e.target.closest('.volba a.vopt'))return; if(e.target.closest('.volba'))
 {e.stopPropagation();e.preventDefault();return}
 if(e.target.closest('[data-dl]')||e.target.closest('[data-done]'))return;
 e.stopPropagation();e.preventDefault();toggle(c)},true);
document.addEventListener('keydown',function(e){if(e.key!=='Enter')return;var c=e.target.closest&&e.target.closest('#lessons [data-href]');if(!c||e.target!==c)return;e.stopPropagation();e.preventDefault();toggle(c)},true);
document.addEventListener('keydown',function(e){if(e.key==='Escape')box.querySelectorAll('.volba').forEach(function(x){x.hidden=true})});
var st=document.createElement('style');st.textContent='.volba{display:grid;gap:6px;margin:6px 0 8px}.volba[hidden]{display:none}.vopt{display:block;padding:7px 10px;border:1px solid #cfe3e3;border-radius:8px;background:#f2f8f8;text-decoration:none;color:inherit}.vopt b{display:block}.vopt small{opacity:.8}.vopt.off{background:transparent;border-color:#e3e6e8;color:#8a9399;cursor:default}[data-theme=dark] .vopt{background:#1f2a2a;border-color:#2f4545}[data-theme=dark] .vopt.off{background:transparent;border-color:#333;color:#888}';document.head.appendChild(st);
})();
