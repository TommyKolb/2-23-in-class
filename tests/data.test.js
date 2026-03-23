/**
 * Tests for data.mjs (ESM) — loaded via dynamic import.
 */
const path = require("path");
const { pathToFileURL } = require("url");

const DATA_URL = pathToFileURL(path.join(__dirname, "..", "data.mjs")).href;

const FIRST_NAMES_EXPECTED = new Set([
    "Alex",
    "Sam",
    "Jordan",
    "Taylor",
    "Casey",
    "Avery",
    "Riley",
    "Morgan",
    "Quinn",
    "Cameron",
    "Jamie",
    "Drew",
    "Parker",
    "Reese",
    "Emerson",
    "Rowan",
    "Shawn",
    "Harper",
    "Skyler",
    "Devon",
]);

const CITIES_EXPECTED = new Set([
    "Brooklyn",
    "Manhattan",
    "Queens",
    "Jersey City",
    "Hoboken",
    "Astoria",
    "Williamsburg",
    "Bushwick",
    "Harlem",
    "Lower East Side",
]);

const JOBS_EXPECTED = new Set([
    "Product Designer",
    "Software Engineer",
    "Data Analyst",
    "Barista",
    "Teacher",
    "Photographer",
    "Architect",
    "Chef",
    "Nurse",
    "Marketing Manager",
    "UX Researcher",
]);

const BIOS_EXPECTED = new Set([
    "Weekend hikes and weekday lattes.",
    "Dog parent. Amateur chef. Karaoke enthusiast.",
    "Trying every taco in the city — for science.",
    "Bookstore browser and movie quote machine.",
    "Gym sometimes, Netflix always.",
    "Looking for the best slice in town.",
    "Will beat you at Mario Kart.",
    "Currently planning the next trip.",
]);

const UNSPLASH_SEED_PATTERN = /photo-[\w-]+\?auto=format&fit=crop&w=1200&q=80$/;

let generateProfiles;
let TAGS;

beforeAll(async () => {
    const mod = await import(DATA_URL);
    generateProfiles = mod.generateProfiles;
    TAGS = mod.TAGS;
});

describe("data.mjs TAGS export", () => {
    it("exports an array of 16 strings", () => {
        expect(Array.isArray(TAGS)).toBe(true);
        expect(TAGS).toHaveLength(16);
        TAGS.forEach((t) => {
            expect(typeof t).toBe("string");
            expect(t.length).toBeGreaterThan(0);
        });
    });

    it("has no duplicate tags", () => {
        expect(new Set(TAGS).size).toBe(TAGS.length);
    });

    it("contains expected label set", () => {
        expect(new Set(TAGS)).toEqual(
            new Set([
                "Coffee",
                "Hiking",
                "Movies",
                "Live Music",
                "Board Games",
                "Cats",
                "Dogs",
                "Traveler",
                "Foodie",
                "Tech",
                "Art",
                "Runner",
                "Climbing",
                "Books",
                "Yoga",
                "Photography",
            ])
        );
    });
});

describe("generateProfiles default and count", () => {
    it("returns 12 profiles by default", () => {
        const profiles = generateProfiles();
        expect(profiles).toHaveLength(12);
    });

    it("returns empty array for count 0", () => {
        expect(generateProfiles(0)).toEqual([]);
    });

    it("returns n profiles for positive n", () => {
        expect(generateProfiles(1)).toHaveLength(1);
        expect(generateProfiles(3)).toHaveLength(3);
        expect(generateProfiles(50)).toHaveLength(50);
    });

    it("uses sequential index in id for each slot", () => {
        jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
        const p = generateProfiles(4);
        expect(p[0].id).toMatch(/^p_0_/);
        expect(p[1].id).toMatch(/^p_1_/);
        expect(p[2].id).toMatch(/^p_2_/);
        expect(p[3].id).toMatch(/^p_3_/);
        Date.now.mockRestore();
    });
});

describe("generateProfiles object shape", () => {
    it("each profile has required string fields", () => {
        const [p] = generateProfiles(1);
        expect(p).toEqual(
            expect.objectContaining({
                id: expect.any(String),
                name: expect.any(String),
                age: expect.any(Number),
                city: expect.any(String),
                title: expect.any(String),
                bio: expect.any(String),
                img: expect.any(String),
            })
        );
        expect(Array.isArray(p.tags)).toBe(true);
    });

    it("id matches pattern p_<index>_<base36 timestamp>", () => {
        jest.spyOn(Date, "now").mockReturnValue(65_536);
        const [p] = generateProfiles(1);
        expect(p.id).toBe(`p_0_${(65_536).toString(36)}`);
        Date.now.mockRestore();
    });

    it("img is https Unsplash URL with expected query params", () => {
        const [p] = generateProfiles(1);
        expect(p.img).toMatch(/^https:\/\/images\.unsplash\.com\//);
        expect(p.img).toMatch(UNSPLASH_SEED_PATTERN);
    });

    it("tags are a subset of TAGS with 1–4 unique entries (pickTags uses Set)", () => {
        for (let i = 0; i < 30; i++) {
            const [p] = generateProfiles(1);
            expect(p.tags.length).toBeGreaterThanOrEqual(1);
            expect(p.tags.length).toBeLessThanOrEqual(4);
            expect(new Set(p.tags).size).toBe(p.tags.length);
            p.tags.forEach((t) => expect(TAGS).toContain(t));
        }
    });
});

describe("generateProfiles value ranges (random mocked)", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("age is in [18, 39] when random just below 1", () => {
        jest.spyOn(Math, "random").mockReturnValue(0.999999);
        const [p] = generateProfiles(1);
        expect(p.age).toBe(18 + 21);
    });

    it("age is 18 when random is 0", () => {
        jest.spyOn(Math, "random").mockReturnValue(0);
        const [p] = generateProfiles(1);
        expect(p.age).toBe(18);
    });

    it("deterministic name/city/title/bio when random always picks first index", () => {
        jest.spyOn(Math, "random").mockReturnValue(0);
        const [p] = generateProfiles(1);
        expect(FIRST_NAMES_EXPECTED.has(p.name)).toBe(true);
        expect(CITIES_EXPECTED.has(p.city)).toBe(true);
        expect(JOBS_EXPECTED.has(p.title)).toBe(true);
        expect(BIOS_EXPECTED.has(p.bio)).toBe(true);
    });
});

describe("generateProfiles independence", () => {
    it("returns new array instances each call", () => {
        const a = generateProfiles(2);
        const b = generateProfiles(2);
        expect(a).not.toBe(b);
        expect(a[0]).not.toBe(b[0]);
    });

    it("profiles in one batch have distinct ids", () => {
        const profiles = generateProfiles(20);
        const ids = profiles.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("generateProfiles with frozen time", () => {
    it("same Date.now yields ids that differ by index only in the prefix", () => {
        jest.spyOn(Date, "now").mockReturnValue(9_999_999);
        const p = generateProfiles(3);
        const suffix = `${(9_999_999).toString(36)}`;
        expect(p[0].id).toBe(`p_0_${suffix}`);
        expect(p[1].id).toBe(`p_1_${suffix}`);
        expect(p[2].id).toBe(`p_2_${suffix}`);
        Date.now.mockRestore();
    });
});

describe("generateProfiles edge parameters", () => {
    it("treats undefined count as default 12", () => {
        const p = generateProfiles(undefined);
        expect(p).toHaveLength(12);
    });

    it("supports a large batch", () => {
        const p = generateProfiles(500);
        expect(p).toHaveLength(500);
        const ids = new Set(p.map((x) => x.id));
        expect(ids.size).toBe(500);
    });
});

describe("generateProfiles img URL structure", () => {
    it("every profile img uses the same query string suffix", () => {
        const suffix = "?auto=format&fit=crop&w=1200&q=80";
        generateProfiles(25).forEach((p) => {
            expect(p.img.endsWith(suffix)).toBe(true);
            expect(p.img).toContain("/photo-");
        });
    });
});

describe("generateProfiles age bounds (property test)", () => {
    it("age is always between 18 and 39 inclusive over many random draws", () => {
        for (let i = 0; i < 200; i++) {
            const [p] = generateProfiles(1);
            expect(p.age).toBeGreaterThanOrEqual(18);
            expect(p.age).toBeLessThanOrEqual(39);
        }
    });
});

describe("generateProfiles tags cardinality", () => {
    it("pickTags produces at most 4 tags and at least 1", () => {
        for (let i = 0; i < 100; i++) {
            const [p] = generateProfiles(1);
            expect(p.tags.length).toBeGreaterThanOrEqual(1);
            expect(p.tags.length).toBeLessThanOrEqual(4);
        }
    });
});
