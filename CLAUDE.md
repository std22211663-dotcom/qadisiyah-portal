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
- Employee-number login (`emp_login`, the "الرقم الوظيفي" tab, always available): first tries the imported staff list (`staff_meta.map` says which column is the id and which is the verification field), then a registered reviewer account whose `emp_id` matches and whose **birth date or national id** matches. 5 wrong tries lock the IP and the account (`e:ip`, `ea:empNo`) for 5 minutes. Reviewers only; never admin accounts.
- Reviewer identity: signup requires `empNo` (stored in `users.emp_id`, unique, normalised by `idnorm`) and `nid` (national id, in `data`, unique). `noDupPerson()` rejects a second account with the same name (hamza/diacritics/spacing ignored) + birth date, in signup, `rv_save` and `profile_save`.
- Reviewer profile page (`profile_save`): reviewers edit their own data; changing empNo / nid / birth needs the current password. Accounts created from the staff list (`info` set) cannot change their empNo.
- Managers (`users_manage`) add or edit reviewer accounts with `rv_save` (page "إدارة المراجعين").
- Technical support: public `support_submit` (works signed out, max 5 per IP per hour, one image only) -> table `support`; managers read them on the "المشاكل المرسلة" page and close them with `support_status`. Images are readable only by `users_manage` (`canSeeFile`). Included in backup/restore.

## Running and testing
```bash
DATA_DIR=/tmp/qp PORT=3999 node server.js
```
Default admin on an empty DB: `admin` / `Admin@123`.

```bash
npm test      # 103 checks, ~8 s; every suite runs on its own temporary server and database, ./data is never touched
```
Suites in `test/`: `smoke` (signup -> request -> approve -> transfer -> section -> interview -> trash/restore -> backup), `employee-login`, `profile`, `duplicates`, `backup` (support messages). Add a suite there for every new action. UI changes still need a look in a browser (every view, phone width, dark mode); drawing the signature needs real pointer events.

Port note: another local project may already use 3000; check with `netstat -ano | findstr :3000` before assuming a stale server is yours. After editing `server.js` the running server must be restarted.

## Tutorial videos
Two screen-recorded Arabic walkthroughs (administrators / reviewers) are produced by `tutorial/`: `node tutorial/record.js manager` or `reviewer` (add `--dry` to play fast without recording). It starts a throw-away portal with demo data, drives Chrome through DevTools and records the tab to `tutorial/output/*.mp4` (git-ignored) together with the narration text. No dependencies. Re-record after UI changes: scenes are in `scenes-*.js`, the on-screen helper in `director.js`. There is no Arabic voice installed on the machine, so the videos use on-screen captions.

## Conventions
- Keep the server dependency-free unless there is a strong reason.
- Store records as JSON in `data` columns with key fields duplicated as columns; add columns/indexes when a query needs them.
- Log every state-changing action with `logAct(code, detail, me)`; add new codes to `ACT` in the page so they show in the activity log.
- Arabic digits (٠-٩) must be accepted anywhere numbers are typed (`digits()`).
- Never rely on the browser's native date/time inputs (they show mm/dd/yyyy and AM/PM): `type="date"` / `type="time"` inputs are swapped automatically for Arabic selects by `enhanceDates()` (the original input becomes `type=hidden`, same id and value format). A birth-date field needs its id added to the list inside `enhanceDates` so the year range is 18-75 years back.
- Theme: all colours are CSS variables; `<style id="theme-v2">` is the screen-only design layer (glass panels, gloss/reflections) placed after the base styles; print rules stay untouched. The light/dark switch stores `qp_theme` in localStorage.
- The page has a demo mode (`?demo=1` only, `admin` / `admin123`, no server calls). Never enable it by hostname.

## Ideas for next steps
- Serve jsPDF / html2canvas / SheetJS and the Cairo font locally for intranet use without internet.
- Automatic daily backup of `data/`.
- SMS one-time codes for employee-number login (needs an SMS provider).
- Split `public/index.html` into modules if it keeps growing.
