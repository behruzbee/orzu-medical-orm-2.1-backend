# Standard report / Trello reconciliation, 2026-11-03

## Preserved report rules

Compared the pre-migration backend revision `0aa12d5` (2026-10-21) with
production revision `08c6c4f` using the same current database rows. Both old
and current generators produced identical cell values and styles on the main
78-column worksheet for August and September 2026, for all branches and for
Fotima Sulton separately. These are recalculations on the same current data,
not a claim that recovered historical files or historical status snapshots match.

The standard report filters patient requests by arrival date, excludes soft-deleted
requests and the `new` / `contacted` statuses, and counts complaints using current
`feedback_neg` status. Suggestions and unrelated feedback are separate statuses.
The handed-over-number count includes completed requests plus import error rows;
it is not a count of unique patients. The report template and these rules are unchanged.

BI feedback charts use feedback creation date and feedback type. Request charts
use request creation date. A Trello monthly list is a workflow grouping, not a
database arrival-date filter. Department copies must not be counted as new feedback.

## Live reconciliation

Read-only queries against the current production database and main Trello board,
matching cards by exact FeedbackID, including closed cards. No patient records or
Trello cards were changed.

| Arrival cohort | Unique patients | Active requests | Completed report requests | Handed-over numbers incl. import errors | Report complaints | Matching main-board cards | Suggestions | Unrelated |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fotima Sulton, August | 144 | 0 | 144 | 156 | 3 | 3 | 0 | 2 |
| Fotima Sulton, September | 231 | 45 | 186 | 206 | 7 | 7 | 7 | 0 |
| All branches, August | 1221 | 0 | 1221 | 1303 | 21 | 19 | 11 | 2 |
| All branches, September | 1529 | 165 | 1364 | 1466 | 21 | 21 | 32 | 3 |

Fotima Sulton's three August-arrival complaints were created in September and
are in `Архтв: сентябрь 2026`. Its seven September-arrival complaints were created
in October and are in `Завершен`. Its two August-arrival unrelated cards are in
`Жалобы которые не относятса к клинике`.

Across all branches, September arrivals have 21 report complaints: 20 cards in
`Завершен` and one in `Архтв: сентябрь 2026`. Conversely, that September-named list
has 20 cards: 19 belong to August arrivals and only one to September arrivals.

Two August-cohort complaint records have no saved Trello URL and no matching
FeedbackID on the main board. This does not establish deletion or absence from
other boards. They were not recreated automatically, to avoid unverified duplicates.

## Correction

The formatted branch name returned by BI was not idempotent: JavaScript `\b`
does not match Cyrillic word boundaries. Selecting `… филиал` could normalize it
to `… филиал филиал`, causing an empty report or an unknown-branch error in BI.
Suffix handling now uses explicit whitespace and suffix matching. Regression
coverage includes returned BI labels, cross-month feedback, separate unrelated
statuses, active requests, branch selection, and original Excel column positions.

The authenticated admin endpoint `GET /api/reports/summary` reuses
`ReportStatsService.loadReportData`, exactly like the Excel generator. BI displays
these report totals next to the standard download, with the arrival-date range
and branch, and labels the existing creation-date charts separately in Russian
and Uzbek. A preview reflects current data; a saved Excel file is a snapshot at
generation time and can differ after statuses change.
