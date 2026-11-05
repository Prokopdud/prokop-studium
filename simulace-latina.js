(function(){var D=window.SIMLAT,$=function(i){return document.getElementById(i)},cur=[],tl=0,tmr=null;
var sel=$('var');Object.keys(D).forEach(function(k){sel.add(new Option(D[k].name+' – '+D[k].items.length+' položek',k))});sel.add(new Option('Náhodný mix (45 položek z A–C)','MIX'));
function setMin(){$('min').value=sel.value=='MIX'?30:D[sel.value].min}sel.onchange=setMin;setMin();
var AB={'m':'musculus','mm':'musculi','a':'arteria','aa':'arteriae','v':'vena','vv':'venae','n':'nervus','nn':'nervi','lig':'ligamentum','ligg':'ligamenta','r':'ramus','rr':'rami','gl':'glandula','art':'articulatio'};
function base(s){return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[–\-\/,.:;()!?]/g,' ').replace(/\s+/g,' ').trim()}
function lat(s){return base(s.replace(/æ/gi,'ae').replace(/œ/gi,'oe')).split(' ').map(function(w){return AB[w]||w}).join(' ').replace(/y/g,'y')}
function ok(it,v){var f=it[0]=='L'?lat:base;return it[2].split('|').some(function(a){return f(a)==f(v)})}
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.random()*(i+1)|0,t=a[i];a[i]=a[j];a[j]=t}return a}
function start(items,name){cur=items;$('setup').hidden=true;$('res').hidden=true;$('test').hidden=false;$('vname').textContent=name;
 $('qs').innerHTML=items.map(function(it,i){return '<div class="q"><span class="n">'+(i+1)+'.</span><label for="q'+i+'"><span class="tag">'+(it[0]=='L'?'→ latinsky':'→ česky')+'</span>'+esc(it[1])+'</label><input id="q'+i+'" autocomplete="off" autocapitalize="off" spellcheck="false" lang="'+(it[0]=='L'?'la':'cs')+'"></div>'}).join('');
 tl=Math.max(1,+$('min').value||30)*60;clearInterval(tmr);tick();tmr=setInterval(tick,1000);scrollTo(0,0)}
function esc(s){return s.replace(/[&<>"]/g,function(c){return'&#'+c.charCodeAt(0)+';'})}
function tick(){if(tl<=0){finish(true);return}$('clock').textContent=String(tl/60|0).padStart(2,'0')+':'+String(tl%60).padStart(2,'0');$('clock').style.color=tl<120?'var(--acc2)':'';tl--}
function finish(timeout){clearInterval(tmr);var bad=[],g=0;cur.forEach(function(it,i){var v=$('q'+i).value;if(ok(it,v))g++;else bad.push([it,v])});
 var p=Math.round(g/cur.length*100);$('test').hidden=true;var r=$('res');r.hidden=false;
 r.innerHTML=(timeout?'<p class="banner">⏰ Čas vypršel – test odevzdán automaticky.</p>':'')+'<h2>Výsledek: '+g+' / '+cur.length+' ('+p+' %)</h2>'+
 (bad.length?'<h3>Chyby ('+bad.length+')</h3><div class="sim">'+bad.map(function(b){return '<div class="q bad"><label><span class="tag">'+esc(b[0][1])+'</span>Tvoje: <i>'+(esc(b[1])||'—')+'</i></label><span>✔ <b>'+esc(b[0][2].split('|')[0])+'</b></span></div>'}).join('')+'</div>':'<p>Bez chyby! 🎉</p>')+
 '<p class="btns left">'+(bad.length?'<button class="btn pri" id="retry">🔁 Zopakovat jen chyby</button>':'')+'<button class="btn" id="again">Nový test</button></p>';
 if(bad.length)$('retry').onclick=function(){$('min').value=Math.max(3,Math.ceil(bad.length*0.45));start(bad.map(function(b){return b[0]}),'Opakování chyb')};
 $('again').onclick=function(){r.hidden=true;$('setup').hidden=false};scrollTo(0,0)}
$('start').onclick=function(){var k=sel.value,it;if(k=='MIX'){var all=[];Object.keys(D).forEach(function(x){all=all.concat(D[x].items.slice(0,-3))});it=shuffle(all).slice(0,42).concat(shuffle([D.A.items[67],D.B.items[40],D.C.items[41],D.A.items[68]]).slice(0,3))}else it=D[k].items;start(it,k=='MIX'?'Náhodný mix':D[k].name)};
$('done').onclick=$('done2').onclick=function(){if(confirm('Odevzdat test?'))finish(false)};})();
