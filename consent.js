(function(){
var s=document.currentScript,ID=s&&s.getAttribute('data-ga');if(!ID)return;
var K='sh_consent_ga';
function load(){if(window.__ga)return;window.__ga=1;var g=document.createElement('script');g.async=true;g.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(ID);document.head.appendChild(g);window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config',ID,{anonymize_ip:true});}
function get(){try{return localStorage.getItem(K)}catch(e){return null}}
function set(v){try{localStorage.setItem(K,v)}catch(e){}}
function css(){if(document.getElementById('cstyle'))return;var st=document.createElement('style');st.id='cstyle';st.textContent='#cwrap{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;align-items:center;justify-content:space-between;gap:10px 16px;flex-wrap:wrap;box-sizing:border-box;margin:0;padding:10px 18px calc(10px + env(safe-area-inset-bottom));background:var(--card,#fff);color:var(--ink,#1d2a26);border-top:1px solid var(--line,#dde3df);box-shadow:0 -4px 18px rgba(0,0,0,.06);font:15px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}#cwrap p{margin:0;flex:1 1 auto}#cwrap .cact{display:flex;gap:8px;flex:none;margin-left:auto}#cwrap button{border-radius:999px;padding:7px 16px;min-height:38px;font:inherit;font-weight:600;cursor:pointer}#cwrap .yes{background:var(--acc,#1f6f5c);color:#fff;border:1px solid var(--acc,#1f6f5c)}#cwrap .no{background:transparent;color:var(--acc,#1f6f5c);border:1px solid var(--line,#c9d1cd)}html.sh-consent body{padding-bottom:var(--sh-cbar,0px)}html.sh-consent #hubback{bottom:calc(var(--sh-cbar,0px) + 10px)!important}@media(max-width:720px){#cwrap{align-items:flex-start}#cwrap p{flex:1 1 100%}#cwrap .cact{margin-left:auto}}';document.head.appendChild(st)}
function place(){var bar=document.getElementById('cwrap');if(!bar)return;document.documentElement.style.setProperty('--sh-cbar',bar.offsetHeight+'px')}
function close(){var w=document.getElementById('cwrap');if(w)w.remove();document.documentElement.classList.remove('sh-consent');document.documentElement.style.removeProperty('--sh-cbar')}
function banner(){if(document.getElementById('cwrap'))return;css();
var d=document.createElement('div');d.id='cwrap';d.setAttribute('role','region');d.setAttribute('aria-label','Souhlas s měřením návštěvnosti');
var p=document.createElement('p');p.textContent='Tento web používá cookies k anonymnímu měření návštěvnosti.';
var act=document.createElement('div');act.className='cact';
var a=document.createElement('button'),r=document.createElement('button');a.textContent='Přijmout';r.textContent='Odmítnout';a.type=r.type='button';a.className='yes';r.className='no';
a.onclick=function(){set('yes');close();load()};r.onclick=function(){set('no');close()};
act.appendChild(r);act.appendChild(a);d.appendChild(p);d.appendChild(act);document.body.appendChild(d);
document.documentElement.classList.add('sh-consent');place();if(!banner.sized){banner.sized=1;window.addEventListener('resize',place)}}
function init(){var v=get();if(v==='yes')load();else if(v!=='no')banner();
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-consent-reset]');if(t){e.preventDefault();try{localStorage.removeItem(K)}catch(x){}banner()}});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
