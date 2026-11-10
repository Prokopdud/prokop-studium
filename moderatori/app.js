(function(){'use strict';
var D=window.STUDY,$=function(s){return document.getElementById(s)};
function ls(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}}
function ss(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function norm(s){return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function subjIcon(s){return s==='Latina'?'🏛️':s==='Biologie'?'🧬':'🫀'}
function dkey(d){d=d||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
/* progress */
function progress(l){var st=ls(l.key,{})||{},done=0;var src=l.type==='lat'?st:(st.ex||{});
  l.keys.forEach(function(k){if(src[k])done++});
  var manual=ls('sh_done',{})[l.slug];return{done:done,total:l.keys.length,pct:manual?100:Math.round(100*done/Math.max(1,l.keys.length)),manual:!!manual,time:l.type==='lat'?0:(st.t||0)}}
/* lessons + search */
if($('lessons')){
var subj='Vše',q='';
var subjects=['Vše'].concat(D.lessons.map(function(l){return l.subj}).filter(function(v,i,a){return a.indexOf(v)===i}));
function chips(){$('chips').innerHTML=subjects.map(function(s){return '<button class="chip'+(s===subj?' on':'')+'" data-s="'+esc(s)+'">'+esc(s)+'</button>'}).join('');}
$('chips').onclick=function(e){var b=e.target.closest('[data-s]');if(!b)return;subj=b.dataset.s;try{history.replaceState(null,'',subj==='Vše'?'lekce.html':'?s='+encodeURIComponent(subj))}catch(_){}chips();render()};
var lastL=ls('sh_last',null);
function render(){var nq=norm(q.trim()),html='';
  subjects.slice(1).forEach(function(s){if(subj!=='Vše'&&subj!==s)return;
    var ls_=D.lessons.filter(function(l){return l.subj===s&&(!nq||norm(l.title+' '+l.desc+' '+l.subj).indexOf(nq)>=0||D.cards.some(function(c){return c.src===l.slug&&(norm(c.la).indexOf(nq)>=0||norm(c.cz).indexOf(nq)>=0)}))});
    if(!ls_.length)return;
    html+='<h2>'+subjIcon(s)+' '+esc(s)+' <small>'+ls_.length+' '+(ls_.length===1?'lekce':'lekce')+'</small></h2><div class="rail">';
    ls_.forEach(function(l){var p=progress(l),idx=D.lessons.indexOf(l);
      html+='<div class="card" role="link" tabindex="0" data-href="viewer.html?l='+encodeURIComponent(l.slug)+'"><div class="tag'+(l.type==='lat'?' lat':'')+'">'+esc(l.subj)+(l.proto?' · 🧪 prototyp':'')+(lastL===l.slug?' · naposledy otevřeno':'')+'</div><h3>'+esc(l.title)+'</h3><p>'+esc(l.desc)+'</p>'+
      '<div class="meta"><span>📑 '+l.sections+' sekcí</span><span>✏️ '+l.exercises+' cvičení</span>'+(p.time?'<span>⏱ '+Math.round(p.time/60)+' min</span>':'')+'</div>'+
      (l.anki?'<div class="meta"><a class="chip" style="min-height:30px;display:inline-flex;align-items:center;text-decoration:none" href="'+l.anki.file+'" download data-dl="1">⬇ Balíček .apkg</a><span>🧠 '+l.anki.cards+' karet · '+l.anki.mb+' MB</span></div>':'')+'<div class="bar"><i style="width:'+p.pct+'%"></i></div><div class="row"><span class="sub grow">'+(p.manual?'✅ označeno jako hotovo':p.done+'/'+p.total+' cvičení · '+p.pct+' %')+'</span><button class="chip" data-done="'+idx+'" style="min-height:30px">'+(p.manual?'↺':'✓ hotovo')+'</button></div></div>'});
    html+='</div>'});
  $('lessons').innerHTML=html||'<p class="empty">Nic nenalezeno 🤷</p>';
  var th='';if(nq.length>=2){var hits=D.cards.filter(function(c){return norm(c.la).indexOf(nq)>=0||norm(c.cz).indexOf(nq)>=0}).slice(0,12);
    if(hits.length)th='<h2>🔤 Pojmy <small>'+hits.length+(hits.length===12?'+':'')+'</small></h2><div class="panel"><ul class="dl">'+hits.map(function(c){var l=D.lessons.filter(function(x){return x.slug===c.src})[0];return '<li><b class="grow">'+esc(c.la)+'</b><span class="grow">'+esc(c.cz)+'</span><a class="sub" href="viewer.html?l='+c.src+'">'+esc(l.subj+' – '+l.title)+'</a></li>'}).join('')+'</ul></div>'}
  $('termhits').innerHTML=th}
$('lessons').addEventListener('click',function(e){if(e.target.closest('[data-dl]'))return;var b=e.target.closest('[data-done]');if(!b){var c=e.target.closest('[data-href]');if(c)location.href=c.dataset.href;return}e.preventDefault();var l=D.lessons[+b.dataset.done],m=ls('sh_done',{});if(m[l.slug])delete m[l.slug];else m[l.slug]=1;ss('sh_done',m);render()});
$('q').addEventListener('input',function(){q=this.value;render()});
var sp=new URLSearchParams(location.search).get('s');if(sp&&subjects.indexOf(sp)>=0)subj=sp;
chips();render();
window.addEventListener('pageshow',render);window.addEventListener('storage',render);
$('lessons').addEventListener('keydown',function(e){var c=e.target.closest('[data-href]');if(c&&e.key==='Enter')location.href=c.dataset.href});
}
/* streak + goal */
function act(){return ls('sh_activity',{})}
if($('streakN')){
function addMin(m){var a=act(),k=dkey();a[k]=Math.round(((a[k]||0)+m)*10)/10;ss('sh_activity',a);streak()}
function streak(){var a=act(),goal=+ls('sh_goal',25),n=0,d=new Date(),k=dkey(d);
  if(!(a[k]>=goal))d.setDate(d.getDate()-1);
  while(a[dkey(d)]>=goal){n++;d.setDate(d.getDate()-1)}
  $('streakN').textContent=n;var t=a[dkey()]||0;$('goalTxt').textContent='Dnes '+Math.round(t)+' / '+goal+' min';$('goalBar').style.width=Math.min(100,100*t/goal)+'%';
  var w='',dn=['ne','po','út','st','čt','pá','so'];for(var i=6;i>=0;i--){var x=new Date();x.setDate(x.getDate()-i);var v=a[dkey(x)]||0;w+='<div><b class="'+(v>=goal?'on':'')+(i===0?' today':'')+'" title="'+Math.round(v)+' min"></b>'+dn[x.getDay()]+'</div>'}$('week').innerHTML=w}
$('goal').value=String(ls('sh_goal',25));$('goal').onchange=function(){ss('sh_goal',+this.value);streak()};streak();
/* pomodoro */
var modes=[['Učení',25],['Pauza',5],['Dlouhá pauza',15]],pm=0,left=25*60,end=0,tk=null;
function pchips(){$('pmodes').innerHTML=modes.map(function(m,i){return '<button class="chip'+(i===pm?' on':'')+'" data-m="'+i+'">'+m[0]+' '+m[1]+'′</button>'}).join('')}
function pdraw(){var s=Math.max(0,Math.ceil(left));$('ptime').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');$('pgo').textContent=tk?'⏸ Pauza':'▶ Start';document.title=tk?$('ptime').textContent+' · Studovna FBMI':'Studovna FBMI – Fyzioterapie, 1. ročník';var c=ls('sh_pomos',{})[dkey()]||0;$('pinfo').textContent='Dnes '+c+' '+(c===1?'pomodoro':c>=2&&c<=4?'pomodora':'pomodor')}
function beep(){try{var C=new (window.AudioContext||window.webkitAudioContext)(),o=C.createOscillator(),g=C.createGain();o.connect(g);g.connect(C.destination);o.frequency.value=880;g.gain.setValueAtTime(.2,C.currentTime);g.gain.exponentialRampToValueAtTime(.001,C.currentTime+1.2);o.start();o.stop(C.currentTime+1.2)}catch(e){}if(navigator.vibrate)navigator.vibrate([200,100,200])}
function stop(){clearInterval(tk);tk=null}
function tick(){left=(end-Date.now())/1000;if(left<=0){stop();left=0;beep();if(pm===0){var p=ls('sh_pomos',{});p[dkey()]=(p[dkey()]||0)+1;ss('sh_pomos',p);addMin(modes[0][1]);pm=1}else pm=0;left=modes[pm][1]*60;pchips()}pdraw()}
$('pgo').onclick=function(){if(tk){stop();pdraw();return}end=Date.now()+left*1000;tk=setInterval(tick,500);pdraw()};
$('preset').onclick=function(){stop();left=modes[pm][1]*60;pdraw()};
$('pmodes').onclick=function(e){var b=e.target.closest('[data-m]');if(!b)return;stop();pm=+b.dataset.m;left=modes[pm][1]*60;pchips();pdraw()};
pchips();pdraw();
}
/* anki */
try{localStorage.removeItem('sh_fc')}catch(e){}
if($('ankil'))$('ankil').innerHTML=D.lessons.filter(function(l){return l.anki}).map(function(l){return '<li><span class="grow"><b>'+esc(l.subj+' – '+l.title)+'</b><br><span class="sub">'+esc(l.anki.deck)+' · '+l.anki.cards+' karet · '+l.anki.mb+' MB</span></span><a class="chip" style="min-height:34px;display:inline-flex;align-items:center;text-decoration:none" href="'+l.anki.file+'" download>⬇ .apkg</a></li>'}).join('')||'<li class="empty">Zatím žádné balíčky.</li>';
/* deadlines */
if($('dl')){
var EX=[{t:'Latina – test slovíček L5–6',o:10,ex:1},{t:'Anatomie – zápočtový test: svaly hlavy a krku',o:17,ex:1},{t:'Odevzdat protokol z kineziologie',o:24,ex:1}];
var dl=ls('sh_deadlines',null);if(!dl){dl=EX.map(function(x){var d=new Date();d.setDate(d.getDate()+x.o);return{t:x.t,d:dkey(d),ex:1}});ss('sh_deadlines',dl)}
function drawDl(){dl.sort(function(a,b){return a.d<b.d?-1:1});var today=dkey();
  $('dl').innerHTML=dl.length?dl.map(function(x,i){var days=Math.round((new Date(x.d+'T12:00')-new Date(today+'T12:00'))/864e5),p=x.d.split('-');
    return '<li><span class="d'+(days<=7&&days>=0?' soon':'')+'">'+(+p[2])+'. '+(+p[1])+'.</span><span class="grow">'+esc(x.t)+(x.ex?'<span class="ex">příklad</span>':'')+'<br><span class="sub">'+(days<0?'proběhlo':days===0?'dnes!':days===1?'zítra':'za '+days+' '+(days<5?'dny':'dní'))+'</span></span><button data-del="'+i+'" aria-label="Smazat">✕</button></li>'}).join(''):'<li class="empty">Zatím nic – přidej první termín 👇</li>'}
$('dl').onclick=function(e){var b=e.target.closest('[data-del]');if(!b)return;dl.splice(+b.dataset.del,1);ss('sh_deadlines',dl);drawDl()};
$('dform').onsubmit=function(e){e.preventDefault();var t=$('dtitle').value.trim(),d=$('ddate').value;if(!t||!d)return;dl.push({t:t.slice(0,120),d:d});ss('sh_deadlines',dl);this.reset();drawDl()};
drawDl();
}
/* backup */
if($('exp')){
$('exp').onclick=function(){var o={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(/^(sh_(?!fc)|anat_|latina_|bio_)/.test(k))o[k]=localStorage.getItem(k)}
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(o)],{type:'application/json'}));a.download='studovna-zaloha-'+dkey()+'.json';document.body.appendChild(a);a.click();a.remove()};
$('imp').onclick=function(){$('impf').click()};
$('impf').onchange=function(){var f=this.files[0];if(!f)return;f.text().then(function(t){var o=JSON.parse(t);Object.keys(o).forEach(function(k){if(/^(sh_(?!fc)|anat_|latina_|bio_)/.test(k)&&typeof o[k]==='string')localStorage.setItem(k,o[k])});location.reload()}).catch(function(){alert('Soubor se nepodařilo načíst.')})};
}

/* anki page groups */
if($('ankigroups')){var g={};D.lessons.forEach(function(l){if(l.anki)(g[l.subj]=g[l.subj]||[]).push(l)});
 $('ankigroups').innerHTML=Object.keys(g).map(function(s){var tot=g[s].reduce(function(a,l){return a+l.anki.cards},0);
  return '<section class="panel"><h3>'+subjIcon(s)+' '+esc(s)+' <small class="sub">'+g[s].length+' balíčků · '+tot+' karet</small></h3><ul class="dl">'+g[s].map(function(l){return '<li><span class="grow"><b>'+esc(l.title)+'</b><br><span class="sub">'+esc(l.anki.deck)+' · '+l.anki.cards+' karet · '+l.anki.mb+' MB</span></span><a class="btn sm" href="'+l.anki.file+'" download>⬇ .apkg</a></li>'}).join('')+'</ul></section>'}).join('')||'<p class="empty">Zatím žádné balíčky.</p>'}
/* home */
if($('cont')){var last=ls('sh_last',null),P=D.lessons.map(function(l){return{l:l,p:progress(l)}});
 var cur=P.filter(function(x){return x.l.slug===last})[0]||P.filter(function(x){return x.p.pct>0&&x.p.pct<100})[0];
 var card=function(x,lbl){return '<a class="card wide" href="viewer.html?l='+encodeURIComponent(x.l.slug)+'"><div class="tag'+(x.l.type==='lat'?' lat':'')+'">'+esc(x.l.subj)+(lbl?' · '+lbl:'')+'</div><h3>'+esc(x.l.title)+'</h3><p>'+esc(x.l.desc)+'</p><div class="bar"><i style="width:'+x.p.pct+'%"></i></div><div class="row"><span class="sub grow">'+(x.p.manual?'✅ hotovo':x.p.done+'/'+x.p.total+' cvičení · '+x.p.pct+' %')+'</span><span class="btn sm pri">Pokračovat →</span></div></a>'};
 var started=P.filter(function(x){return x.p.pct>0&&x.p.pct<100&&(!cur||x.l.slug!==cur.l.slug)}).slice(0,2);
 $('cont').innerHTML=cur?'<div class="rail">'+card(cur,'naposledy otevřeno')+started.map(function(x){return card(x,'rozpracováno')}).join('')+'</div>':'<div class="panel row wrapr"><span class="grow">Zatím jsi nic neotevřel. Začni třeba první lekcí latiny nebo svaly hlavy a krku.</span><a class="btn pri" href="lekce.html">Vybrat lekci →</a></div>';
 var bySubj={};P.forEach(function(x){var b=bySubj[x.l.subj]=bySubj[x.l.subj]||{n:0,s:0,d:0};b.n++;b.s+=x.p.pct;if(x.p.pct>=100)b.d++});
 var a=ls('sh_activity',{}),t=Math.round(a[dkey()]||0),goal=+ls('sh_goal',25);
 $('stats').innerHTML=Object.keys(bySubj).map(function(s){var b=bySubj[s],pc=Math.round(b.s/b.n);return '<a class="panel stat" href="lekce.html?s='+encodeURIComponent(s)+'"><small>'+esc(s)+'</small><b>'+pc+' %</b><div class="bar"><i style="width:'+pc+'%"></i></div><span class="sub">'+b.d+' z '+b.n+' lekcí hotovo</span></a>'}).join('')+'<a class="panel stat" href="nastroje.html#today"><small>Dnes</small><b>'+t+' / '+goal+' min</b><div class="bar"><i style="width:'+Math.min(100,100*t/goal)+'%"></i></div><span class="sub">denní cíl · pomodoro</span></a>'}
})();
