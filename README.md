# أتوبيس الموظفين – Staff Bus

React + TypeScript + Vite + Firebase (Auth, Firestore, Security Rules) + jsPDF. The UI is Arabic (RTL); only the IN / OUT labels stay English.

## How it works

* **Employees sign in with the Employee ID only** (no e-mail, no password). **Managers / admins** type their ID and then a **PIN** – the PIN field appears on the same screen only when the ID belongs to a management account (there is no separate manager login page).
* Sign-in goes through the serverless function `api/login.ts`, which checks the ID (and PIN) on the server and returns a Firebase custom token. The browser never holds a password derived from an ID.
* **Employee ID → employee screen:** the employee sees the bus info, **their own record (the only editable one)**, the **Going list** and **Returning list** (who is IN), and all main / waiting employees in read-only mode.
* **Manager / admin ID → management dashboard:** main & waiting employees (editable), going/returning switch, live summary `X / 13`, PDF export, arrival tracking. The role is stored on the account, not chosen on screen.

## Requirements

* Node.js **20.6+**
* A Firebase project (free Spark plan is enough) and the Firebase CLI: `npm install -g firebase-tools`

## Setup

```bash
npm install
cp .env.example .env      # fill in the Firebase web config
firebase login
npm run rules:deploy      # deploy firestore.rules  (re-run after every rules change)
```

Firebase console: initialise **Authentication** (Get started) and create a **Firestore** database in production mode. The Email/Password provider is **not used for sign-in any more** – switch it OFF after running `npm run harden-auth` (see *Migrating an existing project*). Put your project id in `.firebaserc`. For the scripts, download a service-account key as `serviceAccountKey.json` (git-ignored).

Vercel: add the environment variable **`FIREBASE_SERVICE_ACCOUNT`** (the whole service-account JSON). Both serverless functions need it: `api/login.ts` (sign-in) and `api/employees.ts` (employee management).

### Development data

```bash
npm run seed   # dev project only
```

Creates the bus (النزهة – أ ص 8381 – capacity 13), employees `EMP1001`–`EMP1005` (3 main, 2 waiting) and the manager `MGR001`, whose PIN is `SEED_MANAGER_PIN` (default `dev-manager-2026`, printed by the script – **development only**).

### Importing the real roster (main + waiting)

```bash
cp data/employees.example.csv data/employees.csv    # fill in the real data (git-ignored)
npm run import-employees -- data/employees.csv --dry-run   # validate only
npm run import-employees -- data/employees.csv             # import
```

Columns: `employeeId,name,type[,busId]` (`type` = `main` | `waiting`; `busId` may be omitted when the project has a single bus). **Main employees start as IN for both Going and Returning**, waiting employees start as OUT; the bus counters are recomputed from the real records. Existing employees are not modified, so the import can be re-run safely.

### Production data

```bash
npm run create-user -- bus      bus-nozha-01 "النزهة" "أ ص 8381" 13
npm run create-user -- employee EMP1025 "Ahmed Mohamed" main bus-nozha-01
npm run create-user -- manager  MGR-k7x2q9f4m1     # asks for a PIN (typed twice, never echoed)
npm run create-user -- admin    ADM-p3d8v1n6z5
npm run set-pin     -- MGR-k7x2q9f4m1              # change a PIN later (also lifts a lock)
```

Use **long random IDs** for managers / admins (as above), not guessable ones such as `MGR001`. PINs need at least 6 characters.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_FIREBASE_*` (6 values) | Web-app config from the Firebase console |
| `VITE_COMPANY_NAME` | Optional, printed on the PDF |
| `VITE_EMPLOYEE_EMAIL_DOMAIN` | Optional, **server side only** now (`api/*`, scripts): the synthetic e-mail domain that links an ID to its Auth account. Must be the same on Vercel and in `.env`, and must not change once accounts exist |
| `FIREBASE_SERVICE_ACCOUNT` | **Vercel only** – the service-account JSON used by `api/login.ts` and `api/employees.ts` (also a GitHub secret for the daily reset) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Scripts only – path to the service-account key |
| `SEED_MANAGER_PIN` | Seed script only (development project) |

`VITE_AUTH_SUFFIX` no longer exists – delete it from `.env` and from Vercel.

## Run / build / deploy

```bash
npm run dev       # http://localhost:5173 – UI only: /api/login does not exist here, so you cannot sign in
npx vercel dev    # the whole app locally, including /api/login and /api/employees (needs FIREBASE_SERVICE_ACCOUNT)
npm run build
npm run preview
npm run rules:deploy   # Firestore rules (re-run after every rules change; `npm run deploy` is the same thing)
```

The app itself is deployed by Vercel (push to the repo). Firebase Hosting has no `/api` functions, so it can no longer serve this app.

## Tests

```bash
npm test             # unit tests: sign-in logic (PIN, lockout, IP limit), dates, daily reset, CSV import, …
npm run test:rules   # Firestore rules, against the emulator (needs `firebase-tools` and Java)
```

## Security model (read this)

* **Employees: the Employee ID is the only credential**, as requested. Anyone who knows or guesses an employee ID can open that employee's screen – and an employee can already read the IDs of everyone on their own bus (the `employeeId` field is the document id). That is the accepted trade-off of ID-only login: it limits what a stranger can do (change one person's IN/OUT), not what a colleague can do.
* **Managers / admins: ID + PIN.** The PIN is stored hashed (scrypt) in `credentials/{uid}`, which no client can read or write. 5 wrong PINs lock that account for 15 minutes; every client IP also gets at most 20 failed attempts per 10 minutes (counters live in `loginAttempts`, parallel guesses are counted atomically). The lock can be lifted with `npm run set-pin`. Note the trade-off: someone who knows a manager's ID can lock that manager out for 15 minutes by guessing – use random, unpublished IDs.
* The Firebase accounts behind the IDs have **random passwords nobody knows**; sign-in is a custom token minted by `api/login.ts` after the checks above. There is no password (and no suffix) in the browser bundle.
* The Employee ID is never printed in the exported PDF (the PDF gets shared around) and is not shown on the cards.
* The Firestore rules still enforce everything server-side: an employee can **read** everyone on their own bus but **write** only their own `goingStatus` / `returningStatus`; capacity is enforced atomically by transaction + rules; arrival can be recorded only once until a manager resets it; only admins create/delete employees and buses; a trip's `date` must be **today in Cairo** (judged by the server clock); `credentials`, `loginAttempts` and `meta` are closed to every client.
* Consider enabling **Firebase App Check** as well. Rotate the service-account key if it was ever shared (zip files, chats, screenshots).

## Migrating an existing project (accounts created before `/api/login`)

Do the steps in this order so nobody is locked out in between:

1. For every manager / admin: `npm run set-pin -- <ID>`. Do this **before** deploying – a management account without a PIN cannot sign in. (Consider switching to long random IDs: create the new account with `create-user`, then delete the old one.)
2. Deploy this version (Vercel) and make sure `FIREBASE_SERVICE_ACCOUNT` is set there. Employees sign in exactly as before. Old browser tabs keep working until step 4.
3. Test a manager sign-in (ID + PIN) and an employee sign-in on the deployed app.
4. Run `npm run harden-auth` (`-- --dry-run` first). It gives every ID account a random password, which closes the old "derived password" route straight into Firebase Auth.
5. Firebase console → Authentication → Sign-in method → turn **Email/Password OFF**.
6. Re-deploy the rules: `npm run rules:deploy`.
7. Delete `VITE_AUTH_SUFFIX` from Vercel / `.env`.

## Structure

```
src/firebase   config · auth · firestore        src/pages     Home · EmployeeDashboard · ManagerDashboard
src/services   auth · employee · busTrip        src/hooks     useLiveData · useBusData · useStatusUpdater
src/components Header · EmployeeCard · EmployeeList · PassengerList · Summary · ArrivalSection · EmployeeIdDialog
api            login.ts · employees.ts · _lib/ (core · pin · rateLimit)   Vercel serverless functions
scripts        seed.ts (dev) · create-user.ts · set-pin.ts · harden-auth.ts · import-employees.ts · reset-daily.ts
tests          rules/ (Firestore rules, emulator)       *.test.ts next to the code (unit tests)
```

## Notes

* The PDF export is still in English (Arabic text such as the route is embedded as an image so it renders correctly). It does not print Employee IDs.
* **Time zone:** the trip day, the dates and the times on screen are always Cairo time (`Africa/Cairo`), whatever the phone's clock or time zone says – the same as the nightly reset.
* Each employee has two tallies, `goingInCount` and `returningInCount`, shown next to "الذهاب" / "العودة". A tally goes up by 1 every time the employee switches from OUT to IN (switching back and forth adds up), and the rules enforce that exact increment.
* **وصلنا (arrival):** any employee on the bus can press it (Employee dashboard footer). It exists for the **going direction only**: the button shows while the bus' active direction is *going* and is stored on today's going-trip `busTrips` document (server time + who pressed). It appears live for everyone on the bus and on the manager's arrival section. The first press wins; the employee who pressed it can undo it with the X on the card (and a manager/admin can always reset it). A new day opens a new trip, so the button comes back. **Re-deploy the rules** (`npm run rules:deploy`) after pulling this change.
* **تتبع الأتوبيس (live tracking):** the first employee on the bus taps "ابدأ مشاركة موقع الأتوبيس"; her phone's GPS position is written to `busLocations/{busId}` (≈ every 5 s while the bus moves, a heartbeat every 15 s when parked) and every colleague on the bus sees it on a live map (Leaflet + OpenStreetMap) whose marker glides smoothly and which follows the bus (drag the map to look around, 🎯 to resume) and can go full screen with a button that opens Google Maps directions to the bus. Only one sharer at a time; a colleague can take over when the sharer stops or her updates are older than 90 s. Sharing stops automatically when the going trip's arrival is recorded, on logout, or via "إيقاف المشاركة". **Limitation:** this is a web app, so the GPS only reports while the sharer's page is open in the foreground (browsers pause it when the screen locks or the tab is in the background). Re-deploy the rules after pulling this change.
* **Employee management (manager dashboard → "إدارة الموظفين"):** managers can add, edit (name / type / bus) and delete employees. It runs through the serverless function `api/employees.ts` (Admin SDK), which first verifies the caller's Firebase ID token and that `users/{uid}.role` is manager/admin, so the Firestore rules stay strict. Deleting an employee also deletes the login account and fixes the bus counters; adding a *main* employee needs room on the bus (main employees start IN). Setup on Vercel: add the env var `FIREBASE_SERVICE_ACCOUNT` (the service-account JSON) and redeploy. The function only exists on Vercel (locally use `npx vercel dev`).
* **Daily reset:** `.github/workflows/daily-reset.yml` runs `scripts/reset-daily.ts` every night at ~00:10 Cairo time: main employees → IN (Going + Returning), waiting → OUT, bus counters recomputed, active direction → Going, shared location stopped. Setup: add the repo secret `FIREBASE_SERVICE_ACCOUNT` (the service-account JSON). Test with `npm run reset-daily -- --dry-run` or from the Actions tab (Run workflow → force).
* `tests/rules` covers the rules that matter most, but it has to be run on a machine with the emulator (`npm run test:rules`) – run it before going live and after every rules change.
