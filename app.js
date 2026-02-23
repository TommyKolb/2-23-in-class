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

function generateProfiles(count = 12) {
  const profiles = [];
  for (let i = 0; i < count; i++) {
    profiles.push({
      id: `p_${i}_${Date.now().toString(36)}`,
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

let profiles = [];

function renderDeck() {
  deckEl.setAttribute("aria-busy", "true");
  deckEl.innerHTML = "";

  profiles.forEach((p, idx) => {
    const card = document.createElement("article");
    card.className = "card";

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
  console.log("Next photo triggered");
  const img = card.querySelector('.card__media');
  if (img) {
    const oldFilter = img.style.filter;
    img.style.filter = 'brightness(1.5)';
    setTimeout(() => { img.style.filter = oldFilter; }, 150);
  }
}

function handleReject(card) {
  if (!card) return;
  if (card === topCard) topCard = null;
  card.style.transform = `translate(-200%, 20%) rotate(-30deg)`;
  card.style.opacity = '0';
  removeCard(card);
}

function handleLike(card) {
  if (!card) return;
  if (card === topCard) topCard = null;
  card.style.transform = `translate(200%, 20%) rotate(30deg)`;
  card.style.opacity = '0';
  removeCard(card);
}

function handleSuperLike(card) {
  if (!card) return;
  if (card === topCard) topCard = null;
  card.style.transform = `translate(0, -200%)`;
  card.style.opacity = '0';
  removeCard(card);
}

function removeCard(card) {
  setTimeout(() => {
    if (card.parentNode) card.parentNode.removeChild(card);
    initCards();
  }, 220);
}

deckEl.addEventListener('pointerdown', (e) => {
  const targetCard = e.target.closest('.card');
  if (!topCard || !targetCard || targetCard !== topCard) return;
  
  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;
  currentX = startX;
  currentY = startY;
  topCard.classList.add('card--dragging');
});

deckEl.addEventListener('pointermove', (e) => {
  if (!isDragging || !topCard) return;
  
  e.preventDefault(); // Prevent touch scrolling during drag
  currentX = e.clientX;
  currentY = e.clientY;
  const dx = currentX - startX;
  const dy = currentY - startY;
  
  const rotate = dx * 0.05;
  topCard.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`;
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

// Boot
resetDeck();
