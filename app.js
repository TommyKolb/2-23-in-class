// app.js
// Plain global JS, no modules.
// Includes backend integration:
//   - POST /api/likes  when the user likes / super-likes a card
//   - GET  /api/matches polled every 10 s for mutual matches

// ─── Config ──────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:3000"; // backend URL
const POLL_INTERVAL = 10_000;                  // 10 seconds

// -------------------
// Data generator
// -------------------
const TAGS = [
  "Coffee", "Hiking", "Movies", "Live Music", "Board Games", "Cats", "Dogs", "Traveler",
  "Foodie", "Tech", "Art", "Runner", "Climbing", "Books", "Yoga", "Photography"
];
const FIRST_NAMES = [
  "Alex", "Sam", "Jordan", "Taylor", "Casey", "Avery", "Riley", "Morgan", "Quinn", "Cameron",
  "Jamie", "Drew", "Parker", "Reese", "Emerson", "Rowan", "Shawn", "Harper", "Skyler", "Devon"
];
const CITIES = [
  "Brooklyn", "Manhattan", "Queens", "Jersey City", "Hoboken", "Astoria",
  "Williamsburg", "Bushwick", "Harlem", "Lower East Side"
];
const JOBS = [
  "Product Designer", "Software Engineer", "Data Analyst", "Barista", "Teacher",
  "Photographer", "Architect", "Chef", "Nurse", "Marketing Manager", "UX Researcher"
];
const BIOS = [
  "Weekend hikes and weekday lattes.",
  "Dog parent. Amateur chef. Karaoke enthusiast.",
  "Trying every taco in the city — for science.",
  "Bookstore browser and movie quote machine.",
  "Gym sometimes, Netflix always.",
  "Looking for the best slice in town.",
  "Will beat you at Mario Kart.",
  "Currently planning the next trip."
];

const UNSPLASH_SEEDS = [
  "1515462277126-2b47b9fa09e6",
  "1520975916090-3105956dac38",
  "1519340241574-2cec6aef0c01",
  "1554151228-14d9def656e4",
  "1548142813-c348350df52b",
  "1517841905240-472988babdf9",
  "1535713875002-d1d0cf377fde",
  "1545996124-0501ebae84d0",
  "1524504388940-b1c1722653e1",
  "1531123897727-8f129e1688ce",
];

function sample(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickTags() { return Array.from(new Set(Array.from({ length: 4 }, () => sample(TAGS)))); }
function imgFor(seed) {
  return `https://images.unsplash.com/photo-${seed}?auto=format&fit=crop&w=1200&q=80`;
}

function generateProfiles(count = 12) {
  const profiles = [];
  for (let i = 0; i < count; i++) {
    profiles.push({
      id: `p_${i}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: sample(FIRST_NAMES),
      age: 18 + Math.floor(Math.random() * 22),
      city: sample(CITIES),
      title: sample(JOBS),
      bio: sample(BIOS),
      tags: pickTags(),
      img: imgFor(sample(UNSPLASH_SEEDS)),
    });
  }
  return profiles;
}

// -------------------
// UI rendering
// -------------------
const deckEl = document.getElementById("deck");
const shuffleBtn = document.getElementById("shuffleBtn");
const likeBtn = document.getElementById("likeBtn");
const nopeBtn = document.getElementById("nopeBtn");
const superLikeBtn = document.getElementById("superLikeBtn");
const matchBanner = document.getElementById("matchBanner");
const matchList = document.getElementById("matchList");
const matchCount = document.getElementById("matchCount");
const dismissBtn = document.getElementById("dismissMatch");

let profiles = [];
// profileId → profile data (kept so we can reference it in swipe callbacks)
const profileMap = new Map();

function renderDeck() {
  deckEl.setAttribute("aria-busy", "true");
  deckEl.innerHTML = "";

  profiles.forEach((p) => {
    profileMap.set(p.id, p);
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.profileId = p.id;

    const img = document.createElement("img");
    img.className = "card__media";
    img.src = p.img;
    img.alt = `${p.name} — profile photo`;

    const body = document.createElement("div");
    body.className = "card__body";

    const titleRow = document.createElement("div");
    titleRow.className = "title-row";
    titleRow.innerHTML = `
      <h2 class="card__title">${p.name}</h2>
      <span class="card__age">${p.age}</span>
    `;

    const meta = document.createElement("div");
    meta.className = "card__meta";
    meta.textContent = `${p.title} • ${p.city}`;

    const chips = document.createElement("div");
    chips.className = "card__chips";
    p.tags.forEach((t) => {
      const c = document.createElement("span");
      c.className = "chip";
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
  initCards();
}

function resetDeck() {
  profiles = generateProfiles(12);
  renderDeck();
}

let topCard = null;
let startX = 0, startY = 0, currentX = 0, currentY = 0;
let isDragging = false;
let lastTapTime = 0;

function initCards() {
  const cards = Array.from(deckEl.querySelectorAll('.card'));
  cards.forEach((card, idx) => {
    card.style.zIndex = cards.length - idx;
  });
  topCard = deckEl.firstElementChild;
}

function handleNextPhoto(card) {
  if (!card) return;
  const img = card.querySelector('.card__media');
  if (img) {
    img.style.filter = 'brightness(1.5)';
    setTimeout(() => { img.style.filter = ''; }, 150);
  }
}

// ─── Backend calls ────────────────────────────────────────────────────────────

/**
 * POST /api/likes — record like or superlike.
 * Fire-and-forget; errors are logged but don't break the UI.
 */
async function recordLike(card, action) {
  if (!card) return;
  const profileId = card.dataset.profileId;
  const profile = profileMap.get(profileId) || {};

  try {
    const res = await fetch(`${API_BASE}/api/likes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId,
        name: profile.name || "Unknown",
        action,
        img: profile.img || "",
        tags: profile.tags || [],
      }),
    });
    const data = await res.json();

    // If backend says it's already a match, show immediately rather than
    // waiting for the next poll cycle.
    if (data.matched) {
      showInstantMatch(profile);
    }
  } catch (err) {
    console.warn("[likes] backend unavailable – running in offline mode", err.message);
  }
}

// ─── Match notification helpers ───────────────────────────────────────────────

/** Queue of matches waiting to be shown (one at a time). */
const matchQueue = [];
let bannerVisible = false;

function showInstantMatch(profile) {
  queueMatch({
    profileId: profile.id,
    name: profile.name,
    img: profile.img,
    tags: profile.tags,
    matchedAt: new Date().toISOString(),
  });
}

function queueMatch(matchRecord) {
  matchQueue.push(matchRecord);
  if (!bannerVisible) drainMatchQueue();
}

function drainMatchQueue() {
  if (matchQueue.length === 0) { bannerVisible = false; return; }
  bannerVisible = true;
  const match = matchQueue.shift();
  showMatchBanner(match);
}

function showMatchBanner(match) {
  // Increment badge
  const currentCount = parseInt(matchCount.textContent, 10) || 0;
  matchCount.textContent = currentCount + 1;
  matchCount.style.display = "inline-flex";

  // Build a match card item
  const item = document.createElement("div");
  item.className = "match-item";
  item.innerHTML = `
    <img class="match-avatar" src="${match.img}" alt="${match.name}" />
    <div class="match-info">
      <strong>${match.name}</strong>
      <span>You both liked each other! 🎉</span>
    </div>
  `;
  matchList.appendChild(item);

  // Show the banner
  matchBanner.classList.add("match-banner--visible");
  matchBanner.setAttribute("aria-hidden", "false");

  // Auto-dismiss after 6 s and show next queued match if any
  setTimeout(() => {
    hideBanner();
  }, 6000);
}

function hideBanner() {
  matchBanner.classList.remove("match-banner--visible");
  matchBanner.setAttribute("aria-hidden", "true");

  // Wait for slide-out animation then drain queue
  setTimeout(drainMatchQueue, 400);
}

if (dismissBtn) {
  dismissBtn.addEventListener("click", () => {
    hideBanner();
  });
}

// ─── Polling ──────────────────────────────────────────────────────────────────

let pollTimer = null;

async function pollMatches() {
  try {
    const res = await fetch(`${API_BASE}/api/matches`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.newMatches && data.newMatches.length > 0) {
      console.log(`[poll] ${data.newMatches.length} new match(es) received`);
      data.newMatches.forEach(queueMatch);
    }
  } catch (err) {
    console.warn("[poll] backend unavailable – will retry in 10 s", err.message);
  }
}

function startPolling() {
  // Immediate first poll
  pollMatches();
  // Then every 10 seconds
  pollTimer = setInterval(pollMatches, POLL_INTERVAL);
  console.log(`[poll] started – checking every ${POLL_INTERVAL / 1000}s`);
}

// ─── Swipe / button handlers ──────────────────────────────────────────────────

function handleReject(card) {
  if (!card) return;
  if (card === topCard) topCard = null;
  card.style.transform = `translate(-200%, 20%) rotate(-30deg)`;
  card.style.opacity = '0';
  // Nope → no backend call needed (but you could add one)
  removeCard(card);
}

function handleLike(card) {
  if (!card) return;
  if (card === topCard) topCard = null;
  card.style.transform = `translate(200%, 20%) rotate(30deg)`;
  card.style.opacity = '0';
  recordLike(card, "like");
  removeCard(card);
}

function handleSuperLike(card) {
  if (!card) return;
  if (card === topCard) topCard = null;
  card.style.transform = `translate(0, -200%)`;
  card.style.opacity = '0';
  recordLike(card, "superlike");
  removeCard(card);
}

function removeCard(card) {
  setTimeout(() => {
    if (card.parentNode) card.parentNode.removeChild(card);
    initCards();
  }, 220);
}

// ─── Pointer / drag events ────────────────────────────────────────────────────

deckEl.addEventListener('pointerdown', (e) => {
  const targetCard = e.target.closest('.card');
  if (!topCard || !targetCard || targetCard !== topCard) return;
  isDragging = true;
  startX = e.clientX; startY = e.clientY;
  currentX = startX; currentY = startY;
  topCard.classList.add('card--dragging');
});

deckEl.addEventListener('pointermove', (e) => {
  if (!isDragging || !topCard) return;
  e.preventDefault();
  currentX = e.clientX; currentY = e.clientY;
  const dx = currentX - startX;
  const dy = currentY - startY;
  topCard.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.05}deg)`;
});

function handlePointerUp() {
  if (!isDragging || !topCard) return;
  isDragging = false;
  topCard.classList.remove('card--dragging');

  const dx = currentX - startX;
  const dy = currentY - startY;
  const distance = Math.hypot(dx, dy);

  if (distance < 10) {
    const now = Date.now();
    if (now - lastTapTime < 300) {
      handleNextPhoto(topCard);
      lastTapTime = 0;
    } else {
      lastTapTime = now;
      topCard.style.transform = '';
    }
  } else if (Math.abs(dx) > 80) {
    if (dx > 0) handleLike(topCard);
    else handleReject(topCard);
  } else if (dy < -80) {
    handleSuperLike(topCard);
  } else {
    topCard.style.transform = '';
  }
}

document.addEventListener('pointerup', handlePointerUp);
document.addEventListener('pointercancel', handlePointerUp);

likeBtn.addEventListener("click", () => handleLike(topCard));
nopeBtn.addEventListener("click", () => handleReject(topCard));
superLikeBtn.addEventListener("click", () => handleSuperLike(topCard));
shuffleBtn.addEventListener("click", resetDeck);

// ─── Test hooks (only when Jest sets global flag before loading this file) ───
if (typeof globalThis !== "undefined" && globalThis.__APP_TEST_EXPOSE__) {
  globalThis.__appTest = {
    generateProfiles,
    sample,
    pickTags,
    imgFor,
    handleReject,
    handleLike,
    handleSuperLike,
    handleNextPhoto,
    recordLike,
    removeCard,
    drainMatchQueue,
    queueMatch,
    showMatchBanner,
    hideBanner,
    pollMatches,
    startPolling,
  };
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
resetDeck();
startPolling();
