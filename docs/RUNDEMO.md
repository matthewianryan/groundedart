# Run Demo (5-minute prototype walkthrough)

Goal: show as many integrated flows as possible in ~5 minutes:
**Map → node selection → puppet geofence check-in → capture create + upload → auto-verify → notification + rank update → public viewing → reporting → tips UI.**

---

## Terminal (prep + run)

From the repo root:

```bash
cd /Users/mathew/Documents/GitHub/groundedart
```

Ensure tips UI is enabled:

```bash
rg "^VITE_TIPS_ENABLED" .env
```

Bring everything up (DB + migrations + seed + API + web):

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

Confirm services are healthy:

```bash
docker compose -f infra/docker-compose.yml ps
```

Optional “confidence pings”:

```bash
curl -fsS http://127.0.0.1:8000/health && echo OK
```

Optional logs during recording:

```bash
docker compose -f infra/docker-compose.yml logs -f api web
```

Open the app:
- Web: `http://localhost:5173/`
- API: `http://localhost:8000/health`

---

## UI Demo Script (5 minutes)

### 0) Enter demo mode (0:00–0:45)
1. Open `http://localhost:5173/?demo=1`
2. Left panel → expand **Demo controls**
3. Confirm these toggles are enabled:
   - **Use puppet location** (no GPS prompts)
   - **Click map to move puppet**
   - **After upload, verify capture as admin**
4. If **Admin token** is empty, paste `ADMIN_API_TOKEN` from the repo root `.env`.

### 1) Map → node selection → directions (0:45–1:30)
1. Click any marker on the map (or pick one from “Nodes in view”).
2. In the selected node card, click **Directions** (shows a route summary + steps).

### 2) Proof-of-presence check-in (1:30–2:00)
1. Click **Teleport & check in**
2. Call out:
   - Check-in status becomes **Checked in**
   - **Accuracy / Distance / Radius** values
   - Token preview line (shows the one-time check-in token is present)

### 3) Capture create + upload (2:00–3:00)
1. Click **Take photo** (enters the capture route)
2. In Capture flow:
   1. Click **Take photo** and choose any local image file
   2. Fill **Attribution**:
      - Artist name
      - Artwork title
      - Attribution source
   3. Fill **Rights & consent**:
      - Rights basis (e.g. “I took the photo”)
      - Check “I attest…”
   4. Check **Publish automatically once verified**
   5. Click **Submit**
3. Wait for **Upload complete**, then click **Done** (back to map).

### 4) Auto-verify → notifications → rank (3:00–4:00)
1. On the map route, call out the toast sequence:
   - “Upload complete”
   - “Capture verified” (demo auto-verify)
2. In the left panel, open **Notifications**:
   - Click an unread notification to mark it read
3. Click **Refresh rank**:
   - Call out the updated rank + “Next unlock” line

### 5) Public viewing + reporting + tips UI (4:00–5:00)
1. Re-select the same node → click **Open detail**
2. On Node detail:
   - Under **Verified captures**, confirm the new capture appears
   - Under **Tip the artist**, click the wallet button to show the wallet-connect UX
   - Click **Report** on a capture → choose a reason → **Submit** (shows “Reported”)
