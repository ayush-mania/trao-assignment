# 0005 — Retrieval: best-first crawl, strict URL policy, honest sources

## Status

Accepted, 2026-09-11.

## Decision

- Plain HTTP (`fetch`) + cheerio; no headless browser.
- URL policy: `http(s)` only; credentials/fragments stripped; in production any host that is or
  resolves to a private, loopback, link-local or CGNAT address is refused (hex v4-mapped IPv6
  included); redirects are followed manually and every hop re-checked; robots.txt is fetched without
  following redirects and with a size cap. `ALLOW_PRIVATE_URLS=true` only for local batch runs.
- Caps: 10 s timeout, 5 redirects, text/html or text/plain, 1.5 MB body. Every failure is a typed
  reason, never an exception.
- Crawl: best-first from the homepage, same origin only; links scored by path and anchor text;
  pages classified about/hiring/other from their own text (URL path is weaker evidence); stops at
  found-both, 12 attempts (failures count), 60 s, or no links.
- Public discussion: Hacker News Algolia API and Reddit's public JSON search; key-less. Results kept
  only if they mention the company name and an interview word. Glassdoor, Blind, LinkedIn not attempted.

## Why

Section 2 forbids a fixed path list and demands skip-and-report; Section 9 puts sites on localhost
with relative links; Section 11 says treat fetched pages as hostile. Careers/about pages are almost
always server-rendered and the fixture sites are static, so a browser would add a failure mode
without adding recall. Reddit answers 403 to our bot user-agent; that is recorded honestly rather
than evaded.

## Rejected

Playwright; hard-coded `/careers` paths; spoofing a browser UA for Reddit; scraping Glassdoor/Blind.

## Known limitation

DNS rebinding between the policy check and the connection (documented in README).
