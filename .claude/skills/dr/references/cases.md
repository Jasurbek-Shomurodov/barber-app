# Design regression catalog (Barber)

Severity if failed: **S0** unusable (action off-screen, unreadable contrast, broken layout in a theme); **S1** a rule broken or a flow slowed; **S2** polish. IDs stable; append, never renumber.

## Run log (newest first)

| Date | Commit | Scope | Findings (S0/S1/S2) | Sizes | Not run |
|---|---|---|---|---|---|

## LAY / COL / TYPE

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| LAY-001 | S1 | Card radii consistent | Inspect `rounded-[…]` on glass cards | 28 for hero/sheets, 24 for sections, 22 for list cards |
| LAY-002 | S1 | Step headings align | `/demo` steps 1–3 | Serif number and title on one baseline; muted until reachable |
| COL-001 | S0 | Dark theme readable | Toggle on every page | Body ≥ 4.5:1, `--muted` ≥ 3:1 on `--page` |
| COL-002 | S1 | Status colours agree | Calendar blocks vs `StatusPill` vs waitlist pills | booked=copper, done=ok, no_show=bad, blocked=muted hatch |
| COL-003 | S1 | No stray hex | `rg -n "#[0-9a-fA-F]{6}" src/pages src/components \| rg -v "C08447\|7C4F22\|A86D33\|D9A466\|B07A3A\|D19A55\|FFF8EE"` | No hits |
| TYPE-001 | S1 | Tabular numbers for times/money | Inspect time chips, totals, tables | `tabular-nums` present |
| TYPE-002 | S1 | Ru strings fit | Switch to Ru at 375 px | Buttons and chips not clipped; sticky bar labels fit |

## TOUCH / STATE / RESP / PUB

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| TOUCH-001 | S1 | Time chips ≥ 44 px tall at 375 px | `getBoundingClientRect` | height ≥ 44 |
| TOUCH-002 | S0 | Sticky bar never hides the submit field | Scroll to details at 375 px | Note field fully visible above the bar |
| STATE-001 | S1 | Shimmer shapes match content | Reload `/demo`, `/admin/clients` | Shimmers in the same grid as the content |
| STATE-002 | S1 | Empty day on public page is designed | Pick a full day | Waitlist card, not blank |
| RESP-001 | S0 | No horizontal scroll 320–414 px | `scrollWidth <= innerWidth` | True on every page |
| RESP-002 | S1 | Calendar week fits or scrolls inside | 768 px | Inner scroll only |
| PUB-001 | S1 | Hero stats legible | `/demo` 375 px | Clients served + rating tiles on one or two tidy rows |
