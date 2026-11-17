(function(){'use strict';
var L=window.STUDY.lessons.filter(function(l){return !l.standalone}),$=function(s){return document.getElementById(s)};
var i=Math.max(0,L.map(function(l){return l.slug}).indexOf(new URLSearchParams(location.search).get('l')));
var stage=$('stage'),fr=null;
function load(n,dir){i=(n+L.length)%L.length;var l=L[i];
  $('vt').textContent=l.subj+' – '+l.title;$('vs').textContent=(i+1)+' / '+L.length;
  $('dots').innerHTML=L.map(function(_,k){return '<i class="'+(k===i?'on':'')+'"></i>'}).join('');
  $('solo').href=l.slug+'.html';document.title=l.title+' – Studovna FBMI';
  try{localStorage.setItem('sh_last',JSON.stringify(l.slug))}catch(e){}
  history.replaceState(null,'','?l='+encodeURIComponent(l.slug));
  var nf=document.createElement('iframe');nf.src=l.slug+'.html';nf.title=l.title;
  if(dir)nf.className=dir>0?'out-r':'out-l';
  var old=fr;fr=nf;stage.appendChild(nf);
  if(old){old.className=dir>0?'out-l':'out-r';setTimeout(function(){old.remove()},350)}
  if(dir)requestAnimationFrame(function(){requestAnimationFrame(function(){nf.className=''})});}
$('prev').onclick=function(){load(i-1,-1)};$('next').onclick=function(){load(i+1,1)};
document.addEventListener('keydown',function(e){if(e.altKey&&e.key==='ArrowLeft')load(i-1,-1);if(e.altKey&&e.key==='ArrowRight')load(i+1,1)});
var sx=0,sy=0,bar=$('vbar');
bar.addEventListener('touchstart',function(e){sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
bar.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)load(i+(dx<0?1:-1),dx<0?1:-1)},{passive:true});
load(i,0);
var h=$('hint');try{if(localStorage.getItem('sh_hint'))h.remove();else{localStorage.setItem('sh_hint','1');setTimeout(function(){h.style.opacity=0},3500);setTimeout(function(){h.remove()},4200)}}catch(e){}
})();
