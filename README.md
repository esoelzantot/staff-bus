# أتوبيس الموظفين – Staff Bus

React + TypeScript + Vite + Firebase (Auth, Firestore, Security Rules) + jsPDF. The UI is Arabic (RTL); only the IN / OUT labels stay English.

## How it works

* **Everyone signs in with the Employee ID only** (no e-mail, no password, no manager login page).
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

Firebase console: enable **Authentication → Email/Password** (used internally to map IDs to accounts) and create a **Firestore** database in production mode. Put your project id in `.firebaserc`. For the scripts, download a service-account key as `serviceAccountKey.json` (git-ignored).

### Development data

```bash
npm run seed   # dev project only
```

Creates the bus (النزهة – أ ص 8381 – capacity 13), employees `EMP1001`–`EMP1005` (3 main, 2 waiting) and the manager `MGR001`.

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
npm run create-user -- manager  MGR001
npm run create-user -- admin    ADM001
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_FIREBASE_*` (6 values) | Web-app config from the Firebase console |
| `VITE_COMPANY_NAME` | Optional, printed on the PDF |
| `VITE_EMPLOYEE_EMAIL_DOMAIN`, `VITE_AUTH_SUFFIX` | Optional; used to derive the internal Auth account from an ID. **Must be identical for the app and the scripts** |
| `GOOGLE_APPLICATION_CREDENTIALS` | Scripts only – path to the service-account key |

## Run / build / deploy

```bash
npm run dev       # http://localhost:5173
npm run build
npm run preview
npm run deploy    # build + rules + Hosting
```

## Security model (read this)

* Login is ID-only, as requested. The ID is therefore the **only** credential: anyone who knows or guesses an ID can open that account. The password Firebase sees is derived from the ID and ships in the browser bundle, so it adds no secrecy.
* Use IDs that are not easy to guess, and treat **manager / admin IDs as secrets** – whoever has one gets the full dashboard. Consider enabling **Firebase App Check** and, later, adding a PIN for managers.
* The Firestore rules still enforce everything server-side: an employee can **read** everyone on their own bus, but can **write** only their own `goingStatus` / `returningStatus`; capacity (13) is enforced atomically by transaction + rules; arrival can be recorded only once until a manager resets it; only admins create/delete employees and buses.

## Structure

```
src/firebase   config · auth · firestore        src/pages     Home · EmployeeDashboard · ManagerDashboard
src/services   auth · employee · busTrip        src/hooks     useLiveData · useBusData · useStatusUpdater
src/components Header · EmployeeCard · EmployeeList · PassengerList · Summary · ArrivalSection · EmployeeIdDialog
scripts        seed.ts (dev) · create-user.ts (production)
```

## Notes

* The PDF export is still in English (Arabic text such as the route is embedded as an image so it renders correctly).
* Each employee has two tallies, `goingInCount` and `returningInCount`, shown next to "الذهاب" / "العودة". A tally goes up by 1 every time the employee switches from OUT to IN (switching back and forth adds up), and the rules enforce that exact increment.
* **وصلنا (arrival):** any employee on the bus can press it (Employee dashboard footer). It exists for the **going direction only**: the button shows while the bus' active direction is *going* and is stored on today's going-trip `busTrips` document (server time + who pressed). It appears live for everyone on the bus and on the manager's arrival section. The first press wins; the employee who pressed it can undo it with the X on the card (and a manager/admin can always reset it). A new day opens a new trip, so the button comes back. **Re-deploy the rules** (`npm run rules:deploy`) after pulling this change.
* **تتبع الأتوبيس (live tracking):** the first employee on the bus taps "ابدأ مشاركة موقع الأتوبيس"; her phone's GPS position is written to `busLocations/{busId}` (≈ every 2 s while the bus moves, a heartbeat every 15 s when parked) and every colleague on the bus sees it on a live map (Leaflet + OpenStreetMap) whose marker glides smoothly and which follows the bus (drag the map to look around, 🎯 to resume) and can go full screen with a button that opens Google Maps directions to the bus. Only one sharer at a time; a colleague can take over when the sharer stops or her updates are older than 90 s. Sharing stops automatically when the going trip's arrival is recorded, on logout, or via "إيقاف المشاركة". **Limitation:** this is a web app, so the GPS only reports while the sharer's page is open in the foreground (browsers pause it when the screen locks or the tab is in the background). Re-deploy the rules after pulling this change.
* **Daily reset:** `.github/workflows/daily-reset.yml` runs `scripts/reset-daily.ts` every night at ~00:10 Cairo time: main employees → IN (Going + Returning), waiting → OUT, bus counters recomputed, active direction → Going, shared location stopped. Setup: add the repo secret `FIREBASE_SERVICE_ACCOUNT` (the service-account JSON). Test with `npm run reset-daily -- --dry-run` or from the Actions tab (Run workflow → force).
* The Firestore rules were not run against the emulator here – test them before going live.
