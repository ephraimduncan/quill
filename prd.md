# Plan: Reddit Agent Refactor

## Summary
Remove Reddit OAuth, switch to email/password auth, use sequential ID-based Reddit fetching, remove reply posting, migrate to Vercel AI Gateway.

---

## 1. Auth: Reddit OAuth → Email/Password

**Remove:**
- [x] Reddit social provider from `lib/auth/index.ts`
- [x] `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` env vars
- [x] Token refresh logic, token status endpoint
- [x] Re-auth UI in monitor page & response editor

**Add:**
- [x] Email/password credentials in better-auth config
- [x] Login/signup pages with email + password forms
- [x] No email verification - immediate access after signup

**Files:**
- [x] `lib/auth/index.ts` - Remove reddit provider, add emailAndPassword plugin
- [x] `lib/auth/client.ts` - Update client for email/password methods
- [x] `app/page.tsx` - Replace "Sign in with Reddit" with login form
- [x] New: `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`

---

## 2. Reddit Fetching: Search API → Sequential ID Polling

**Remove:**
- [x] `/api/threads/search` using `reddit.com/search.json`

**Add:**
- [x] New fetching system based on base-36 ID polling
- [x] Track `lastProcessedId` globally (shared fetch)
- [x] Batch fetch via `api.reddit.com/api/info.json?id=t3_id1,t3_id2,...`
- [x] Keyword matching using Aho-Corasick (for performance)

**New Schema:**
```sql
redditSyncState: { id, lastPostId, updatedAt }
```

**Cron Flow (updated):**
```
1. Get lastPostId from redditSyncState
2. Get latestPostId from reddit.com/r/all/new.json
3. Generate ID range (latest → last)
4. Batch fetch posts via api.reddit.com/api/info.json
5. Load ALL keywords from ALL products (with productId)
6. Build Aho-Corasick automaton from keywords
7. For each fetched post:
   - Run through automaton
   - For each keyword match → insert thread for that productId
8. Update lastPostId in redditSyncState
```

**Files:**
- [x] `lib/db/schema.ts` - Add sync state table
- [x] `app/api/[[...route]]/route.ts` - Replace search with ID polling
- [x] New: `lib/reddit/id-fetcher.ts` - Base-36 ID logic, batch fetching
- [x] New: `lib/reddit/keyword-matcher.ts` - Aho-Corasick implementation

---

## 3. Remove Reply/Post Functionality

**Remove:**
- [x] `POST /api/response/post` endpoint
- [x] "Post to Reddit" button in UI
- [x] `postHistory` table
- [x] Token status checking UI
- [x] Re-auth prompts

**Keep:**
- [x] AI response generation (`/response/generate`)
- [x] Response editor panel (for viewing/copying)
- [x] All discovered threads (with matchedKeyword for filtering)

**UI Change:**
- [x] Response panel: Show AI response + "Copy" button + "Open in Reddit" link
- [x] User copies response, clicks link, pastes in Reddit manually

**Files:**
- [x] `app/api/[[...route]]/route.ts` - Remove post endpoint, token-status endpoint
- [x] `components/response-editor-panel.tsx` - Remove post button, add copy + reddit link
- [x] `app/(app)/monitor/[productId]/page.tsx` - Remove post history tab, keep threads view
- [x] `lib/db/schema.ts` - Remove postHistory table

---

## 4. AI: OpenAI → Vercel AI Gateway

**Current:**
```typescript
import { openai } from "@ai-sdk/openai"
model: openai("gpt-4o-mini")
```

**New:**
```typescript
import { createOpenAI } from "@ai-sdk/openai"
const openai = createOpenAI({
  baseURL: "https://gateway.ai.vercel.app/v1",
  apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY
})
```

**Files:**
- [x] `app/api/[[...route]]/route.ts` - Update AI imports/config
- [x] `.env.example` - Replace `OPENAI_API_KEY` with `VERCEL_AI_GATEWAY_API_KEY`

---

## Migration Steps

- [x] 1. Add email/password auth alongside Reddit (keep both temporarily)
- [x] 2. Implement ID-based Reddit fetching
- [x] 3. Test keyword matching with new fetch system
- [x] 4. Remove post functionality from UI
- [x] 5. Switch to Vercel AI Gateway
- [x] 6. Remove Reddit OAuth completely
- [x] 7. Update env vars, clean up dead code

---

## Decisions

- **Email verification**: No - immediate access after signup
- **Sync state**: Global lastPostId (shared fetch), per-user thread storage
- **Content type**: Posts only (t3_) - skip comments
- **Thread storage**: Per user/product with matchedKeyword

---

## Multi-Tenant Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Global Sync State                                      │
│  lastPostId: "1abc123" (tracks Reddit fetch position)   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼ Cron fetches new posts
┌─────────────────────────────────────────────────────────┐
│  Raw Reddit Posts (fetched by ID range)                 │
│  - Post A: "Best project management tools?"             │
│  - Post B: "Looking for time tracking app"              │
│  - Post C: "Random unrelated post"                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼ Match against ALL users' keywords
┌──────────────────────┐     ┌──────────────────────┐
│  User 1 (Product X)  │     │  User 2 (Product Y)  │
│  Keywords: "project  │     │  Keywords: "time     │
│  management"         │     │  tracking"           │
│                      │     │                      │
│  Matched: Post A     │     │  Matched: Post B     │
│  (stored to threads) │     │  (stored to threads) │
└──────────────────────┘     └──────────────────────┘
```

**Key points:**
- Global fetch: One cron job fetches ALL new Reddit posts
- Per-user matching: Each post checked against every user's keywords
- Isolated storage: Threads stored per product (user only sees their matches)
- No cross-contamination: User 1 never sees User 2's threads

---

## Updated Data Model

**threads table** (existing, add matchedKeyword):
```sql
threads: {
  id, productId, redditThreadId, title, bodyPreview, subreddit, url, createdUtc,
  discoveredAt, status, isNew,
  matchedKeyword: text  -- NEW: which keyword triggered this match
}
```

**redditSyncState table** (new, singleton):
```sql
redditSyncState: {
  id: "global",       -- always "global", singleton row
  lastPostId: text,   -- base-36 ID of last processed post
  updatedAt: integer
}
```

---

## Verification

- [x] 1. **Auth**: Sign up with email/password → Login → Access dashboard
- [ ] 2. **Reddit fetching**: Trigger poll → Verify threads appear with matchedKeyword
- [ ] 3. **Keyword matching**: Add keyword → Poll → Confirm matching threads discovered
- [ ] 4. **Response generation**: Select thread → Generate → Copy button works → Reddit link opens
- [ ] 5. **AI Gateway**: Check Vercel dashboard for API calls routing through gateway
- [ ] 6. **Cron**: Manually trigger `/api/cron/discover` → New threads discovered via ID polling
