// src/db/seed.js
// Populates the database with 50 realistic-ish fake profiles.
// Run: npm run db:seed

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

const TAGS = [
  "Coffee","Hiking","Movies","Live Music","Board Games","Cats","Dogs","Traveler",
  "Foodie","Tech","Art","Runner","Climbing","Books","Yoga","Photography",
];
const FIRST_NAMES = [
  "Alex","Sam","Jordan","Taylor","Casey","Avery","Riley","Morgan","Quinn","Cameron",
  "Jamie","Drew","Parker","Reese","Emerson","Rowan","Shawn","Harper","Skyler","Devon",
];
const CITIES = [
  "Brooklyn","Manhattan","Queens","Jersey City","Hoboken","Astoria",
  "Williamsburg","Bushwick","Harlem","Lower East Side",
];
const JOBS = [
  "Product Designer","Software Engineer","Data Analyst","Barista","Teacher",
  "Photographer","Architect","Chef","Nurse","Marketing Manager","UX Researcher",
];
const BIOS = [
  "Weekend hikes and weekday lattes.",
  "Dog parent. Amateur chef. Karaoke enthusiast.",
  "Trying every taco in the city — for science.",
  "Bookstore browser and movie quote machine.",
  "Gym sometimes, Netflix always.",
  "Looking for the best slice in town.",
  "Will beat you at Mario Kart.",
  "Currently planning the next trip.",
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
function pickPhotos(count = 4) {
  const shuffled = [...UNSPLASH_SEEDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(imgFor);
}

async function main() {
  console.log("🌱  Seeding database...");

  // Clean existing data (order matters due to FK constraints)
  await prisma.match.deleteMany();
  await prisma.swipe.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);

  const users = [];
  for (let i = 0; i < 50; i++) {
    const photos = pickPhotos();
    const user = await prisma.user.create({
      data: {
        email: `user${i}@example.com`,
        passwordHash,
        name: sample(FIRST_NAMES),
        age: 18 + Math.floor(Math.random() * 22),
        city: sample(CITIES),
        title: sample(JOBS),
        bio: sample(BIOS),
        tags: pickTags(),
        photos,
      },
    });
    users.push(user);
  }

  console.log(`✅  Created ${users.length} users.`);
  console.log("   Login with any user email (user0@example.com … user49@example.com)");
  console.log("   Password: password123");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
