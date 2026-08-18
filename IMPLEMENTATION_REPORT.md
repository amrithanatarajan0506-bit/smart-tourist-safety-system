# Smart Tourist Safety System — Implementation Report

This document covers the work done on top of the existing project in this pass:
what was already there, what was added, how it all fits together, and how to
run and test it. It extends (not replaces) the project's original README /
GETTING_STARTED docs.

---

## 1. Final Project Architecture

**Frontend (mobile):** React Native (Expo-style CLI project) — screens for
Login, Register, Dashboard, Digital ID, Emergency Alert, Emergency Contacts.
GPS access via the existing `locationService`. New: a trip/offline-sync
orchestration layer (`tripTrackingService`, `offlineLocationQueue`).

**Frontend (admin/authority dashboard):** React 19 + TypeScript + Material UI.
Existing Dashboard (tourist list, alert stats) extended with three new pages:
Live Map (Leaflet), Zone Management, Incident Management.

**Backend:** Node.js + Express + Socket.IO, MongoDB via Mongoose. JWT auth.

**Database:** MongoDB. Geospatial data is stored as GeoJSON (`Point`,
`LineString`, `Polygon`) with a 2dsphere index on `LocationPoint.location`.
Zone shapes are evaluated with custom geometry math (`utils/geoUtils.js`) so
both simple circles (center + radius, the fast authority workflow) and
arbitrary polygons are supported without extra infrastructure.

**Real-time layer:** Socket.IO (existing `socketHandler.js`, extended).

**Geo-fencing:** New `services/geofenceEngine.js`, evaluated on every
incoming location point.

**Offline layer:** Mobile `offlineLocationQueue.ts` (AsyncStorage-backed) +
backend `/api/location/sync` batch endpoint with idempotent de-duplication.

**AI risk engine:** New `services/riskEngine.js` — a hybrid rule-based /
statistical anomaly engine (route deviation, unusual stops, abnormal
speed/direction, repeated boundary approaches). Explicitly **not** a trained
ML model — see the "DEMO RULES vs trained model" note in section 8.

**Tamper-evident records:** New `services/ledgerService.js` — a SHA-256
hash-chain over critical records (trips, SOS, geofence violations, incident
status changes). Explicitly named and documented as a **prototype**, not a
real blockchain network — see section 9.

**Authority dashboard:** Existing `Dashboard.tsx` (tourist list + alert
stats) plus three new pages: `LiveMapPage.tsx`, `ZonesPage.tsx`,
`IncidentsPage.tsx`.

---

## 2. Feature Status Table

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | Tourist registration & authentication | **IMPLEMENTED** (pre-existing, bug-fixed) | JWT payload key mismatch fixed (`middleware/auth.js`, `socketHandler.js`) |
| 2 | Digital Tourist ID | **IMPLEMENTED** (pre-existing) | Unchanged; now also linked to Trips/Incidents via `tourist` refs |
| 3 | Trip start/stop | **IMPLEMENTED** (new) | `models/Trip.js`, `routes/trip.js` |
| 4 | Live location tracking end-to-end | **IMPLEMENTED** (new) | `routes/location.js` `/live`, mobile `tripTrackingService.ts` |
| 5 | Live vs last-known location | **IMPLEMENTED** (new) | `utils/locationStatus.js`, configurable thresholds |
| 6 | Smart geo-fencing | **IMPLEMENTED** (new) | `services/geofenceEngine.js`, `utils/geoUtils.js` |
| 7 | Authority zone management | **IMPLEMENTED** (new) | `routes/zone.js`, dashboard `ZonesPage.tsx` |
| 8 | Offline location storage & sync | **IMPLEMENTED** (new) | Mobile `offlineLocationQueue.ts`, backend `/api/location/sync` |
| 9 | SOS / emergency response | **IMPLEMENTED** (pre-existing SOS preserved + extended) | Old `/api/emergency/alert` kept; new unified `/api/incident/sos` added |
| 10 | Authority dashboard | **IMPLEMENTED** (existing dashboard extended) | Live Map, Zones, Incidents pages added |
| 11 | AI risk detection | **IMPLEMENTED as DEMO RULES** (new) | `services/riskEngine.js` — hybrid rule-based/statistical, not a trained model |
| 12 | Battery safety monitoring | **IMPLEMENTED** (new, architecture-level) | Backend dedupe/alerting complete; mobile battery % collection needs a native library (see section 10) |
| 13 | Tamper-evident ledger | **IMPLEMENTED as PROTOTYPE** (new) | `services/ledgerService.js` — SHA-256 hash-chain, explicitly not a blockchain |
| 14 | Unified alert/event architecture | **IMPLEMENTED** (new) | `models/Incident.js`, `services/incidentService.js` |
| 15 | Security & validation | **IMPLEMENTED** (pre-existing + hardened) | `express-validator` on new routes, ownership checks, role checks |
| 16 | End-to-end integration | **IMPLEMENTED, DB-untested in this sandbox** | See section 11 (Testing Guide) — code paths reviewed and boot-tested, but not run against a live MongoDB in this environment (no DB/network access here) |

---

## 3. File Change Report

### Created — Backend
- `backend/models/Trip.js`
- `backend/models/LocationPoint.js`
- `backend/models/Zone.js`
- `backend/models/Incident.js`
- `backend/models/LedgerRecord.js`
- `backend/services/geofenceEngine.js`
- `backend/services/riskEngine.js`
- `backend/services/ledgerService.js`
- `backend/services/incidentService.js`
- `backend/routes/trip.js`
- `backend/routes/location.js`
- `backend/routes/zone.js`
- `backend/routes/incident.js`
- `backend/routes/dashboard.js`
- `backend/routes/ledger.js`
- `backend/utils/geoUtils.js`
- `backend/utils/locationStatus.js`

### Modified — Backend
- `backend/server.js` — imports `User`/`Alert` at the top (fixes a
  pre-existing crash-on-request bug in two legacy routes), wires in all six
  new routers, exposes `socketHandler` via `app.set('socketHandler', ...)`
  so route handlers can broadcast real-time events.
- `backend/middleware/auth.js` — `auth`/`optionalAuth` now accept both
  `decoded.id` and `decoded.userId` JWT payload shapes (fixes a pre-existing
  bug where `/api/location/update` and `/api/emergency/alert` in the
  original `server.js` silently failed to resolve the logged-in user).
- `backend/socket/socketHandler.js` — same JWT fix applied to the socket
  `authenticate` handler; it now looks the user up in the DB (fixes
  `digitalId`/role being `undefined`); added room joins (`user:{id}`,
  `authorities`) and new broadcast helpers: `broadcastLiveLocation`,
  `broadcastGeofenceStatus`, `broadcastIncident`, `broadcastTripEvent`,
  `broadcastSyncStatus`.
- `backend/.env.example` — documented all new, non-hard-coded config values.

### Created — Admin Dashboard (`frontend/admin-dashboard/src`)
- `components/LiveMapPage.tsx` — Leaflet live map (tourist markers + zone
  overlays) and active-tourist status table.
- `components/ZonesPage.tsx` — zone CRUD (create/activate/deactivate/delete).
- `components/IncidentsPage.tsx` — incident feed with filters,
  acknowledge/respond/resolve actions, and a ledger-verification panel.

### Modified — Admin Dashboard
- `src/App.tsx` — new protected routes: `/map`, `/zones`, `/incidents`.
- `src/components/Dashboard.tsx` — nav buttons to the three new pages.
- `src/services/api.ts` — added `zoneService`, `incidentService`,
  `dashboardService`, `ledgerService` and their TypeScript interfaces.
- `package.json` — added `leaflet`, `react-leaflet`, `@types/leaflet`.

### Created — Mobile (`mobile/TouristSafetyApp/src`)
- `services/offlineLocationQueue.ts` — AsyncStorage-backed offline queue.
- `services/tripTrackingService.ts` — orchestrates trip start/stop, live
  send, offline fallback, and periodic background sync.

### Modified — Mobile
- `services/api.ts` — added `tripAPI`, `liveLocationAPI`, `incidentAPI`,
  `zoneAPI`.
- `services/socketService.ts` — **bug fix**: was hard-coding a fake
  `'tourist-demo-token'` instead of using the logged-in user's real JWT;
  now reads the stored token from `AsyncStorage`.
- `screens/DashboardScreen.tsx` — "Start/Stop Tracking" button now drives a
  real Trip lifecycle via `tripTrackingService` (start/stop trip, restore
  an in-progress trip on app relaunch) instead of a raw, trip-less GPS watch.
- `screens/EmergencyAlertScreen.tsx` — SOS flow now also calls the new
  unified `/api/incident/sos` endpoint (in addition to the existing
  Socket.IO emergency alert and the legacy `/api/emergency/alert` REST
  call, both preserved unchanged).
- `config/index.ts` — added `TRACKING_CONFIG` (update interval, distance
  filter, offline-retry interval — all configurable, none hard-coded).

### Deleted
- None. All existing functionality was preserved and extended.

---

## 4. Database Design

```
User (existing)
 ├─ digitalId, name, email, password, phone, role, isActive, emergencyContact
 └─ lastLocation { Point }                       [existing field, now kept in sync]

Trip (new)
 ├─ tripId (unique), tourist -> User, status [ACTIVE|COMPLETED|CANCELLED]
 ├─ startedAt, endedAt, plannedRoute { LineString }, destination, notes
 ├─ lastLocation { Point, timestamp, accuracy, speed, heading, battery, source }
 ├─ currentZoneStatus [SAFE|WARNING|VIOLATION|UNKNOWN]
 └─ pointCount

LocationPoint (new)
 ├─ tourist -> User, trip -> Trip
 ├─ location { Point, 2dsphere index }
 ├─ accuracy, speed, heading, battery
 ├─ deviceTimestamp, receivedAt, source [LIVE|OFFLINE_SYNC]
 ├─ clientPointId (unique per trip, sparse — offline-sync idempotency)
 └─ zoneStatus

Zone (new)
 ├─ name, description, zoneType [SAFE|RESTRICTED|RISK]
 ├─ geometry { type: Circle|Polygon, center+radiusMeters | polygon }
 ├─ warningDistanceMeters (per-zone, configurable, default 250m)
 ├─ status [ACTIVE|INACTIVE]
 └─ createdBy -> User

Incident (new) — unified alert/event/incident model
 ├─ eventType [GEOFENCE_WARNING|GEOFENCE_VIOLATION|SOS|AI_RISK|LOW_BATTERY|OFFLINE|LOCATION_SYNCED]
 ├─ severity [LOW|MEDIUM|HIGH|CRITICAL], status [NEW|ACKNOWLEDGED|RESPONDING|RESOLVED]
 ├─ tourist -> User, trip -> Trip, zone -> Zone, location { Point }
 ├─ message, details (Mixed), dedupeKey (open-condition de-duplication)
 ├─ history [ { status, by, note, at } ]   — audit trail
 └─ ledgerHash (set for SOS / GEOFENCE_VIOLATION events)

LedgerRecord (new) — TAMPER-EVIDENT LEDGER PROTOTYPE
 ├─ sequence (unique, increasing), recordType, refId
 ├─ payload (Mixed, canonicalised snapshot)
 └─ previousHash, hash (sha256(previousHash + payload))

Alert (existing, preserved) — legacy emergency alert model, still written to
  by the original /api/emergency/alert route for backward compatibility.
```

Relationships: `Trip.tourist -> User`, `LocationPoint.{tourist,trip} -> User,Trip`,
`Incident.{tourist,trip,zone} -> User,Trip,Zone`, `LedgerRecord.refId` points at
whichever document (`Trip`/`Incident`) the record certifies.

---

## 5. API Documentation

All new endpoints require `Authorization: Bearer <token>` unless noted.
Base path: `/api`.

### Trip (`/api/trip`)
| Method | URL | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/trip/start` | tourist | `{ destination?, notes?, plannedRoute? }` | `{ trip }` — 409 if already ACTIVE |
| POST | `/trip/:tripId/stop` | tourist (owner) | — | `{ trip }` |
| GET | `/trip/active` | tourist | — | `{ trip \| null }` |
| GET | `/trip` | tourist | — | `{ trips[] }` (own history) |
| GET | `/trip/:tripId` | owner or authority | — | `{ trip }` |

### Location (`/api/location`)
| Method | URL | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/location/live` | tourist | `{ tripId, latitude, longitude, accuracy?, speed?, heading?, battery?, timestamp? }` | `{ zoneStatus, pointId }` |
| POST | `/location/sync` | tourist | `{ points: [ {tripId, latitude, longitude, timestamp, clientPointId, ...} ] }` | `{ synced, duplicates, rejected, errors[] }` |
| GET | `/location/status/:touristId` | any authenticated | — | `{ state: LIVE\|LAST_KNOWN\|OFFLINE\|UNKNOWN, lastLocation, zoneStatus }` |
| GET | `/location/trip/:tripId/history` | owner or authority | — | `{ points[] }` |

### Zone (`/api/zone`)
| Method | URL | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/zone` | authority | `{ name, zoneType, geometry, warningDistanceMeters? }` | `{ zone }` |
| GET | `/zone` | any authenticated | query: `status?, zoneType?` | `{ zones[] }` |
| GET | `/zone/:id` | any authenticated | — | `{ zone }` |
| PUT | `/zone/:id` | authority | partial `Zone` | `{ zone }` |
| PATCH | `/zone/:id/status` | authority | `{ status: ACTIVE\|INACTIVE }` | `{ zone }` |
| DELETE | `/zone/:id` | authority | — | `{ message }` |

### Incident (`/api/incident`)
| Method | URL | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/incident/sos` | tourist | `{ latitude?, longitude?, accuracy?, message? }` | `{ incident }` |
| GET | `/incident` | authority | query: `status?, eventType?, severity?, tourist?, limit?` | `{ incidents[] }` |
| GET | `/incident/mine` | tourist | — | `{ incidents[] }` |
| GET | `/incident/:id` | any authenticated | — | `{ incident }` |
| POST | `/incident/:id/acknowledge` | authority | `{ note? }` | `{ incident }` |
| POST | `/incident/:id/respond` | authority | `{ note? }` | `{ incident }` |
| POST | `/incident/:id/resolve` | authority | `{ note? }` | `{ incident }` |

### Dashboard (`/api/dashboard`)
| Method | URL | Auth | Response |
|---|---|---|---|
| GET | `/dashboard/overview` | authority | `{ overview: { activeTrips, totalTourists, openIncidents, incidentsByType } }` |
| GET | `/dashboard/tourists` | authority | `{ tourists: [ { tripId, tourist, zoneStatus, locationState, lastLocation, ... } ] }` |

### Ledger (`/api/ledger`)
| Method | URL | Auth | Response |
|---|---|---|---|
| GET | `/ledger/verify?limit=` | authority | `{ ledgerType: "TAMPER_EVIDENT_LEDGER_PROTOTYPE", valid, recordsChecked, breaks[] }` |

### Pre-existing (unchanged)
`/api/auth/*` (register, login), `/api/verification/*`, legacy
`/api/location/update` and `/api/emergency/alert` in `server.js`.

---

## 6. Real-Time (Socket.IO) Events

| Event | Direction | Emitted by | Purpose |
|---|---|---|---|
| `authenticate` | client → server | mobile/dashboard on connect | `{ token, userType }` — now DB-verified |
| `authenticated` / `auth_error` | server → client | socketHandler | auth result |
| `live_location` | server → admins | `routes/location.js` via `broadcastLiveLocation` | Feature 4/5 real-time position + zoneStatus |
| `geofence_status` | server → admins + the tourist | `routes/location.js` via `broadcastGeofenceStatus` | Feature 6 SAFE/WARNING/VIOLATION transitions |
| `incident_event` | server → admins | any incident create/update via `broadcastIncident` | Feature 9/10/14 — SOS, geofence, AI risk, battery, sync |
| `trip_event` | server → admins | `routes/trip.js` via `broadcastTripEvent` | Feature 3 trip started/stopped |
| `sync_status` | server → admins + the tourist | `routes/location.js` via `broadcastSyncStatus` | Feature 8 offline sync completion |
| `user_stats` | server → admins | existing | connected-user counts (pre-existing) |

---

## 7. Testing Guide

> No live MongoDB was available in the sandbox this was built in (network
> egress is restricted to package registries), so the steps below are the
> exact steps to run — they were not executed end-to-end against a real DB
> here. Every file was syntax-checked, and the backend was boot-tested
> (`node server.js` starts cleanly with all routes/sockets registered); the
> admin dashboard was compiled with `npm run build` successfully; the mobile
> TypeScript project was type-checked with zero new errors.

1. **Registration/Login**: `POST /api/auth/register`, then `/api/auth/login`
   — save the returned `token`.
2. **Digital ID**: `GET /api/auth/me` (or the mobile Digital ID screen) shows
   `digitalId`.
3. **Start/stop trip**: `POST /api/trip/start` → note `tripId`; try starting
   a second trip and confirm you get `409`; `POST /api/trip/:tripId/stop`.
4. **Live tracking**: `POST /api/location/live` with a coordinate inside a
   `SAFE` area — expect `zoneStatus: "SAFE"`; watch the dashboard's Live Map
   for the marker and the `live_location` socket event.
5. **Geo-fence warning**: create a `RESTRICTED` zone via `POST /api/zone`
   (Zones page), then send a live point within `warningDistanceMeters` of
   its boundary — expect `zoneStatus: "WARNING"` and an `Incident` of type
   `GEOFENCE_WARNING` on the Incidents page.
6. **Geo-fence violation**: send a point inside the restricted zone —
   expect `VIOLATION`, a `HIGH` severity incident, and a ledger record
   (`GET /api/ledger/verify` should show one more record, still `valid`).
7. **SOS**: `POST /api/incident/sos` — expect a `CRITICAL` incident
   immediately visible on the dashboard; acknowledge/respond/resolve it via
   the Incidents page buttons.
8. **Offline storage**: on the mobile app, disable network, start a trip,
   move around — confirm points appear in the local `offlineLocationQueue`
   (points are never sent, `flushOfflineQueue` fails silently).
9. **Synchronization**: re-enable network — within `offlineSyncRetryMs`
   (default 20s) the queued points POST to `/api/location/sync`; verify a
   `LOCATION_SYNCED` incident appears and the queue is pruned.
10. **AI risk detection**: send several live points in a tight
    ~40m cluster over `RISK_UNUSUAL_STOP_MINUTES` — expect an `AI_RISK`
    incident with `reasons` including "No meaningful movement...".
11. **Low battery**: send a live point with `battery: 10` (below the
    default 15% threshold) — expect a `LOW_BATTERY` incident (not repeated
    on every subsequent low-battery point, per the dedupe key).
12. **Tamper-evident ledger verification**: `GET /api/ledger/verify` —
    `valid: true`. To simulate tampering, manually edit a `LedgerRecord.payload`
    directly in MongoDB and re-run — expect `valid: false` with a `breaks[]`
    entry.

---

## 8. AI Risk Engine — DEMO RULES vs a trained model

`services/riskEngine.js` is a **hybrid rule-based + simple statistical
anomaly** engine over each trip's recent location history: unusual stops,
abnormal speed, sharp direction changes, route deviation (if a planned
route was supplied), and repeated boundary approaches (from
`GEOFENCE_WARNING` incident counts). All thresholds are environment
variables (see `.env.example`), not hard-coded. It does **not** use a
trained machine-learning model and there is no labeled dataset behind it —
the code and this document say so explicitly, and `details.engine` on every
`AI_RISK` incident is stamped `"DEMO_RULES_V1"` so this is traceable in the
data itself. The module is intentionally isolated behind a single
`evaluateTrip(trip)` function so a real trained model (e.g., a separate
Python inference service called over HTTP) can later replace or augment it
without touching `routes/location.js`.

## 9. Tamper-Evident Ledger — Prototype, not a blockchain

`services/ledgerService.js` implements Option B from the requirements: a
**cryptographic hash-chain** stored in MongoDB (`LedgerRecord`), not a
distributed blockchain network. Every record's hash covers its own
canonicalised payload plus the previous record's hash
(`sha256(previousHash + payload)`), so editing any past record's payload —
even directly in the database — breaks the chain from that point forward,
detectable via `GET /api/ledger/verify`. This is referred to everywhere in
code/UI as the **"TAMPER-EVIDENT LEDGER PROTOTYPE"**, per the requirement
not to call a normal database "blockchain."

## 10. Known Limitations / Next Steps

- **Battery percentage on mobile**: the end-to-end architecture (mobile →
  API → `LOW_BATTERY` incident → dashboard) is fully implemented, but no
  native battery-level library (e.g. `react-native-device-info`) is
  installed in this project. `tripTrackingService.setBatteryProvider()` is
  the single integration point — wiring a real library there is a small,
  isolated follow-up, not an architecture change.
- **DB-dependent testing**: this pass could not run against a live MongoDB
  instance in the sandboxed build environment (no network egress to a DB
  host). The backend was boot-tested and every file reviewed carefully, but
  you should run the Testing Guide above against a real MongoDB before a
  demo.
- **Polygon zone drawing UI**: the Zones page currently creates circular
  zones (center + radius) for a fast authority workflow. The backend fully
  supports polygon zones already (`geometry.type: "Polygon"`); adding a
  map-based polygon-drawing tool to `ZonesPage.tsx` is a frontend-only
  follow-up.
- **Planned-route input**: `Trip.plannedRoute` (used for AI route-deviation
  detection) can be set via `POST /api/trip/start`, but no UI currently
  lets a tourist draw/select a planned route — API-only for now.

---

## 11. Running Instructions

```bash
# Backend
cd backend
npm install
cp .env.example .env   # fill in MONGODB_URI and JWT_SECRET
npm start               # or: npm run dev (nodemon)

# Admin dashboard
cd frontend/admin-dashboard
npm install
npm start                # dev server
npm run build             # production build

# Mobile app
cd mobile/TouristSafetyApp
npm install
npm start                 # Metro bundler (Expo/RN CLI - see mobile README)
```

Required environment variables are documented in `backend/.env.example`
(all Feature 5/6/11/12 thresholds are configurable there — none are
hard-coded in application code).

---

## 12. Demo Flow (Presentation)

1. Register two accounts: one `tourist`, one `authority` (or `admin`).
2. As the authority: open the dashboard → **Zones** → create a `RESTRICTED`
   circular zone near a real location, e.g. a forest boundary.
3. As the tourist (mobile app): view the Digital ID, then **Start Trip**.
4. Watch the dashboard **Live Map** update in real time as the tourist
   "moves" (simulate via mock GPS or manual `/api/location/live` calls)
   toward the restricted zone — status flips SAFE → WARNING → VIOLATION,
   with each transition appearing instantly in **Incidents**.
5. Press **SOS** on the mobile app — a `CRITICAL` incident appears
   immediately; the authority **Acknowledge**s → **Respond**s → **Resolve**s
   it live in front of the audience.
6. Turn off the phone's network, keep moving — points queue locally.
   Reconnect — watch the `LOCATION_SYNCED` incident and the trip's path
   history fill in.
7. Show a repeated-stop or erratic-movement pattern to trigger an `AI_RISK`
   incident, and open **Incidents → Verify Tamper-Evident Ledger** to show
   the SOS and violation records are cryptographically intact.
8. **Stop Trip** — show the completed trip and its full incident history
   preserved.
