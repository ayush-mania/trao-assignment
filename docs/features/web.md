# Feature: web app — sign in, kits, generation progress

> Routes: `/` `/login` `/register` `/kits` `/kits/new` `/kits/[id]`
> Source: `apps/web/src` — `lib/api.ts` (typed client) · `lib/session.tsx` (session + gate) · `lib/use-kit.ts` (polling) ·
> `lib/parse-cases.ts` (bulk file) · `components/layout/shell.tsx` · `components/kits/progress.tsx` · `app/**`
> Decisions: ADR 0001, 0002

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

## States and keyboard

Every screen has explicit loading (skeletons with `aria-busy`), empty ("No kits yet" with a call to
action) and error (`role="alert"` with a retry) states. Buttons that navigate are rendered as real
links (`render={<Link/>}` with `nativeButton={false}` — Base UI); forms are native forms; the shell
has a skip link and a labelled `<nav>`.

Verified in a browser on 2026-09-11 against the running API and fixture sites: register → empty
state → form → live timeline (skipped step shown with its reason) → ready.
