# Feature: web app — sign in, kits, generation progress

> Routes: `/` `/login` `/register` `/kits` `/kits/new` `/kits/[id]` (progress + builder) `/kits/[id]/practice`
> Source: `apps/web/src` — `lib/api.ts` (typed client) · `lib/session.tsx` (session + gate) · `lib/use-kit.ts` (polling) ·
> `lib/parse-cases.ts` (bulk file) · `lib/builder-api.ts` + `lib/use-builder.ts` (optimistic mutations, debounce) ·
> `components/layout/shell.tsx` · `components/kits/progress.tsx` · `components/builder/*` · `app/**`
> Decisions: ADR 0001, 0002, 0008

**The web app only ever imports types from `@trao/core`.** Runtime constants it needs (the step list)
are mirrored locally, because core depends on Node modules that cannot ship to the browser.

## Session

`useSession()` probes `GET /auth/me` once (a 401 means signed out, not an error). `RequireSession`
wraps every protected page: without a session it redirects to `/login?next=<path>` and the sign-in
form returns you there. Sign out calls the API (the session row is deleted) and clears the cache.

## Creating kits

`/kits/new` posts one kit and navigates straight to it. The bulk section reads a JSON array or CSV
(RFC-4180: quoted fields, doubled quotes, newlines inside quotes) with `jd`, `company_url`, `days`,
shows how many rows are valid and lists the reasons for the rest, and posts `/kits/bulk`.

## Watching generation

`useKit(id)` polls `GET /kits/:id` every 2 s while the kit is queued or running and stops when it is
done or failed. `GenerationProgress` renders the persisted `state.steps[]` as a ten-step timeline:
done steps with timing and the notes the pipeline recorded (hiring page URL, "0 snippets", "reddit
skipped: http_403"), skipped steps marked as such, the current step, and — on failure — the error
code and a **Retry from the failed step** button (`POST /kits/:id/retry`). When the kit is ready the
timeline collapses into a "How this kit was researched and built" disclosure. The list page keeps
refreshing every 3 s while any kit is still generating.

## The builder (kit ready)

Tabs: Brief · Role · Questions · Flashcards · Schedule. Every question, answer outline, flashcard
side and the brief is an `EditableText`: edits are held locally while focused, saved on a 500 ms
debounce and on blur, so typing never round-trips per keystroke; a server-side change (a
regeneration) is reflected when the field is not focused. All builder calls go through
`useBuilderMutation`: the cache is updated optimistically, rolled back on error, and replaced with
the server's `{ kit, meta }` on success.

- **Reorder / move** — dnd-kit sortable lists per category with the pointer sensor (4 px activation so
  clicks still work) and the keyboard sensor: focus the ⋮⋮ handle, Space to pick up, arrows to move,
  Space to drop. "Move to" is a native `<select>` for cross-category moves. Order is persisted via
  `PUT /order` and the kit's own `questions[]` follows it.
- **Origin badges** — `edited` / `yours` / `pinned` from `meta.items`, and each Regenerate button says
  what it will do first: "replaces 3 generated, keeps 2 edited/pinned/yours".
- **Regenerate** — disables and marks only that section (`aria-busy`); an LLM 503 shows inline with
  dismiss and leaves the kit unchanged. Schedule regeneration takes a new day count and is deterministic.
- **Coverage** — the Questions tab lists requirements no question covers; the Role tab marks them.

Verified in a browser on 2026-09-11: edit q1 → pin q2 → Regenerate technical kept both in place and
replaced q3 with q14–q16; keyboard reorder moved q14 to the top and persisted.

## Practice mode

`app/kits/[id]/practice/page.tsx`. Progress lives on the kit document (`practice: { [cardId]:
{ confidence, seenAt, reviews } }`, API `GET/POST rate/DELETE /kits/:id/practice`). The page mirrors
core's `buildPracticeOrder` (unseen → lowest confidence → least recently seen → kit order) to build
a session, keeps that order fixed for the session, reveals on Space and rates on 1/2/3, and lists
coverage per card. Verified in a browser on 2026-09-11: two cards rated by keyboard, header shows
"2 of 7 covered · 1 shaky", ratings persisted.

## States and keyboard

Every screen has explicit loading (skeletons with `aria-busy`), empty ("No kits yet" with a call to
action) and error (`role="alert"` with a retry) states. Buttons that navigate are rendered as real
links (`render={<Link/>}` with `nativeButton={false}` — Base UI); forms are native forms; the shell
has a skip link and a labelled `<nav>`.

Verified in a browser on 2026-09-11 against the running API and fixture sites: register → empty
state → form → live timeline (skipped step shown with its reason) → ready. Audited at 390 px: builder
cards and action rows stack, tabs wrap, the skip link is the first Tab stop with a visible ring; with
the API stopped every page shows the `role="alert"` error with a working Try again.
