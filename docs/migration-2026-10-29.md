# Railway to Coolify verification, 2026-10-29

## Database Map

All destinations are separate databases in the private PostgreSQL 18 service
`orzu-feedback-db` in the `orzu-feedback-2-1` Coolify project. No public database
port was opened. The archive databases have independent new credentials and
PUBLIC connection privileges revoked. Credentials are not stored in Git.

| Railway source | Coolify database | Verification |
| --- | --- | --- |
| Postgres-Cjbd / feedback 2.1 | `orzu_feedback` | Nine clinical/history tables match row counts and complete-row checksums. Original 137 report history rows retained. Both rotated admin PINs verified. |
| Postgres | `orzu_legacy_postgres` | Six tables, 47 rows; contents, eight indexes and 29 constraints match. |
| Postgres-pVhs / feedback 2.0 | `orzu_legacy_feedback_v2` | Six tables, 4,754 rows; contents, eight indexes and 49 constraints match. All 39 stored audio files included. |
| MySQL / original complaint system | `orzu_legacy_mysql` | Eight tables, 52,798 rows; every row verified after conversion, including all 132 binary media files (97,335,007 bytes). |

The legacy databases are archives, not live application cutovers. Their old
applications have not been reconfigured to use these databases. Do not point
the MySQL application at PostgreSQL without adapting its database driver and
queries. MySQL collations are not emulated; the archive uses PostgreSQL native
collation behavior. UUID strings, nullable values, timestamps with microseconds,
enum labels, binary files, primary/unique indexes, foreign keys, update-time
behavior and the next auto-increment value were preserved by the conversion.

## Reports And API

- Feedback 2.1: 137 missing Excel files recreated from current data with explicit
  provenance sheets; original history untouched. Each replacement was downloaded
  and opened with ExcelJS, and its source report ID checked. Together with the
  newly generated regular report, 138 files are available; history has 275 rows.
- Feedback 2.0: 18 historical report records retained. Eleven file URLs point to
  localhost and seven to Railway. Original Excel file recovery is not confirmed.
- New API: four BI endpoints passed HTTP checks for September and the full period
  (eight requests, 15-555 ms in the post-repair check). The earlier old/new API
  comparison matched, but the later Railway API returned `Application not found`,
  so a fresh live API comparison could not be completed. Direct database checks
  still matched.
- Report list, report recreation and BI endpoints reject unauthenticated access.
- The 2.1 Trello webhook now targets the Coolify API. Legacy attachment URLs and
  application routes still require a separate cutover or archival access path.

## Backups

`scripts/backup-feedback-databases.sh` backs up all four databases and the report
files, validates archive readability and writes SHA-256 checksums and a COMPLETE
marker. It is scheduled daily at 02:15 server time using
`/etc/cron.d/orzu-feedback-databases`. Server copies are stored in the private
`/data/orzu-feedback-backups` directory. Original source dumps and off-server
copies are also kept in the operator's private local backup directory.

The script deliberately does not delete previous backups. Configure monitored
retention and an independent scheduled off-server destination before relying on
it for long-term disaster recovery. Changes to the PostgreSQL container or
uploads volume names require updating the scheduled task's environment.

## Deletion Gate

Database copies are verified, but this is not blanket approval to delete the
Railway project. Before deletion, resolve or explicitly accept unavailable old
Excel files, cut over remaining legacy links/consumers, reconcile any writes
after the final source snapshot, and rotate/revoke shared integration secrets
where required. Railway resources were not deleted by this migration.
