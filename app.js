/* =====================================================
SENTINEL FORTUNE LLC — app.js
Vanilla JS · No dependencies · Production grade
Straight quotes only · IDs match index.html exactly
===================================================== */
“use strict”;

/* ── DOM helpers ───────────────────────────────────── */
var $ = function(sel, ctx) { return (ctx || document).querySelector(sel); };
var $$ = function(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); };

function esc(str) {
var d = document.createElement(“div”);
d.textContent = String(str || “”);
return d.innerHTML;
}

/* ── Load JSON (relative paths for GitHub Pages) ───── */
async function loadJSON(path, fallback) {
fallback = fallback || [];
try {
var res = await fetch(path);
if (!res.ok) { throw new Error(“HTTP “ + res.status); }
return await res.json();
} catch (err) {
console.warn(”[SF] Could not load “ + path + “ — “ + err.message);
return fallback;
}
}

/* =====================================================
PARTICLES — subtle navy-gold floating stars
Canvas ID: particles (matches <canvas id="particles">)
===================================================== */
function initParticles() {
var canvas = $(”#particles”);
if (!canvas) { return; }
var ctx = canvas.getContext(“2d”);
var W, H, pts;

function resize() {
W = canvas.width  = window.innerWidth;
H = canvas.height = window.innerHeight;
var count = Math.floor((W * H) / 13000);
pts = [];
for (var i = 0; i < count; i++) {
pts.push({
x:    Math.random() * W,
y:    Math.random() * H,
r:    Math.random() * 1.2 + 0.2,
dx:   (Math.random() - 0.5) * 0.16,
dy:   (Math.random() - 0.5) * 0.16,
a:    Math.random() * 0.5 + 0.08,
gold: Math.random() > 0.72
});
}
}

function draw() {
ctx.clearRect(0, 0, W, H);
for (var i = 0; i < pts.length; i++) {
var p = pts[i];
ctx.beginPath();
ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
ctx.fillStyle = p.gold
? (“rgba(212,175,55,” + p.a + “)”)
: (“rgba(160,175,220,” + (p.a * 0.55) + “)”);
ctx.fill();
p.x = (p.x + p.dx + W) % W;
p.y = (p.y + p.dy + H) % H;
}
requestAnimationFrame(draw);
}

resize();
draw();
window.addEventListener(“resize”, resize, { passive: true });
}

/* =====================================================
HEADER — scroll effect + mobile nav
Burger ID:     burger         (matches id=“burger”)
MobileNav ID:  mobileNav      (matches id=“mobileNav”)
MobileLinks:   .mnav-a        (matches class=“mnav-a”)
===================================================== */
function initHeader() {
var header    = $(”#header”);
var burger    = $(”#burger”);
var mobileNav = $(”#mobileNav”);

window.addEventListener(“scroll”, function() {
if (window.scrollY > 50) {
header.classList.add(“scrolled”);
} else {
header.classList.remove(“scrolled”);
}
}, { passive: true });

if (burger && mobileNav) {
burger.addEventListener(“click”, function() {
var open = mobileNav.classList.toggle(“open”);
burger.setAttribute(“aria-expanded”, open ? “true” : “false”);
mobileNav.setAttribute(“aria-hidden”, open ? “false” : “true”);
});

```
/* Close mobile nav when a link is tapped */
$$(".mnav-a", mobileNav).forEach(function(link) {
  link.addEventListener("click", function() {
    mobileNav.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
    mobileNav.setAttribute("aria-hidden", "true");
  });
});
```

}
}

/* =====================================================
SMOOTH SCROLL for all anchor links
===================================================== */
function initSmoothScroll() {
$$(“a[href^="#"]”).forEach(function(a) {
a.addEventListener(“click”, function(e) {
var target = $(a.getAttribute(“href”));
if (target) {
e.preventDefault();
var top = target.getBoundingClientRect().top + window.scrollY - 70;
window.scrollTo({ top: top, behavior: “smooth” });
}
});
});
}

/* =====================================================
SCROLL REVEAL — .reveal elements
===================================================== */
function initReveal() {
var io = new IntersectionObserver(function(entries) {
entries.forEach(function(entry, i) {
if (entry.isIntersecting) {
setTimeout(function() {
entry.target.classList.add(“visible”);
}, i * 75);
io.unobserve(entry.target);
}
});
}, { threshold: 0.08 });

$$(”.reveal”).forEach(function(el) { io.observe(el); });
}

/* =====================================================
SECTION TAG SHIMMER — .section-tag elements
===================================================== */
function initTagShimmer() {
var io = new IntersectionObserver(function(entries) {
entries.forEach(function(entry) {
if (entry.isIntersecting) {
entry.target.classList.add(“visible”);
io.unobserve(entry.target);
}
});
}, { threshold: 0.5 });

$$(”.section-tag”).forEach(function(tag) {
io.observe(tag);
});
}

/* =====================================================
GOLD CURSOR DOT (desktop only)
===================================================== */
function initCursor() {
if (window.matchMedia(”(pointer: coarse)”).matches) { return; }
var dot = document.createElement(“div”);
dot.style.cssText = [
“position:fixed”,
“width:5px”, “height:5px”,
“border-radius:50%”,
“pointer-events:none”,
“z-index:9999”,
“background:rgba(212,175,55,0.75)”,
“box-shadow:0 0 10px rgba(212,175,55,0.5)”,
“transform:translate(-50%,-50%)”,
“transition:left 0.06s,top 0.06s”
].join(”;”);
document.body.appendChild(dot);
window.addEventListener(“mousemove”, function(e) {
dot.style.left = e.clientX + “px”;
dot.style.top  = e.clientY + “px”;
}, { passive: true });
}

/* =====================================================
TYPING EFFECT — hero overline
Element ID: heroOverline (matches id=“heroOverline”)
===================================================== */
function initTyping() {
var el = $(”#heroOverline”);
if (!el) { return; }
var text = el.textContent.trim();
el.textContent = “”;
var i = 0;
var t = setInterval(function() {
if (i < text.length) {
el.textContent += text[i];
i++;
} else {
clearInterval(t);
}
}, 52);
}

/* =====================================================
RENDER: Universe Grid
JSON schema: { id, title, tag, description }
Container:   #universeGrid
===================================================== */
function renderUniverse(data, container) {
if (!container) { return; }
container.innerHTML = “”;
if (!data || !data.length) {
container.innerHTML = “<p class="section-p">Coming soon.</p>”;
return;
}
data.forEach(function(item, i) {
var card = document.createElement(“div”);
card.className = “u-card reveal”;
card.style.transitionDelay = (i * 55) + “ms”;
card.innerHTML =
“<span class="u-icon">” + esc(item.icon || “◈”) + “</span>” +
“<div class="u-tag">”   + esc(item.tag || “”)  + “</div>” +
“<div class="u-title">” + esc(item.title)       + “</div>” +
“<div class="u-desc">”  + esc(item.description) + “</div>”;
container.appendChild(card);
});
}

/* =====================================================
RENDER: Featured Experiences
JSON schema: { id, type, title, description, link, cta }
Container:   #featuredGrid
===================================================== */
function renderFeatured(data, container) {
if (!container) { return; }
container.innerHTML = “”;
if (!data || !data.length) {
container.innerHTML = “<p class="section-p">Coming soon.</p>”;
return;
}
data.forEach(function(item, i) {
var hasLink = item.link && item.link !== “#”;
var linkHtml = hasLink
? “<a href="” + esc(item.link) + “" class="f-link">” + esc(item.cta || “Explore”) + “</a>”
: “<span class="f-link disabled">Coming Soon</span>”;
var card = document.createElement(“div”);
card.className = “f-card reveal”;
card.style.transitionDelay = (i * 80) + “ms”;
card.innerHTML =
“<div class="f-type">”  + esc(item.type)        + “</div>” +
“<div class="f-title">” + esc(item.title)       + “</div>” +
“<div class="f-desc">”  + esc(item.description) + “</div>” +
linkHtml;
container.appendChild(card);
});
}

/* =====================================================
RENDER: Public Drops
JSON schema: { id, category, title, description, status }
Container:   #dropsGrid
===================================================== */
var BADGE_MAP = {
“Live”:           “badge-live”,
“Preview”:        “badge-preview”,
“Coming Soon”:    “badge-soon”,
“In Development”: “badge-dev”
};

function renderDrops(data, container) {
if (!container) { return; }
container.innerHTML = “”;
if (!data || !data.length) {
container.innerHTML = “<p class="section-p">Coming soon.</p>”;
return;
}
data.forEach(function(item, i) {
var badgeCls = BADGE_MAP[item.status] || “badge-soon”;
var card = document.createElement(“div”);
card.className = “d-card reveal”;
card.style.transitionDelay = (i * 60) + “ms”;
card.innerHTML =
“<div class="d-cat">”   + esc(item.category)   + “</div>” +
“<div class="d-title">” + esc(item.title)       + “</div>” +
“<div class="d-desc">”  + esc(item.description) + “</div>” +
“<span class="d-badge “ + badgeCls + “">” + esc(item.status) + “</span>”;
container.appendChild(card);
});
}

/* =====================================================
SUPPORT BUTTON — replace STRIPE placeholder
===================================================== */
function initSupport(site) {
var btn = $(”#supportBtn”);
if (!btn) { return; }
var link = site && site.support_link;
if (link && link.indexOf(“PLACEHOLDER”) === -1) {
btn.setAttribute(“href”, link);
} else {
btn.textContent = “Support (Coming Soon)”;
btn.style.opacity = “0.42”;
btn.style.pointerEvents = “none”;
btn.setAttribute(“href”, “#”);
}
}

/* =====================================================
MAIN INIT
===================================================== */
async function init() {
initParticles();
initHeader();
initSmoothScroll();
initCursor();
initTyping();

/* Relative paths — required for GitHub Pages subpath deploy */
var results = await Promise.all([
loadJSON(”./data/site.json”,     {}),
loadJSON(”./data/universe.json”, []),
loadJSON(”./data/featured.json”, []),
loadJSON(”./data/releases.json”, [])
]);

var site     = results[0];
var universe = results[1];
var featured = results[2];
var releases = results[3];

renderUniverse(universe, $(”#universeGrid”));
renderFeatured(featured,  $(”#featuredGrid”));
renderDrops(releases,     $(”#dropsGrid”));
initSupport(site);

requestAnimationFrame(function() {
initReveal();
initTagShimmer();
});
}

document.addEventListener(“DOMContentLoaded”, init);