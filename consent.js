(function(){
var s=document.currentScript,ID=s&&s.getAttribute('data-ga');if(!ID)return;
var K='sh_consent_ga';
function load(){if(window.__ga)return;window.__ga=1;var g=document.createElement('script');g.async=true;g.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(ID);document.head.appendChild(g);window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config',ID,{anonymize_ip:true});}
function get(){try{return localStorage.getItem(K)}catch(e){return null}}
function set(v){try{localStorage.setItem(K,v)}catch(e){}}
var prevFocus=null;
function lock(on){var kids=document.body.children;for(var k=0;k<kids.length;k++){var c=kids[k];if(c.id==='cbar'||c.id==='cwrap')continue;if(on){if(!c.hasAttribute('inert')){c.setAttribute('inert','');c.setAttribute('data-cinert','')}}else if(c.hasAttribute('data-cinert')){c.removeAttribute('inert');c.removeAttribute('data-cinert')}}
document.documentElement.style.overflow=on?'hidden':'';document.body.style.overflow=on?'hidden':'';}
function close(){var w=document.getElementById('cwrap');if(w)w.remove();lock(false);document.removeEventListener('keydown',trap,true);if(prevFocus&&prevFocus.focus)try{prevFocus.focus()}catch(e){}}
function trap(e){if(e.key!=='Tab')return;var d=document.getElementById('cbar');if(!d)return;var b=d.querySelectorAll('button');var f=b[0],l=b[b.length-1];if(e.shiftKey&&document.activeElement===f){e.preventDefault();l.focus()}else if(!e.shiftKey&&document.activeElement===l){e.preventDefault();f.focus()}else if(!d.contains(document.activeElement)){e.preventDefault();f.focus()}}
function banner(){if(document.getElementById('cwrap'))return;prevFocus=document.activeElement;
var w=document.createElement('div');w.id='cwrap';w.style.cssText='position:fixed;inset:0;z-index:9999;background:transparent;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
w.addEventListener('click',function(e){if(e.target===w){e.preventDefault();e.stopPropagation()}});
w.addEventListener('wheel',function(e){e.preventDefault()},{passive:false});w.addEventListener('touchmove',function(e){e.preventDefault()},{passive:false});
var d=document.createElement('div');d.id='cbar';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-label','Souhlas s měřením návštěvnosti');
d.style.cssText='width:90vw;max-width:520px;box-sizing:border-box;background:#fff;color:#1d2321;border:1px solid #d9dfdc;border-radius:16px;padding:22px 22px 20px;font:16px/1.5 system-ui,sans-serif;display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:flex-end';
var p=document.createElement('p');p.style.cssText='margin:0;flex:1 1 100%';p.textContent='Tento web používá cookies k anonymnímu měření návštěvnosti.';
var a=document.createElement('button'),r=document.createElement('button');a.textContent='Přijmout';r.textContent='Odmítnout';a.type=r.type='button';
var bs='border-radius:999px;padding:11px 20px;font:inherit;font-size:16px;font-weight:600;cursor:pointer;';a.style.cssText=bs+'background:#1f6f5c;color:#fff;border:1px solid #1f6f5c';r.style.cssText=bs+'background:transparent;color:#1f6f5c;border:1px solid #c9d1cd';
a.onclick=function(){set('yes');close();load()};r.onclick=function(){set('no');close()};
d.appendChild(p);d.appendChild(r);d.appendChild(a);w.appendChild(d);document.body.appendChild(w);lock(true);document.addEventListener('keydown',trap,true);a.focus();}
function init(){var v=get();if(v==='yes')load();else if(v!=='no')banner();
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-consent-reset]');if(t){e.preventDefault();try{localStorage.removeItem(K)}catch(x){}banner()}});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
