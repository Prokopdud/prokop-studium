(function(){'use strict';
var $=function(s){return document.getElementById(s)};
function setTheme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem('sh_theme',t)}catch(e){}var b=$('theme');if(b)b.textContent=t==='dark'?'☀️':'🌙'}
setTheme(document.documentElement.dataset.theme||'light');
if($('theme'))$('theme').onclick=function(){setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')};
var bg=$('burger'),m=$('menu');
if(bg&&m){bg.onclick=function(){var o=m.classList.toggle('open');bg.setAttribute('aria-expanded',o?'true':'false');bg.textContent=o?'✕':'☰'};
 m.addEventListener('click',function(e){if(e.target.closest('a')){m.classList.remove('open');bg.textContent='☰'}})}
var open=$('podpora-open'),lb=$('podpora-lb');
if(open&&lb){
 var x=lb.querySelector('.podpora-lbx'),back=null;
 function inert(on){document.querySelectorAll('body>header,body>main,body>footer').forEach(function(el){if(on)el.setAttribute('inert','');else el.removeAttribute('inert')})}
 function show(){back=document.activeElement;lb.hidden=false;open.setAttribute('aria-expanded','true');document.body.style.overflow='hidden';inert(true);if(x)x.focus()}
 function hide(){if(lb.hidden)return;lb.hidden=true;open.setAttribute('aria-expanded','false');document.body.style.overflow='';inert(false);if(back&&back.focus)back.focus();else open.focus()}
 open.addEventListener('click',show);
 if(x)x.addEventListener('click',function(e){e.stopPropagation();hide()});
 lb.addEventListener('click',function(e){if(e.target===lb)hide()});
 document.addEventListener('keydown',function(e){if(lb.hidden)return;if(e.key==='Escape'){e.preventDefault();hide()}else if(e.key==='Tab'){e.preventDefault();if(x)x.focus()}});
}
})();
