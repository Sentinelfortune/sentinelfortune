/* =====================================================
SENTINEL FORTUNE LLC — app.js
Full living site: game, audio, podcast, video, particles
===================================================== */
“use strict”;

var $ = function(s,c){return (c||document).querySelector(s);};
var $$ = function(s,c){return Array.from((c||document).querySelectorAll(s));};
function esc(s){var d=document.createElement(“div”);d.textContent=String(s||””);return d.innerHTML;}
async function loadJSON(path,fallback){
try{var r=await fetch(path);if(!r.ok)throw new Error(r.status);return await r.json();}
catch(e){console.warn(”[SF]”,path,e.message);return fallback||[];}
}

/* =====================================================
PARTICLES
===================================================== */
function initParticles(){
var cv=$(”#particles”);if(!cv)return;
var ctx=cv.getContext(“2d”);var W,H,pts;
function resize(){
W=cv.width=window.innerWidth;H=cv.height=window.innerHeight;
var n=Math.floor(W*H/13000);pts=[];
for(var i=0;i<n;i++)pts.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.2+.2,dx:(Math.random()-.5)*.15,dy:(Math.random()-.5)*.15,a:Math.random()*.5+.08,gold:Math.random()>.72});
}
function draw(){
ctx.clearRect(0,0,W,H);
pts.forEach(function(p){
ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
ctx.fillStyle=p.gold?“rgba(212,175,55,”+p.a+”)”:“rgba(160,175,220,”+(p.a*.5)+”)”;
ctx.fill();p.x=(p.x+p.dx+W)%W;p.y=(p.y+p.dy+H)%H;
});
requestAnimationFrame(draw);
}
resize();draw();
window.addEventListener(“resize”,resize,{passive:true});
}

/* =====================================================
HEADER
===================================================== */
function initHeader(){
var hdr=$(”#header”),burger=$(”#burger”),mnav=$(”#mobileNav”);
window.addEventListener(“scroll”,function(){hdr.classList.toggle(“scrolled”,window.scrollY>50);},{passive:true});
if(burger&&mnav){
burger.addEventListener(“click”,function(){
var open=mnav.classList.toggle(“open”);
burger.setAttribute(“aria-expanded”,open?“true”:“false”);
mnav.setAttribute(“aria-hidden”,open?“false”:“true”);
});
$$(”.mnav-a”,mnav).forEach(function(l){
l.addEventListener(“click”,function(){mnav.classList.remove(“open”);burger.setAttribute(“aria-expanded”,“false”);mnav.setAttribute(“aria-hidden”,“true”);});
});
}
}

/* =====================================================
SMOOTH SCROLL
===================================================== */
function initScroll(){
$$(“a[href^="#"]”).forEach(function(a){
a.addEventListener(“click”,function(e){
var t=$(a.getAttribute(“href”));
if(t){e.preventDefault();window.scrollTo({top:t.getBoundingClientRect().top+window.scrollY-70,behavior:“smooth”});}
});
});
}

/* =====================================================
TYPING EFFECT
===================================================== */
function initTyping(){
var el=$(”#heroOver”);if(!el)return;
var txt=el.textContent.trim();el.textContent=””;var i=0;
var t=setInterval(function(){if(i<txt.length){el.textContent+=txt[i++];}else clearInterval(t);},55);
}

/* =====================================================
SCROLL REVEAL
===================================================== */
function initReveal(){
if(!window.IntersectionObserver)return;
document.body.classList.add(“js-reveal”);
var io=new IntersectionObserver(function(entries){
entries.forEach(function(e,i){
if(e.isIntersecting){setTimeout(function(){e.target.classList.add(“visible”);},i*70);io.unobserve(e.target);}
});
},{threshold:.06});
$$(”.reveal”).forEach(function(el){io.observe(el);});
}

/* =====================================================
HERO AUDIO VISUALIZER (Web Audio API)
===================================================== */
var heroAudioCtx=null,heroOscArr=[],heroGain=null,heroVizRunning=false;

function initHeroViz(){
var wrap=$(”#heroViz”),cv=$(”#vizCanvas”);if(!wrap||!cv)return;
var ctx=cv.getContext(“2d”);
cv.width=wrap.offsetWidth||400;cv.height=60;

/* Draw idle waveform */
function drawIdle(){
ctx.clearRect(0,0,cv.width,cv.height);
var t=Date.now()/1000;
for(var x=0;x<cv.width;x++){
var y=cv.height/2+Math.sin(x*.04+t*2)*6+Math.sin(x*.08+t*1.3)*3;
ctx.fillStyle=“rgba(212,175,55,”+(0.15+Math.abs(Math.sin(x*.04+t))*.25)+”)”;
ctx.fillRect(x,y,1,cv.height-y);
}
if(!heroVizRunning)requestAnimationFrame(drawIdle);
}
drawIdle();

wrap.addEventListener(“click”,function(){
if(heroVizRunning){stopHeroSound();return;}
try{
heroAudioCtx=new(window.AudioContext||window.webkitAudioContext)();
heroGain=heroAudioCtx.createGain();heroGain.gain.value=.15;heroGain.connect(heroAudioCtx.destination);
var freqs=[55,110,165,220];
heroOscArr=freqs.map(function(f,i){
var o=heroAudioCtx.createOscillator();
o.type=[“sine”,“sine”,“triangle”,“sine”][i];o.frequency.value=f;
var g=heroAudioCtx.createGain();g.gain.value=i===0?.5:.15;
o.connect(g);g.connect(heroGain);o.start();return o;
});
heroVizRunning=true;
drawLive();
}catch(e){console.warn(“Audio not supported”);}
});

function drawLive(){
if(!heroVizRunning)return;
ctx.clearRect(0,0,cv.width,cv.height);
var t=Date.now()/1000;
var bars=Math.floor(cv.width/4);
for(var i=0;i<bars;i++){
var x=i*4;
var h=cv.height*.3+Math.abs(Math.sin(i*.15+t*3+i*.05))*cv.height*.6;
var alpha=.3+Math.abs(Math.sin(i*.1+t*2))*.6;
ctx.fillStyle=“rgba(212,175,55,”+alpha+”)”;
ctx.fillRect(x,cv.height-h,3,h);
}
requestAnimationFrame(drawLive);
}
}

function stopHeroSound(){
heroOscArr.forEach(function(o){try{o.stop();}catch(e){}});
heroOscArr=[];heroVizRunning=false;
if(heroAudioCtx){heroAudioCtx.close();heroAudioCtx=null;}
}

/* =====================================================
MINI GAME — Focus Run
===================================================== */
function initGame(){
var cv=$(”#gameCanvas”),overlay=$(”#gameOverlay”),startBtn=$(”#gameStart”),
hud=$(”#gameHud”),scoreEl=$(”#gameScore”),bestEl=$(”#gameBest”);
if(!cv)return;
var ctx=cv.getContext(“2d”);
cv.width=340;cv.height=160;
var W=340,H=160,best=0,score=0,running=false,raf;
var player={x:50,y:H-40,w:20,h:20,vy:0,onGround:true};
var obstacles=[],speed=2.5,frame=0,obstTimer=0;

function reset(){
score=0;speed=2.5;frame=0;obstTimer=0;obstacles=[];
player.y=H-40;player.vy=0;player.onGround=true;
scoreEl.textContent=“0”;
}

function jump(){if(player.onGround){player.vy=-8;player.onGround=false;}}

function spawnObstacle(){
var h=20+Math.random()*30;
obstacles.push({x:W,y:H-20-h,w:14,h:h});
}

function update(){
frame++;speed+=.0008;
player.vy+=.5;player.y+=player.vy;
if(player.y>=H-40){player.y=H-40;player.vy=0;player.onGround=true;}
obstTimer++;
if(obstTimer>Math.max(50,90-speed*3)){obstTimer=0;spawnObstacle();}
for(var i=obstacles.length-1;i>=0;i–){
obstacles[i].x-=speed;
if(obstacles[i].x+obstacles[i].w<0){obstacles.splice(i,1);score++;scoreEl.textContent=score;}
if(rectsCollide(player,obstacles[i])){gameOver();return;}
}
}

function rectsCollide(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}

function draw(){
ctx.clearRect(0,0,W,H);
/* Ground */
ctx.fillStyle=“rgba(212,175,55,.15)”;ctx.fillRect(0,H-20,W,2);
/* Stars */
ctx.fillStyle=“rgba(212,175,55,.3)”;
for(var s=0;s<30;s++){ctx.fillRect((s*73+frame*.3)%W,(s*41)%100,1,1);}
/* Player */
var grad=ctx.createLinearGradient(player.x,player.y,player.x,player.y+player.h);
grad.addColorStop(0,”#FFD700”);grad.addColorStop(1,”#8a7020”);
ctx.fillStyle=grad;
ctx.beginPath();ctx.roundRect(player.x,player.y,player.w,player.h,4);ctx.fill();
/* Obstacles */
obstacles.forEach(function(o){
var og=ctx.createLinearGradient(o.x,o.y,o.x,o.y+o.h);
og.addColorStop(0,“rgba(212,175,55,.8)”);og.addColorStop(1,“rgba(212,175,55,.2)”);
ctx.fillStyle=og;ctx.fillRect(o.x,o.y,o.w,o.h);
});
/* Score */
ctx.fillStyle=“rgba(212,175,55,.5)”;ctx.font=“10px Cinzel,serif”;
ctx.fillText(“SCORE “+score,8,16);
}

function gameOver(){
cancelAnimationFrame(raf);running=false;
if(score>best){best=score;bestEl.textContent=best;}
overlay.innerHTML=””;
var msg=document.createElement(“div”);msg.style.cssText=“text-align:center”;
msg.innerHTML=”<div style="color:#D4AF37;font-family:Cinzel,serif;font-size:11px;letter-spacing:.2em;margin-bottom:12px">SCORE “+score+”</div>”;
var btn=document.createElement(“button”);btn.className=“btn btn-gold”;btn.textContent=“▶ Play Again”;
btn.addEventListener(“click”,startGame);
msg.appendChild(btn);overlay.appendChild(msg);overlay.style.display=“flex”;hud.style.display=“none”;
}

function startGame(){
overlay.style.display=“none”;hud.style.display=“flex”;reset();running=true;
function loop(){if(!running)return;update();draw();raf=requestAnimationFrame(loop);}
loop();
}

startBtn.addEventListener(“click”,startGame);
document.addEventListener(“keydown”,function(e){if(e.code===“Space”||e.code===“ArrowUp”){e.preventDefault();jump();}});
$(”#gameCanvas”).addEventListener(“click”,jump);
$(”#gameCanvas”).addEventListener(“touchstart”,function(e){e.preventDefault();jump();},{passive:false});

/* Idle draw */
function idleDraw(){
if(running)return;
ctx.clearRect(0,0,W,H);
var t=Date.now()/1000;
ctx.fillStyle=“rgba(212,175,55,.06)”;ctx.fillRect(0,H-20,W,2);
for(var s=0;s<20;s++){ctx.fillStyle=“rgba(212,175,55,”+(Math.abs(Math.sin(s+t))*.4+.1)+”)”;ctx.fillRect((s*73+t*20)%W,(s*31)%120,1,1);}
requestAnimationFrame(idleDraw);
}
idleDraw();
}

/* =====================================================
AUDIO PLAYER (Web Audio generated tones)
===================================================== */
var audioCtx=null,audioOscs=[],audioGainNode=null,audioPlaying=false,audioVizRaf;

function initAudioPlayer(){
var playBtn=$(”#audioPlay”),stopBtn=$(”#audioStop”),vizCv=$(”#audioViz”),bars=$$(”.ab”);
if(!playBtn)return;
var ctx2=vizCv?vizCv.getContext(“2d”):null;
if(vizCv){vizCv.width=340;vizCv.height=90;}

function startAudio(){
if(audioPlaying)return;
try{
audioCtx=new(window.AudioContext||window.webkitAudioContext)();
audioGainNode=audioCtx.createGain();audioGainNode.gain.value=.08;audioGainNode.connect(audioCtx.destination);
/* Ambient pad: layered frequencies */
var freqs=[55,82.5,110,138,165,220,275,330,440];
audioOscs=freqs.map(function(f,i){
var o=audioCtx.createOscillator();o.type=i%2===0?“sine”:“triangle”;o.frequency.value=f;
var g=audioCtx.createGain();g.gain.value=i<2?.35:.12;
o.connect(g);g.connect(audioGainNode);o.start();return o;
});
audioPlaying=true;
playBtn.textContent=“⏸”;
animateAudio();
}catch(e){console.warn(“Audio API not available”);}
}

function stopAudio(){
audioOscs.forEach(function(o){try{o.stop();}catch(e){}});
audioOscs=[];audioPlaying=false;
if(audioCtx){audioCtx.close();audioCtx=null;}
playBtn.textContent=“▶”;
cancelAnimationFrame(audioVizRaf);
if(ctx2){ctx2.clearRect(0,0,340,90);}
bars.forEach(function(b){b.style.height=“4px”;});
}

function animateAudio(){
var t=Date.now()/1000;
bars.forEach(function(b,i){
var h=8+Math.abs(Math.sin(i*1.3+t*2.5+i*.4))*40;
b.style.height=h+“px”;
});
if(ctx2){
ctx2.clearRect(0,0,340,90);
var n=60;
for(var i=0;i<n;i++){
var x=i*(340/n);
var h=10+Math.abs(Math.sin(i*.2+t*3))*60+Math.abs(Math.sin(i*.35+t*1.8))*20;
var alpha=.3+Math.abs(Math.sin(i*.15+t*2))*.6;
ctx2.fillStyle=“rgba(212,175,55,”+alpha+”)”;
ctx2.fillRect(x,90-h,340/n-1,h);
}
}
if(audioPlaying)audioVizRaf=requestAnimationFrame(animateAudio);
}

playBtn.addEventListener(“click”,function(){if(audioPlaying)stopAudio();else startAudio();});
stopBtn.addEventListener(“click”,stopAudio);
}

/* =====================================================
VIDEO MODAL
===================================================== */
function initVideo(){
var playBtn=$(”#videoPlay”),modal=$(”#videoModal”),closeBtn=$(”#videoClose”);
if(!playBtn||!modal)return;
playBtn.addEventListener(“click”,function(){modal.style.display=“flex”;document.body.style.overflow=“hidden”;});
if(closeBtn)closeBtn.addEventListener(“click”,function(){modal.style.display=“none”;document.body.style.overflow=””;});
modal.addEventListener(“click”,function(e){if(e.target===modal){modal.style.display=“none”;document.body.style.overflow=””;}});
document.addEventListener(“keydown”,function(e){if(e.key===“Escape”&&modal.style.display===“flex”){modal.style.display=“none”;document.body.style.overflow=””;}});
}

/* =====================================================
PODCAST PLAYER (generated tones per episode)
===================================================== */
var podCtx=null,podOscs=[],podPlaying=false,podEpIdx=-1,podTimer=null,podElapsed=0;
var podDurations=[150,105,190]; /* seconds per episode */

function initPodcast(){
var fill=$(”#podFill”),timeEl=$(”#podTime”),playBtns=$$(”.pod-play”),eps=$$(”.pod-ep”);
if(!playBtns.length)return;

function stopPod(){
podOscs.forEach(function(o){try{o.stop();}catch(e){}});podOscs=[];podPlaying=false;
if(podCtx){podCtx.close();podCtx=null;}
clearInterval(podTimer);
eps.forEach(function(e){e.classList.remove(“active”);});
playBtns.forEach(function(b){b.textContent=“▶”;});
}

function startPod(idx){
stopPod();podEpIdx=idx;podElapsed=0;podPlaying=true;
eps[idx].classList.add(“active”);playBtns[idx].textContent=“■”;

```
var epFreqs=[[55,110,220],[82.5,165,330],[65,130,195,260]];
var freqs=epFreqs[idx]||[55,110];
try{
  podCtx=new(window.AudioContext||window.webkitAudioContext)();
  var g=podCtx.createGain();g.gain.value=.06;g.connect(podCtx.destination);
  podOscs=freqs.map(function(f,i){
    var o=podCtx.createOscillator();o.type=i===0?"sine":"triangle";o.frequency.value=f;
    var og=podCtx.createGain();og.gain.value=i===0?.4:.15;o.connect(og);og.connect(g);o.start();return o;
  });
}catch(e){}

var dur=podDurations[idx]||120;
podTimer=setInterval(function(){
  podElapsed++;
  var pct=Math.min((podElapsed/dur)*100,100);
  if(fill)fill.style.width=pct+"%";
  var m=Math.floor(podElapsed/60),s=podElapsed%60;
  if(timeEl)timeEl.textContent=m+":"+(s<10?"0":"")+s;
  if(podElapsed>=dur){stopPod();if(fill)fill.style.width="0%";if(timeEl)timeEl.textContent="0:00";}
},1000);
```

}

playBtns.forEach(function(btn){
btn.addEventListener(“click”,function(e){
e.stopPropagation();
var idx=parseInt(btn.getAttribute(“data-ep”));
if(podPlaying&&podEpIdx===idx)stopPod();
else startPod(idx);
});
});
eps.forEach(function(ep){
ep.addEventListener(“click”,function(){
var idx=parseInt(ep.getAttribute(“data-ep”));
if(podPlaying&&podEpIdx===idx)stopPod();
else startPod(idx);
});
});
}

/* =====================================================
RENDER UNIVERSE CARDS
===================================================== */
function renderUniverse(data,container){
if(!container)return;
container.innerHTML=””;
if(!data||!data.length){container.innerHTML=”<p style="color:var(–white-d)">Coming soon.</p>”;return;}
data.forEach(function(item,i){
var card=document.createElement(“div”);
card.className=“u-card reveal”;card.style.transitionDelay=(i*55)+“ms”;
card.innerHTML=”<span class="u-icon">”+esc(item.icon||“◈”)+”</span>”+
“<div class="u-tag">”+esc(item.tag||””)+”</div>”+
“<div class="u-title">”+esc(item.title)+”</div>”+
“<div class="u-desc">”+esc(item.description)+”</div>”;
container.appendChild(card);
});
}

/* =====================================================
RENDER DROPS
===================================================== */
var BADGES={“Live”:“badge-live”,“Preview”:“badge-preview”,“Coming Soon”:“badge-soon”,“In Development”:“badge-dev”};
function renderDrops(data,container){
if(!container)return;
container.innerHTML=””;
if(!data||!data.length){container.innerHTML=”<p style="color:var(–white-d)">Coming soon.</p>”;return;}
data.forEach(function(item,i){
var card=document.createElement(“div”);
card.className=“d-card reveal”;card.style.transitionDelay=(i*60)+“ms”;
card.innerHTML=”<div class="d-cat">”+esc(item.category)+”</div>”+
“<div class="d-title">”+esc(item.title)+”</div>”+
“<div class="d-desc">”+esc(item.description)+”</div>”+
“<span class="d-badge “+(BADGES[item.status]||“badge-soon”)+”">”+esc(item.status)+”</span>”;
container.appendChild(card);
});
}

/* =====================================================
GOLD CURSOR
===================================================== */
function initCursor(){
if(window.matchMedia(”(pointer:coarse)”).matches)return;
var dot=document.createElement(“div”);
dot.style.cssText=“position:fixed;width:5px;height:5px;border-radius:50%;pointer-events:none;z-index:9999;background:rgba(212,175,55,.75);box-shadow:0 0 10px rgba(212,175,55,.5);transform:translate(-50%,-50%)”;
document.body.appendChild(dot);
window.addEventListener(“mousemove”,function(e){dot.style.left=e.clientX+“px”;dot.style.top=e.clientY+“px”;},{passive:true});
}

/* =====================================================
SUPPORT BUTTON
===================================================== */
function initSupport(site){
var btn=$(”#supportBtn”);if(!btn)return;
var link=site&&site.support_link;
if(link&&link.indexOf(“PLACEHOLDER”)===-1){btn.setAttribute(“href”,link);}
else{btn.textContent=“Support (Coming Soon)”;btn.style.opacity=”.42”;btn.style.pointerEvents=“none”;}
}

/* =====================================================
MAIN INIT
===================================================== */
async function init(){
initParticles();
initHeader();
initScroll();
initCursor();
initTyping();
initHeroViz();
initGame();
initAudioPlayer();
initVideo();
initPodcast();

var results=await Promise.all([
loadJSON(”./data/site.json”,{}),
loadJSON(”./data/universe.json”,[]),
loadJSON(”./data/releases.json”,[])
]);

renderUniverse(results[1],$(”#universeGrid”));
renderDrops(results[2],$(”#dropsGrid”));
initSupport(results[0]);

requestAnimationFrame(function(){initReveal();});
}

document.addEventListener(“DOMContentLoaded”,init);