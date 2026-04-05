# AIPLOT.FUN

资料蒸馏成 Ta，时间把对话酿成关系。

AIPLOT.FUN is a production-style character distillation and long-memory chat app.  
Upload documents, notes, screenshots, and photos, turn them into a living character, and keep the relationship growing through memory-aware conversation.

## Why This Project Is Interesting

Most "AI character" demos stop at a prompt and a chat box.

This project goes further:

- It distills messy source material into a structured character with persona, knowledge, voice style, and boundaries.
- It keeps memory per `user × character`, so the same public character can remember different people differently.
- It separates public characters from private ones, making the app work like a real product instead of a toy demo.
- It includes quota control, usage tracking, admin tools, resumable creation flows, and deployable production plumbing.

If you care about AI product design, long-term memory systems, or design-to-product execution, this repo is built to be studied, extended, and shipped.

## Core Experience

### 1. Distill raw material into a character

Users can create a character from:

- pasted text
- `.txt`
- `.md`
- `.docx`
- `.pdf`
- screenshots
- photos

The app extracts text, performs OCR when needed, chunks the material, retrieves relevant parts, and distills the result into a character card.

Each character includes:

- identity and background
- relationship framing toward the user
- speaking style and tone
- source-grounded memory summary
- welcome message
- voice style profile

The distillation model is fixed to `gpt-5.4` for consistency.

### 2. Chat that remembers

The chat system is not just "append old messages into a prompt".

For every `(userId, characterId)` pair, the app maintains:

- short-term context from recent messages
- long-term memories extracted from prior chats
- rolling relationship summaries
- retrieval-ready memory items with embeddings when available

That means:

- user A talking to public character X gets their own private memory trail
- user B talking to the same public character X gets a separate one
- user A talking to character Y does not leak into character X

### 3. Product-style character system

The app has two character spaces:

- Public Characters
  - created by admins
  - available to all signed-in users
  - ideal for site-wide featured characters
- My Characters
  - created by end users
  - private by default
  - fully isolated with their own conversation history and memory

This makes the app feel like a real platform, not a preset-character showcase.

### 4. Background creation flow

Character creation runs in the background.

Users can:

- start a distillation job
- leave the page
- create another character
- come back later and still see status

The app preserves states such as:

- creating
- failed
- completed

and surfaces them in the "My Characters" views.

## Pages

### Homepage

The landing page is positioned as a real product:

- featured hero message
- public character discovery
- private character status recap for signed-in users

### Characters

`/characters` is split into:

- Public Characters
- My Characters

The "My Characters" section shows creation states so unfinished jobs are never silently lost.

### Create

`/create` supports:

- source upload
- pasted text
- source format selection
- relationship hint input
- resumable background creation

Admins automatically create public characters here.  
Regular users automatically create private characters.

### Chat

`/chat/[slug]` restores the active conversation for the current user and character, and injects:

- recent chat context
- character profile
- relationship summary
- retrieved long-term memories
- source evidence

### Me

`/me` gives each user a lightweight dashboard for:

- remaining quotas
- recent usage
- recent characters

### Admin

The admin side includes:

- user management
- per-user quota adjustment
- default quota configuration
- usage analytics
- public character management

It exists to support the product, not to dominate the product.

## What Makes The Memory Layer Different

The memory system is scoped by `userId + characterId`.

It stores:

- `Memory`
  - atomic long-term memory items
- `MemorySummary`
  - rolling summary of user profile, relationship progression, and shared history
- `MemoryEmbedding`
  - retrieval vectors for semantic recall

This keeps the app usable over long chats without letting prompts explode in size.

## Tech Stack

- Next.js 16.2.2
- React 19
- TypeScript
- Prisma 7
- PostgreSQL
- Auth.js credentials auth
- Vercel Blob
- Vercel AI SDK
- BLTCY gateway for LLM, OCR, embeddings, and TTS

## Repo Highlights

Interesting places to explore:

- [src/server/distillation.ts](src/server/distillation.ts)
  - source-to-character pipeline
- [src/server/chat.ts](src/server/chat.ts)
  - conversation orchestration
- [src/server/memory-service.ts](src/server/memory-service.ts)
  - long-term memory extraction, summaries, and retrieval
- [src/server/ingestion.ts](src/server/ingestion.ts)
  - text extraction, OCR fallback, PDF handling
- [src/app/create/page.tsx](src/app/create/page.tsx)
  - background creation entry
- [src/app/chat/[slug]/page.tsx](src/app/chat/[slug]/page.tsx)
  - resumable chat UI entry

## Local Development

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run seed
npm run dev
```

## Environment

Create `.env.local` from `.env.example`.

Required in practice:

- `DATABASE_URL`
- `AUTH_SECRET`
- `BLTCY_API_KEY`
- `BLOB_READ_WRITE_TOKEN`

Optional:

- `QWEN_TTS_API_KEY`
- `OPENAI_API_KEY`
- `INITIAL_SUPER_ADMIN_USERNAME`
- `INITIAL_SUPER_ADMIN_PASSWORD`

## Privacy and Open-Source Safety

This repository is prepared for public sharing.

Sensitive local and deployment-only artifacts are excluded, including:

- `.env*`
- `.vercel/`
- `.npm-cache/`
- local temp files
- local logs

The project keeps secrets out of Git and expects them to live in environment variables only.

## Status

This is not a mockup repo.

It already includes:

- authentication
- admin tooling
- usage tracking
- resumable creation
- production deployment
- public/private character separation
- long-memory chat

## License

Private / custom use unless a separate license is added.
