# 🔥 AI-Tinder — Backend

Express + PostgreSQL + Prisma backend for the AI-Tinder swipe app.

---

## Project Structure

```
backend/
├── prisma/
│   └── schema.prisma          # DB schema (User, Swipe, Match, RefreshToken)
├── src/
│   ├── db/
│   │   ├── client.js          # Prisma singleton
│   │   └── seed.js            # Seeds 50 fake profiles
│   ├── middleware/
│   │   ├── auth.js            # requireAuth — verifies JWT
│   │   └── errorHandler.js    # Central error handler
│   ├── routes/
│   │   ├── auth.js            # POST /auth/register|login|refresh|logout
│   │   ├── profiles.js        # GET/PUT /profiles + photo management
│   │   ├── swipes.js          # POST /swipes  (+ match detection)
│   │   └── matches.js         # GET /matches
│   ├── utils/
│   │   └── jwt.js             # signAccessToken, rotateRefreshToken, etc.
│   └── index.js               # App entry point
├── app.js                     # Updated frontend (drop-in replacement for original)
├── .env.example
└── package.json
```

---

## Prerequisites

- **Node.js** ≥ 20
- **PostgreSQL** ≥ 15 running locally (or a cloud URL)

---

## Quick Start

### 1. Install dependencies

```bash
npm install
npx prisma generate
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env:
#   DATABASE_URL — your Postgres connection string
#   JWT_ACCESS_SECRET and JWT_REFRESH_SECRET — generate strong random strings:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Run migrations & seed

```bash
npm run db:migrate   # creates tables
npm run db:seed      # inserts 50 fake profiles (password: password123)
```

### 4. Start the backend

```bash
npm run dev          # nodemon (auto-restart on changes)
# or
npm start            # plain node
```

Server starts at **http://localhost:3001**

### 5. Connect the frontend

- Replace `app.js` in the original project with `backend/app.js` from this folder.
- Open `index.html` with a local HTTP server (e.g. VS Code Live Server on port 5500).
- The app will prompt you to log in. Use any seeded account:
  - Email: `user0@example.com` … `user49@example.com`
  - Password: `password123`

---

## API Reference

### Auth

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | `{ email, password, name, age, city, title, bio?, tags? }` | Create account |
| POST | `/auth/login` | `{ email, password }` | Issue JWT + set refresh cookie |
| POST | `/auth/refresh` | _(cookie)_ | Rotate refresh token, return new access token |
| POST | `/auth/logout` | _(cookie)_ | Invalidate refresh token |

### Profiles

| Method | Path | Description |
|--------|------|-------------|
| GET | `/profiles?limit=12&cursor=` | Paginated deck of unseen profiles |
| GET | `/profiles/me` | Your own profile |
| GET | `/profiles/:id` | Any profile by ID |
| PUT | `/profiles/me` | Update your profile fields |
| POST | `/profiles/me/photos` | Add a photo URL `{ url }` |
| DELETE | `/profiles/me/photos/:index` | Remove a photo by index |

### Swipes

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/swipes` | `{ toUserId, action: "like"\|"nope"\|"superlike" }` | `{ matched, matchId?, superLiked? }` |

### Matches

| Method | Path | Description |
|--------|------|-------------|
| GET | `/matches` | All matches for authenticated user |
| GET | `/matches/:id` | Single match with both user profiles |

---

## Auth Flow

```
Login  →  access token (15 min)  +  refresh token cookie (30 days, HTTP-only)
                │
          Access token  →  sent in Authorization: Bearer <token> header
                │
           Expires  →  frontend POSTs /auth/refresh with cookie
                        → new access token + rotated refresh token
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Validation failure — `{ errors: [...] }` |
| 401 | Missing/invalid/expired token |
| 403 | Valid token but not your resource |
| 404 | Resource not found |
| 409 | Duplicate swipe |
| 429 | Rate limit exceeded |
| 500 | Server error (opaque to client) |
