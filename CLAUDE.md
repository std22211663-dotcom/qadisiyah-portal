# CLAUDE.md — Qadisiyah Education Portal (server version)

Arabic (RTL) e-government portal for the Qadisiyah Directorate of Education, Iraq. UI text is Iraqi-official Arabic; keep all user-facing strings in Arabic.

## Stack
- `server.js` — single-file Node.js server, **no npm dependencies**: `node:http`, `node:sqlite` (DatabaseSync), `node:crypto`. Requires Node ≥ 22.13.
- `public/index.html` — the whole front end (HTML + CSS + one IIFE script, ES5 style). It was first built as a claude.ai artifact, then moved to talk to this server.
- `org.json` — org chart: keys `gm`, `deputy_admin`, `deputy_tech` → list of `{n: name, acc: has-account, s: [sub-divisions]}`.
- Data in `DATA_DIR` (default `./data`): `portal.db` + `uploads/<uuid>` files.

## How the front end talks to the server
- `GET /api/state` → everything the signed-in account may see (filtered by role in `stateFor()`); `{me:null}` when signed out.
- `POST /api/act` with JSON `{a: '<action>', ...}` and header `X-Requested-With: qp` (CSRF guard). Response `{ok, error?, field?, state?}`; `field` is the input id to show the error under.
- `GET /api/file/:uuid` (permission-checked), `GET /api/backup` (data_manage), `GET /api/public` (employee-login availability).
- Client: `api(action, body)` applies the returned `state` into `S`; accessors `reqs()`, `ints()`, `logs()`, `trash()`, `staff()`, `svc()`, `stampNames()`, `cur()` read from `S`. The page polls `/api/state` every 15 s.
- **Every rule must be enforced in the server action** (`A.<name>` in server.js). Client checks are only for UX.

## Domain
- Roles: `gm` (director general), `deputy_admin`, `deputy_tech`, `head`, `officer`, `inquiry`, `unit` (section/division account), `reviewer` (public applicant). Permissions in `ROLES` (server) mirror the page.
- Request flow: reviewer submits (signature PNG + up to 5 attachments) → staff approve/reject → director/deputy writes the *hamish* and transfers to a section (`req_form`, stamps the sheet) → section routes to a division / marks done (`unit_work`).
- Director general may transfer to every section; each deputy only to their own (`deptsFor`).
- Stamps: green = director general, sky blue = deputies, blue = section. Leader names come from settings and are frozen per request in `form.stampName`.
- Employee-number login: staff list imported from Excel/CSV with any columns; `staff_meta.map` says which column is the id and which is the verification field.

## Running and testing
```bash
DATA_DIR=/tmp/qp PORT=3999 node server.js
```
Default admin on an empty DB: `admin` / `Admin@123`. There is no test suite yet; verify flows in a browser (Playwright works well): reviewer signup → submit request with signature and PDF → admin approve → form/transfer → create section account → section completes → reviewer sees the timeline.

## Conventions
- Keep the server dependency-free unless there is a strong reason.
- Store records as JSON in `data` columns with key fields duplicated as columns; add columns/indexes when a query needs them.
- Log every state-changing action with `logAct(code, detail, me)`; add new codes to `ACT` in the page so they show in the activity log.
- Arabic digits (٠-٩) must be accepted anywhere numbers are typed (`digits()`).

## Ideas for next steps
- Serve jsPDF / html2canvas / SheetJS and the Cairo font locally for intranet use without internet.
- Automatic daily backup of `data/`.
- SMS one-time codes for employee-number login (needs an SMS provider).
- Split `public/index.html` into modules if it keeps growing.
