---
name: dr
description: Thorough design and UX review of a page, component or screenshot in Barber (barberuz.vercel.app). Checks the cream/copper "lux" kit shared with zarkebab.uz, Cormorant Garamond + Onest typography, glass cards, spacing, dark/light themes, touch ergonomics on phones, loading/empty/error states, responsiveness, three locales and consistency between the public booking page and the dashboard. Arguments: empty or "full", "diff", a page or route, a component, a screenshot, or an area code (LAY, COL, TYPE, TOUCH, STATE, RULE, REUSE, RESP, PUB). Use when the user types /dr.
argument-hint: "[empty = full | diff | page/route | component | screenshot | area code (LAY, COL, TYPE, TOUCH, STATE, RULE, REUSE, RESP, PUB)] [fix]"
disable-model-invocation: true
---

# /dr: design review

> **Shared contract.** Load the `review-core` skill first (`~/.claude/skills/review-core/SKILL.md`). Its ground rules, argument
> grammar, S0/S1/S2 severity scale, report skeleton, fix mode and fan-out
> apply here. This file adds only what is specific to Barber.

Target: `$ARGUMENTS`. `diff` means every screen the uncommitted diff (or the
last commit) touches. Empty or `full` means every page in `src/pages` and
every component in `src/components`: run the strict-rule scan once, review
the public pages and the dashboard as two groups, and compare siblings for
reuse. `fix` implements the agreed improvements afterwards.

Sources of truth: `AGENTS.md`, the tokens in `src/index.css`, the shared
components in `src/components/ui.jsx`, and `references/cases.md`.

Judge it as a senior product designer: a client on a phone in a Telegram
webview must book in under a minute with one thumb; a barber between two
clients must read today's calendar at a glance. It must look intentional in
both themes and in O'z, Ru and En.

## 1. Gather the visuals
- Start `barber-dev` (`.claude/launch.json`), built-in browser. Demo mode
  needs no sign-in: `/demo` (public), `/b/<token>` (after a booking),
  `/admin/*`.
- Capture each target at **375, 768, 1280 and 1920 px**, light and dark
  (`resize_window` `colorScheme`), in **Ru** (longest strings) plus O'z.
  Client screens matter most at 375 px, the calendar at 768 and 1280.
  For size cases use the ladder: 320×568, 375×812, 390×844, 414×896, 667×375,
  768×1024, 1024×768, 1280, 1440, 1920.
- Two data states: *busy day* (many bookings, long client list, reviews) and
  *empty* (new shop, day with no bookings, no services, no reviews). Reach
  empty via a far date or by archiving in demo mode after "Reset demo".
- Overlays are part of the screen: `Sheet` (booking, new booking, service,
  client), the waitlist form, Telegram cards, `LangSwitch`, `ThemeToggle`,
  the phone sticky bar on `/demo` and bottom tabs in `/admin`.
- Read the screen source and `ui.jsx`, `index.css` tokens, `tailwind.config.js`.

## 2. Checklist
**Layout** — consistent card radii (28/24/22), 4 px scale, one primary
action per area, no dead space in glass cards, step numbers visible.
**Colour** — tokens only (`--page`, `--glass`, `--gold`, `--ok/--warn/--bad`);
hard-coded hex limited to the copper gradients; contrast ≥ 4.5:1 body, 3:1
large, in both themes; status colours identical on chips, pills and calendar
blocks.
**Type** — `serif` for titles and numbers that carry meaning, Onest for text;
tabular numbers for times and money; Ru strings fit chips and buttons.
**Touch** — targets ≥ 44 px on phones (time chips, day chips, tabs); sticky
bar never covers the last form field; `env(safe-area-inset-bottom)`.
**State** — shimmers shaped like the content, `ErrorNote` with retry,
designed empty states (no slots → waitlist; no services; no reviews).
**Rule scan (each hit ≥ S1)** — `rg -n "animate-spin|Loading\.\.\.|alert\(|confirm\(" src`;
`rg -n "text-\[1[01]px\]|text-\[[0-9]px\]" src` (below 12 px);
`rg -n "#[0-9a-fA-F]{6}" src/pages src/components | rg -v "C08447|7C4F22|A86D33|D9A466|B07A3A|D19A55|FFF8EE"`
(hard-coded colours outside the copper set); inputs below 16 px font on
phones (iOS zoom).
**Reuse** — the same control built twice (chips, pills, sheets, field labels)
instead of `ui.jsx`; the public page and dashboard disagreeing on a pattern.
**Responsive** — no horizontal scroll at 320–414 px; the calendar scrolls
inside its card; tables scroll inside, not the page.

## 3. Measure, don't eyeball
Use `javascript_tool` for computed styles, `getBoundingClientRect` for
targets and overlaps, and `document.documentElement.scrollWidth` for
overflow. Quote the numbers in findings.

## 4. Report
Skeleton from `review-core` section 3. **S0** = unusable (action off-screen,
unreadable contrast, broken layout in a theme). **S1** = a rule above
broken or a flow slowed. **S2** = polish. Append cases to `references/cases.md`.
