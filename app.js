// app.js
// Tinder Clone — frontend connected to the AI-Tinder REST backend.
//
// Changes from the original mock:
//   • generateProfiles() replaced with fetchProfiles() (calls GET /profiles)
//   • resolveDecision() POSTs to /swipes after animating
//   • Match detection: shows a modal overlay on matched: true
//   • JWT stored in memory; refresh handled automatically on 401
//   • Login/register UI injected if no session exists

// ─── Config ──────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:3001"; // change if backend runs elsewhere

// ─── Auth state (in-memory; lost on page reload — swap for sessionStorage if desired) ──
let accessToken = null;

async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(options.headers || {}),
  };

  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include", // send refresh cookie
  });

  // Auto-refresh on 401
  if (res.status === 401 && path !== "/auth/refresh" && path !== "/auth/login") {
    const refreshed = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) {
      const data = await refreshed.json();
      accessToken = data.accessToken;
      headers.Authorization = `Bearer ${accessToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
    } else {
      // Refresh failed — show login
      accessToken = null;
      showAuthOverlay();
      throw new Error("Session expired. Please log in again.");
    }
  }

  return res;
}

// ─── Profile deck state ──────────────────────────────────────────────────────
let profiles    = [];
let nextCursor  = null;
let isFetching  = false;
let isAnimating = false;
let lastTap     = { time: 0, x: 0, y: 0 };

// ─── DOM refs ────────────────────────────────────────────────────────────────
const deckEl      = document.getElementById("deck");
const shuffleBtn  = document.getElementById("shuffleBtn");
const likeBtn     = document.getElementById("likeBtn");
const nopeBtn     = document.getElementById("nopeBtn");
const superLikeBtn= document.getElementById("superLikeBtn");

// ─── Fetch profiles from backend ─────────────────────────────────────────────
async function fetchProfiles(reset = false) {
  if (isFetching) return;
  isFetching = true;
  try {
    const cursor = reset ? "" : (nextCursor ? `&cursor=${nextCursor}` : "");
    const res    = await apiFetch(`/profiles?limit=12${cursor}`);
    if (!res.ok) throw new Error("Failed to load profiles.");

    const data = await res.json();
    if (reset) {
      profiles = data.profiles.map((p) => ({ ...p, photoIndex: 0 }));
    } else {
      profiles = [...profiles, ...data.profiles.map((p) => ({ ...p, photoIndex: 0 }))];
    }
    nextCursor = data.nextCursor;
    renderDeck();
  } catch (err) {
    console.error(err);
  } finally {
    isFetching = false;
  }
}

// ─── UI rendering ────────────────────────────────────────────────────────────
function renderDeck() {
  deckEl.setAttribute("aria-busy", "true");
  deckEl.innerHTML = "";

  const visibleProfiles = profiles.slice(-3).reverse();

  visibleProfiles.forEach((p, idx) => {
    const card = document.createElement("article");
    card.className       = "card";
    card.dataset.profileId = p.id;
    card.style.zIndex    = String(100 - idx);

    const img = document.createElement("img");
    img.className = "card__media";
    img.src       = p.photos[p.photoIndex] || p.img || "";
    img.alt       = `${p.name} — profile photo`;

    const body = document.createElement("div");
    body.className = "card__body";

    const titleRow = document.createElement("div");
    titleRow.className = "title-row";
    titleRow.innerHTML = `
      <h2 class="card__title">${p.name}</h2>
      <span class="card__age">${p.age}</span>
    `;

    const meta = document.createElement("div");
    meta.className  = "card__meta";
    meta.textContent = `${p.title} • ${p.city}`;

    const chips = document.createElement("div");
    chips.className = "card__chips";
    (p.tags || []).forEach((t) => {
      const c = document.createElement("span");
      c.className   = "chip";
      c.textContent = t;
      chips.appendChild(c);
    });

    body.appendChild(titleRow);
    body.appendChild(meta);
    body.appendChild(chips);
    card.appendChild(img);
    card.appendChild(body);
    deckEl.appendChild(card);
  });

  deckEl.removeAttribute("aria-busy");
  attachTopCardHandlers();
}

function getTopCard()    { return deckEl.querySelector(".card"); }
function getTopProfile() { return profiles[profiles.length - 1] || null; }

function setControlsDisabled(disabled) {
  likeBtn.disabled      = disabled;
  nopeBtn.disabled      = disabled;
  superLikeBtn.disabled = disabled;
  shuffleBtn.disabled   = disabled;
}

// ─── Swipe logic ─────────────────────────────────────────────────────────────
async function resolveDecision(action) {
  if (isAnimating) return;
  const topCard    = getTopCard();
  const topProfile = getTopProfile();
  if (!topCard || !topProfile) return;

  const transforms = {
    nope:      "translate(-520px, -30px) rotate(-18deg)",
    like:      "translate(520px,  -30px) rotate(18deg)",
    superlike: "translate(0, -560px) rotate(0deg)",
  };
  const outTransform = transforms[action];
  if (!outTransform) return;

  isAnimating = true;
  setControlsDisabled(true);

  topCard.style.transition = "transform 240ms ease, opacity 240ms ease";
  topCard.style.transform  = outTransform;
  topCard.style.opacity    = "0";

  // Record swipe in parallel with animation
  let matchResult = null;
  try {
    const res = await apiFetch("/swipes", {
      method: "POST",
      body:   JSON.stringify({ toUserId: topProfile.id, action }),
    });
    if (res.ok) {
      matchResult = await res.json();
    }
  } catch (err) {
    console.error("Swipe record failed:", err);
  }

  window.setTimeout(async () => {
    profiles.pop();
    lastTap = { time: 0, x: 0, y: 0 };

    // Auto-refill when deck runs low
    if (profiles.length < 3) {
      await fetchProfiles(false);
    } else {
      renderDeck();
    }

    isAnimating = false;
    setControlsDisabled(false);

    // Show match overlay after animation settles
    if (matchResult?.matched) {
      showMatchOverlay(topProfile, matchResult);
    }
  }, 250);
}

// ─── Photo cycling ───────────────────────────────────────────────────────────
function advanceTopPhoto() {
  const topProfile = getTopProfile();
  const topCard    = getTopCard();
  if (!topProfile || !topCard || (topProfile.photos || []).length < 2) return;

  topProfile.photoIndex = (topProfile.photoIndex + 1) % topProfile.photos.length;
  const img = topCard.querySelector(".card__media");
  if (img) img.src = topProfile.photos[topProfile.photoIndex];
}

// ─── Drag/swipe gesture handlers ─────────────────────────────────────────────
function attachTopCardHandlers() {
  const topCard = getTopCard();
  if (!topCard) return;

  let pointerId = null, startX = 0, startY = 0;
  let currentX  = 0,   currentY = 0;
  let startTime = 0,   moved   = false;

  topCard.style.touchAction = "none";

  topCard.addEventListener("pointerdown", (e) => {
    if (isAnimating) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerId = e.pointerId;
    startX = currentX = e.clientX;
    startY = currentY = e.clientY;
    startTime = Date.now();
    moved = false;
    topCard.style.transition = "";
    topCard.setPointerCapture(pointerId);
  });

  topCard.addEventListener("pointermove", (e) => {
    if (pointerId !== e.pointerId) return;
    currentX = e.clientX;
    currentY = e.clientY;
    const dx = currentX - startX, dy = currentY - startY;
    if (Math.hypot(dx, dy) > 6) moved = true;
    if (!moved) return;
    const rotation = Math.max(-18, Math.min(18, dx / 12));
    topCard.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotation}deg)`;
  });

  topCard.addEventListener("pointerup", (e) => {
    if (pointerId !== e.pointerId) return;
    topCard.releasePointerCapture(pointerId);
    pointerId = null;

    const dx      = currentX - startX;
    const dy      = currentY - startY;
    const elapsed = Date.now() - startTime;

    if (!moved && elapsed < 260) {
      const now          = Date.now();
      const sinceLastTap = now - lastTap.time;
      const tapDist      = Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y);
      if (sinceLastTap < 320 && tapDist < 24) {
        lastTap = { time: 0, x: 0, y: 0 };
        advanceTopPhoto();
        return;
      }
      lastTap = { time: now, x: e.clientX, y: e.clientY };
    }

    if (Math.abs(dx) > Math.abs(dy) && dx >  90) { resolveDecision("like");      return; }
    if (Math.abs(dx) > Math.abs(dy) && dx < -90) { resolveDecision("nope");      return; }
    if (Math.abs(dy) > Math.abs(dx) && dy < -110){ resolveDecision("superlike"); return; }

    topCard.style.transition = "transform 180ms ease";
    topCard.style.transform  = "";
  });

  topCard.addEventListener("pointercancel", (e) => {
    if (pointerId !== e.pointerId) return;
    pointerId = null;
    topCard.style.transition = "transform 180ms ease";
    topCard.style.transform  = "";
  });
}

// ─── Match overlay ────────────────────────────────────────────────────────────
function showMatchOverlay(profile, matchResult) {
  const overlay = document.createElement("div");
  overlay.id    = "match-overlay";
  overlay.innerHTML = `
    <div class="match-modal">
      <div class="match-emoji">${matchResult.superLiked ? "⭐" : "🔥"}</div>
      <h2 class="match-title">${matchResult.superLiked ? "Super Match!" : "It's a Match!"}</h2>
      <p class="match-sub">You and <strong>${profile.name}</strong> liked each other.</p>
      <img class="match-photo" src="${profile.photos[0] || profile.img || ""}" alt="${profile.name}">
      <button class="match-close ghost-btn" id="matchCloseBtn">Keep swiping ✨</button>
    </div>
  `;

  // Inline styles so the overlay works without editing styles.css
  Object.assign(overlay.style, {
    position:       "fixed",
    inset:          "0",
    background:     "rgba(0,0,0,0.82)",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    zIndex:         "9999",
    animation:      "fadeIn 200ms ease",
  });

  document.body.appendChild(overlay);
  document.getElementById("matchCloseBtn").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}

// ─── Auth overlay ─────────────────────────────────────────────────────────────
function showAuthOverlay() {
  // Remove existing overlay if present
  document.getElementById("auth-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id    = "auth-overlay";
  overlay.innerHTML = `
    <div class="auth-modal">
      <h2>🔥 Sign in to AI-Tinder</h2>
      <p id="auth-error" style="color:#ff453a;min-height:1.2em;"></p>

      <div id="auth-register" style="display:none;">
        <input class="auth-input" id="reg-name"  type="text"  placeholder="Name" />
        <input class="auth-input" id="reg-age"   type="number" placeholder="Age" min="18" max="99" />
        <input class="auth-input" id="reg-city"  type="text"  placeholder="City" />
        <input class="auth-input" id="reg-title" type="text"  placeholder="Job title" />
      </div>

      <input class="auth-input" id="auth-email"    type="email"    placeholder="Email" />
      <input class="auth-input" id="auth-password" type="password" placeholder="Password (min 8 chars)" />
      <button class="ctrl ctrl--like" id="auth-submit" style="width:100%;border-radius:12px;font-size:16px;height:48px;">
        Log in
      </button>
      <p style="text-align:center;margin-top:12px;">
        <a href="#" id="auth-toggle" style="color:#64d2ff;">Don't have an account? Register</a>
      </p>
    </div>
  `;

  // Overlay + modal styles
  Object.assign(overlay.style, {
    position:       "fixed",
    inset:          "0",
    background:     "rgba(11,11,18,0.95)",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    zIndex:         "9999",
  });

  document.body.appendChild(overlay);
  injectAuthStyles();

  let isRegister = false;

  document.getElementById("auth-toggle").addEventListener("click", (e) => {
    e.preventDefault();
    isRegister = !isRegister;
    document.getElementById("auth-register").style.display = isRegister ? "block" : "none";
    document.getElementById("auth-submit").textContent     = isRegister ? "Register" : "Log in";
    document.getElementById("auth-toggle").textContent     = isRegister
      ? "Already have an account? Log in"
      : "Don't have an account? Register";
    document.getElementById("auth-error").textContent = "";
  });

  document.getElementById("auth-submit").addEventListener("click", async () => {
    const email    = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const errEl    = document.getElementById("auth-error");
    errEl.textContent = "";

    try {
      let res, data;
      if (isRegister) {
        const name  = document.getElementById("reg-name").value.trim();
        const age   = parseInt(document.getElementById("reg-age").value, 10);
        const city  = document.getElementById("reg-city").value.trim();
        const title = document.getElementById("reg-title").value.trim();
        res  = await fetch(`${API_BASE}/auth/register`, {
          method:      "POST",
          headers:     { "Content-Type": "application/json" },
          credentials: "include",
          body:        JSON.stringify({ email, password, name, age, city, title, bio: "", tags: [] }),
        });
      } else {
        res = await fetch(`${API_BASE}/auth/login`, {
          method:      "POST",
          headers:     { "Content-Type": "application/json" },
          credentials: "include",
          body:        JSON.stringify({ email, password }),
        });
      }

      data = await res.json();
      if (!res.ok) {
        errEl.textContent = data.error || (data.errors || []).join(", ") || "Something went wrong.";
        return;
      }

      accessToken = data.accessToken;
      overlay.remove();
      await fetchProfiles(true);
    } catch (err) {
      document.getElementById("auth-error").textContent = err.message;
    }
  });
}

function injectAuthStyles() {
  if (document.getElementById("auth-styles")) return;
  const style = document.createElement("style");
  style.id = "auth-styles";
  style.textContent = `
    .auth-modal {
      background: #13131c;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 22px;
      padding: 32px 28px;
      width: min(90vw, 380px);
      display: flex;
      flex-direction: column;
      gap: 12px;
      color: #fff;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    .auth-modal h2 { margin: 0; font-size: 22px; text-align: center; }
    .auth-input {
      width: 100%;
      background: #1e2030;
      border: 1px solid rgba(255,255,255,0.1);
      color: #fff;
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 15px;
      outline: none;
      box-sizing: border-box;
    }
    .auth-input::placeholder { color: #666; }
    .auth-input:focus { border-color: rgba(255,255,255,0.3); }
    .match-modal {
      background: #13131c;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 22px;
      padding: 32px 28px;
      width: min(90vw, 360px);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      color: #fff;
      font-family: ui-sans-serif, system-ui, sans-serif;
      text-align: center;
    }
    .match-emoji  { font-size: 52px; }
    .match-title  { margin: 0; font-size: 26px; font-weight: 700; }
    .match-sub    { margin: 0; color: #8b8ca1; }
    .match-photo  { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; }
    .match-close  { padding: 10px 24px; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(style);
}

// ─── Button event listeners ───────────────────────────────────────────────────
likeBtn.addEventListener("click",       () => resolveDecision("like"));
nopeBtn.addEventListener("click",       () => resolveDecision("nope"));
superLikeBtn.addEventListener("click",  () => resolveDecision("superlike"));
shuffleBtn.addEventListener("click",    async () => {
  if (isAnimating) return;
  nextCursor = null;
  await fetchProfiles(true);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
(async function boot() {
  injectAuthStyles();
  // Try to restore session via refresh cookie silently
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method:      "POST",
      credentials: "include",
    });
    if (res.ok) {
      const data  = await res.json();
      accessToken = data.accessToken;
      await fetchProfiles(true);
      return;
    }
  } catch {
    // no-op — will fall through to login
  }
  showAuthOverlay();
})();
