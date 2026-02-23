// app.js
// Plain global JS, no modules.

// -------------------
// Data generator
// -------------------
const TAGS = [
  "Coffee","Hiking","Movies","Live Music","Board Games","Cats","Dogs","Traveler",
  "Foodie","Tech","Art","Runner","Climbing","Books","Yoga","Photography"
];
const FIRST_NAMES = [
  "Alex","Sam","Jordan","Taylor","Casey","Avery","Riley","Morgan","Quinn","Cameron",
  "Jamie","Drew","Parker","Reese","Emerson","Rowan","Shawn","Harper","Skyler","Devon"
];
const CITIES = [
  "Brooklyn","Manhattan","Queens","Jersey City","Hoboken","Astoria",
  "Williamsburg","Bushwick","Harlem","Lower East Side"
];
const JOBS = [
  "Product Designer","Software Engineer","Data Analyst","Barista","Teacher",
  "Photographer","Architect","Chef","Nurse","Marketing Manager","UX Researcher"
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
function pickTags() { return Array.from(new Set(Array.from({length:4}, ()=>sample(TAGS)))); }
function imgFor(seed) {
  return `https://images.unsplash.com/photo-${seed}?auto=format&fit=crop&w=1200&q=80`;
}

function pickPhotos(count = 4) {
  const shuffled = [...UNSPLASH_SEEDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((seed) => imgFor(seed));
}

function generateProfiles(count = 12) {
  const profiles = [];
  for (let i = 0; i < count; i++) {
    const photos = pickPhotos();
    profiles.push({
      id: `p_${i}_${Date.now().toString(36)}`,
      name: sample(FIRST_NAMES),
      age: 18 + Math.floor(Math.random() * 22),
      city: sample(CITIES),
      title: sample(JOBS),
      bio: sample(BIOS),
      tags: pickTags(),
      img: photos[0],
      photos,
      photoIndex: 0,
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

let profiles = [];
let isAnimating = false;
let lastTap = { time: 0, x: 0, y: 0 };

function renderDeck() {
  deckEl.setAttribute("aria-busy", "true");
  deckEl.innerHTML = "";

  const visibleProfiles = profiles.slice(-3).reverse();

  visibleProfiles.forEach((p, idx) => {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.profileId = p.id;
    card.style.zIndex = String(100 - idx);

    const img = document.createElement("img");
    img.className = "card__media";
    img.src = p.photos[p.photoIndex];
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
  attachTopCardHandlers();
}

function resetDeck() {
  profiles = generateProfiles(12);
  renderDeck();
}

function getTopCard() {
  return deckEl.querySelector(".card");
}

function getTopProfile() {
  return profiles[profiles.length - 1] || null;
}

function setControlsDisabled(disabled) {
  likeBtn.disabled = disabled;
  nopeBtn.disabled = disabled;
  superLikeBtn.disabled = disabled;
  shuffleBtn.disabled = disabled;
}

function resolveDecision(action) {
  if (isAnimating) return;
  const topCard = getTopCard();
  if (!topCard) return;

  const transforms = {
    nope: "translate(-520px, -30px) rotate(-18deg)",
    like: "translate(520px, -30px) rotate(18deg)",
    superlike: "translate(0, -560px) rotate(0deg)",
  };
  const outTransform = transforms[action];
  if (!outTransform) return;

  isAnimating = true;
  setControlsDisabled(true);

  topCard.style.transition = "transform 240ms ease, opacity 240ms ease";
  topCard.style.transform = outTransform;
  topCard.style.opacity = "0";

  window.setTimeout(() => {
    profiles.pop();
    if (profiles.length === 0) {
      profiles = generateProfiles(12);
    }
    renderDeck();
    isAnimating = false;
    setControlsDisabled(false);
  }, 250);
}

function advanceTopPhoto() {
  const topProfile = getTopProfile();
  const topCard = getTopCard();
  if (!topProfile || !topCard || topProfile.photos.length < 2) return;

  topProfile.photoIndex = (topProfile.photoIndex + 1) % topProfile.photos.length;
  const img = topCard.querySelector(".card__media");
  if (!img) return;

  img.src = topProfile.photos[topProfile.photoIndex];
}

function attachTopCardHandlers() {
  const topCard = getTopCard();
  if (!topCard) return;

  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let startTime = 0;
  let moved = false;

  topCard.style.touchAction = "none";

  topCard.addEventListener("pointerdown", (event) => {
    if (isAnimating) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    currentX = event.clientX;
    currentY = event.clientY;
    startTime = Date.now();
    moved = false;

    topCard.style.transition = "";
    topCard.setPointerCapture(pointerId);
  });

  topCard.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;

    currentX = event.clientX;
    currentY = event.clientY;
    const dx = currentX - startX;
    const dy = currentY - startY;
    const distance = Math.hypot(dx, dy);

    if (distance > 6) moved = true;
    if (!moved) return;

    const rotation = Math.max(-18, Math.min(18, dx / 12));
    topCard.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotation}deg)`;
  });

  topCard.addEventListener("pointerup", (event) => {
    if (pointerId !== event.pointerId) return;
    topCard.releasePointerCapture(pointerId);
    pointerId = null;

    const dx = currentX - startX;
    const dy = currentY - startY;
    const elapsed = Date.now() - startTime;

    if (!moved && elapsed < 260) {
      const now = Date.now();
      const sinceLastTap = now - lastTap.time;
      const tapDistance = Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y);

      if (sinceLastTap < 320 && tapDistance < 24) {
        lastTap = { time: 0, x: 0, y: 0 };
        advanceTopPhoto();
        return;
      }

      lastTap = { time: now, x: event.clientX, y: event.clientY };
    }

    const horizontalThreshold = 90;
    const verticalThreshold = 110;

    if (Math.abs(dx) > Math.abs(dy) && dx > horizontalThreshold) {
      resolveDecision("like");
      return;
    }
    if (Math.abs(dx) > Math.abs(dy) && dx < -horizontalThreshold) {
      resolveDecision("nope");
      return;
    }
    if (Math.abs(dy) > Math.abs(dx) && dy < -verticalThreshold) {
      resolveDecision("superlike");
      return;
    }

    topCard.style.transition = "transform 180ms ease";
    topCard.style.transform = "";
  });

  topCard.addEventListener("pointercancel", () => {
    pointerId = null;
    topCard.style.transition = "transform 180ms ease";
    topCard.style.transform = "";
  });
}

likeBtn.addEventListener("click", () => resolveDecision("like"));
nopeBtn.addEventListener("click", () => resolveDecision("nope"));
superLikeBtn.addEventListener("click", () => resolveDecision("superlike"));
shuffleBtn.addEventListener("click", () => {
  if (isAnimating) return;
  resetDeck();
});

// Boot
resetDeck();
