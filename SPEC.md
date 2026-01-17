# Reddit Agent App - PRD

## Problem Statement

Product makers need to discover Reddit threads where users discuss problems their product solves, then engage authentically to drive awareness. Manual monitoring is time-consuming and inconsistent.

## Goals

- Enable product makers to automatically discover relevant Reddit discussions
- Generate contextual, helpful responses that naturally recommend their product
- Provide ongoing monitoring for new engagement opportunities

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16 + React 19 |
| Backend | Hono (API routes) |
| Auth | better-auth + Reddit OAuth |
| Database | Turso (SQLite) |
| ORM | Drizzle |
| LLM | Vercel AI SDK + AI Gateway (GPT-4o-mini) |
| Cron | Vercel Cron |
| Deploy | Vercel |
| URL Extraction | jsdom + Mozilla Readability |

---

## User Stories

### US-1: Authentication
- **As a** user
- **I want to** sign in with my Reddit account
- **So that** I can post responses directly to Reddit

**Acceptance Criteria:**
- [ ] Reddit OAuth with scopes: `identity`, `read`, `submit`
- [ ] Persistent login via refresh tokens in DB
- [ ] Proactive token refresh (1 hour before expiry)
- [ ] Re-auth prompt when token expires (browsing allowed, posting blocked)
- [ ] Store Reddit username only
- [ ] Redirect to /dashboard after OAuth

### US-2: Product Setup
- **As a** user
- **I want to** add my product by entering its URL
- **So that** the app can understand what I'm promoting

**Acceptance Criteria:**
- [ ] URL input required (no manual-only option)
- [ ] Fetch HTML → jsdom + Readability → LLM extraction
- [ ] Block proceed if extraction returns empty
- [ ] Proceed with partial info if some fields extracted
- [ ] Editable fields: name, description, target audience
- [ ] Wizard state in React (persist to DB on completion only)

### US-3: Keyword Generation
- **As a** user
- **I want to** get AI-generated keywords for my product
- **So that** I can find relevant Reddit discussions

**Acceptance Criteria:**
- [ ] LLM generates ~10 keywords via `generateObject`
- [ ] Zod schema with moderate validation (length, no special chars)
- [ ] Structured prompt optimizing for Reddit search syntax
- [ ] Flat list display, user can add/remove
- [ ] Manual keyword input accepted as-is
- [ ] Auto-preview threads (500ms debounce)
- [ ] Block proceed if no threads found

### US-4: Thread Discovery
- **As a** user
- **I want to** see Reddit threads matching my keywords
- **So that** I can find engagement opportunities

**Acceptance Criteria:**
- [ ] Split view (40/60 ratio): list left, detail right
- [ ] List shows: title, subreddit, relative age
- [ ] Detail shows: title, 200 char preview, metadata, "Open in Reddit" (new tab)
- [ ] Sort by recency (newest first)
- [ ] 10 results per keyword, deduplicated by Reddit thread ID
- [ ] Max thread age: 7 days
- [ ] No subreddit filtering

### US-5: Response Generation
- **As a** user
- **I want to** generate a response for a thread
- **So that** I can engage with potential customers

**Acceptance Criteria:**
- [ ] Trigger from thread detail panel
- [ ] Context: original post only + subreddit name
- [ ] Target ~200 words (soft limit)
- [ ] Clear product recommendation style, no auto-disclosure
- [ ] Loading spinner until complete (no streaming)
- [ ] Plain textarea for quick edits
- [ ] Regenerate button (temperature > 0 for variation)
- [ ] No markdown preview

### US-6: Reddit Posting
- **As a** user
- **I want to** post my response directly to Reddit
- **So that** I don't have to copy/paste

**Acceptance Criteria:**
- [ ] One-click post (no confirmation)
- [ ] Client-side Reddit API call with user's token
- [ ] Toast notification on success
- [ ] Show Reddit's error message on locked/deleted thread

### US-7: Monitoring Dashboard
- **As a** user
- **I want to** see new threads discovered daily
- **So that** I can continue engaging over time

**Acceptance Criteria:**
- [ ] Tabs: Threads / History / Dismissed
- [ ] Badge marks new threads
- [ ] 'New' flag cleared on thread selection
- [ ] Manual "Find new threads now" button
- [ ] Dismiss threads (per-product, restorable, no bulk actions)
- [ ] Daily cron job at 6:00 UTC

### US-8: Multi-Product Support
- **As a** user
- **I want to** track multiple products
- **So that** I can promote different offerings

**Acceptance Criteria:**
- [ ] Dashboard shows product cards grid
- [ ] Card shows: product name, new thread count badge
- [ ] "Add Product" button → wizard
- [ ] Re-run wizard to edit (no inline edit)
- [ ] Unlimited products per user

### US-9: Post History
- **As a** user
- **I want to** see my posting history
- **So that** I can track my engagement

**Acceptance Criteria:**
- [ ] Store: thread URL, date posted, response snippet (~100 chars)
- [ ] Retention: forever
- [ ] Access via History tab in monitoring view

---

## UI/UX Requirements

### Layout
- [ ] Light theme only
- [ ] Header: always visible, user avatar/dropdown (logout)
- [ ] Sidebar: Products link, Settings (logout only)
- [ ] Mobile: sidebar hidden, hamburger menu

### Loading States
- [ ] Page loading: full skeleton placeholders
- [ ] LLM operations: simple spinner

### Wizard
- [ ] Step indicator (dots), not clickable
- [ ] Navigate with back/forward buttons only
- [ ] Linear flow with back/forward navigation

### Errors
- [ ] Technical messages shown as-is
- [ ] Online only (no offline support)

---

## Data Model

Primary keys: UUID

### users
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| redditId | text | unique |
| redditUsername | text | |
| accessToken | text | |
| refreshToken | text | |
| tokenExpiresAt | integer | |
| createdAt | integer | |

### products
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| userId | uuid | FK → users |
| url | text | |
| name | text | |
| description | text | |
| targetAudience | text | |
| createdAt | integer | |

### keywords
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| productId | uuid | FK → products, cascade delete |
| keyword | text | |

### threads
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| productId | uuid | FK → products, cascade delete |
| redditThreadId | text | |
| title | text | |
| bodyPreview | text | |
| subreddit | text | |
| url | text | |
| createdUtc | integer | |
| discoveredAt | integer | |
| status | text | 'active' \| 'dismissed' |
| isNew | integer | 0 \| 1 |

### postHistory
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| userId | uuid | FK → users |
| productId | uuid | FK → products, cascade delete |
| threadId | uuid | FK → threads |
| responseSnippet | text | |
| redditCommentUrl | text | |
| postedAt | integer | |

---

## API Specification (Hono)

Mounted at `/api/*` via Next.js catch-all route.

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/auth/callback/reddit | OAuth callback → dashboard |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/products | Create product (with keywords) |
| GET | /api/products | List user's products |
| GET | /api/products/[id] | Get product + keywords + threads |
| DELETE | /api/products/[id] | Hard delete (cascade all data) |

### Extraction
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/extract | URL → product info |

### Keywords
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/keywords/generate | Product info → keywords |

### Threads
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/threads/search | Keywords → Reddit search |
| POST | /api/threads/[id]/dismiss | Mark dismissed |
| POST | /api/threads/[id]/restore | Restore from dismissed |
| POST | /api/threads/refresh | Manual search trigger |

### Response
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/response/generate | Thread + product → response text |
| POST | /api/response/post | Post to Reddit |

### History
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/history/[productId] | Post history for product |

### Cron
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/cron/discover | Daily thread discovery (6:00 UTC) |

---

## Pages

| Route | Description |
|-------|-------------|
| / | Landing (redirect to /dashboard if authed) |
| /dashboard | Product cards grid |
| /setup | Product setup wizard |
| /monitor/[productId] | Monitoring view (Threads/History/Dismissed tabs) |
| /settings | Account settings (logout) |

---

## Implementation Checklist

### Phase 1: Foundation
- [x] Setup Hono backend with catch-all route (`app/api/[[...route]]/route.ts`)
- [x] Setup Drizzle + Turso schema
- [x] Setup better-auth with Reddit OAuth

### Phase 2: Core UI
- [x] Build app shell (header, sidebar, mobile hamburger)
- [x] Build dashboard with product cards
- [x] Build skeleton loading states

### Phase 3: Product Setup Wizard
- [x] Step 1: URL input + extraction API
- [x] Step 2: Product info form
- [x] Step 3: Keyword generation + thread auto-preview
- [x] Step 4: Thread split view
- [x] Step 5: Save to DB + redirect to monitoring

### Phase 4: Response Flow
- [x] Response generation API
- [x] Response editor panel
- [x] Reddit posting (client-side)
- [x] Toast notifications

### Phase 5: Monitoring
- [x] Monitoring view with tabs
- [ ] Thread dismiss/restore
- [x] Post history tab
- [ ] Manual refresh button

### Phase 6: Automation
- [ ] Vercel Cron job for daily discovery
- [x] New thread badges
- [ ] Token refresh logic

---

## Verification

1. **OAuth flow**: Login → redirects to dashboard
2. **Wizard**: URL input → extracts product → generates keywords → shows threads
3. **Response**: Select thread → generate → edit → post to Reddit
4. **Monitoring**: Check for new thread badge, dismiss/restore threads
5. **Cron**: Verify daily job adds new threads

---

## Technical Notes

1. Hono app mounted at `/api/*` using Next.js catch-all route
2. URL extraction: `fetch` → `jsdom` + `@mozilla/readability` → LLM via `generateObject`
3. Reddit OAuth: better-auth provider, minimal scopes (identity, read, submit)
4. Token refresh: proactive, 1 hour before expiry
5. Reddit search: native `oauth.reddit.com/search` endpoint, title + body
6. Thread dedup: by `redditThreadId` in DB
7. Cron job: iterates all products, searches keywords, retry on failure
8. Client-side Reddit posts: uses user's token directly in browser
9. Rate limits: none enforced, user manages their own
10. API keys: LLM keys in env vars only (shared across users)
11. Deleted Reddit account: keep app data, user can re-auth with new account
