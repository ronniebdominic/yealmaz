# Hikvision attendance bridge

Connects the **DS-K1T321MFWX** face terminal to the Ye-Almaz attendance API.

```
DS-K1T321 (192.168.0.198)  --HTTP push-->  bridge on Server02  --HTTPS-->  Railway
                                            port 9000                      /api/attendance/events
```

The terminal cannot post straight to Railway: it sends Hikvision's own
payload shape and cannot attach the `x-attendance-device-secret` header the
API requires. The bridge translates and authenticates. Running it on
Server02 also keeps the API secret off a wall-mounted device, and queues
punches locally so an internet outage or a Railway redeploy never loses
someone's attendance.

---

## Before anything else: employee numbers

**Enrol each person in the terminal with their Employee No. set to their
Ye-Almaz code — `EMP001` … `EMP034`.**

The terminal sends `employeeNo` with every event. If it already matches,
the bridge forwards it straight through with no mapping table to maintain.
If you enrol with arbitrary numbers, every punch comes back `404 Unknown
employee code` and you will be maintaining a translation list forever.

Codes are visible in **Admin → Users → PIN**, or in HR → Employees.

---

## 1. Give Server02 a fixed address

The terminal posts to an IP, so it must not change.

```powershell
ipconfig    # note Server02's IPv4 address on the lab LAN
```

Reserve that address for Server02's MAC in the router's DHCP settings (or
set a static IP). If it changes later, the terminal silently stops
delivering and attendance goes quiet — with no error anywhere.

## 2. Run the bridge

Copy this folder to Server02, then:

```powershell
$env:ATTENDANCE_DEVICE_SECRET = "<same value as on Railway>"
$env:API_BASE = "https://yealmaz-production.up.railway.app"
node hikvision-bridge.js
```

It refuses to start without `ATTENDANCE_DEVICE_SECRET`, because every punch
would otherwise be rejected with 401 and the failure would only show up
later as missing attendance.

Check it is up:

```powershell
curl http://localhost:9000/health
```

### Auto-start on boot

Same pattern as the Caddy and ngrok tasks already on this machine:

```powershell
$action  = New-ScheduledTaskAction -Execute "node.exe" `
  -Argument "C:\yealmaz-bridge\hikvision-bridge.js" -WorkingDirectory "C:\yealmaz-bridge"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "YealmazAttendanceBridge" -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings
```

Set the environment variables machine-wide first (`[Environment]::SetEnvironmentVariable(...,'Machine')`),
since a SYSTEM task does not inherit your user session's variables.

Allow the port through the firewall so the terminal can reach it:

```powershell
New-NetFirewallRule -DisplayName "Yealmaz Attendance Bridge" -Direction Inbound `
  -LocalPort 9000 -Protocol TCP -Action Allow
```

## 3. Point the terminal at the bridge

On the **device's own web interface** (not iVMS-4200) at
`http://192.168.0.198`:

**Configuration → Network → Advanced Settings → HTTP Listening**

| Field | Value |
|---|---|
| Destination IP / Domain | Server02's LAN IP from step 1 |
| Port | `9000` |
| URL | `/` |
| Protocol | HTTP |

Exact menu wording varies by firmware — it may appear as *Alarm Server*,
*Event Notification* or *HTTP Host*. If the menu is missing, set it over
ISAPI instead:

```bash
curl --digest -u admin:PASSWORD -X PUT \
  "http://192.168.0.198/ISAPI/Event/notification/httpHosts" \
  -H "Content-Type: application/xml" --data-binary @httpHosts.xml
```

## 4. Verify

Have someone badge in, then:

```powershell
type data\raw-events.log      # exactly what the terminal sent
curl http://localhost:9000/health
```

The console prints one line per punch:

```
queued EMP033 (Africa Endris Tona) CLOCK_IN
sent EMP033 CLOCK_IN @ 2026-08-20T06:14:03.000Z
```

Then confirm it landed in **HR → Attendance → Period Overview** — the
punch should show against that person with source `BIOMETRIC`.

---

## How it behaves

- **Everything is logged raw** to `data/raw-events.log` before parsing.
  Hikvision's payload shape varies by firmware; if a field is in an
  unexpected place, that file is what makes it fixable without guessing.
- **Punches are queued to disk before any network call** (`data/queue.jsonl`),
  so an outage or restart cannot lose one. The queue drains automatically
  with exponential backoff.
- **`409` is treated as success.** It means the API already recorded that
  punch — retrying forever would wedge the queue behind an event that is
  already saved.
- **`404` is dropped, loudly.** It means no employee has that code, which
  is almost always an enrolment mismatch (see the top of this file).
- **Non-attendance events are ignored** — door sensors, tamper alarms,
  failed matches and heartbeats all arrive on the same channel. Treating
  them as punches would invent attendance nobody recorded.
- **Clock in vs out**: the terminal's own attendance status is used when it
  sends one. Otherwise the bridge alternates from that person's last punch
  that day. A wrong guess is visible rather than silent — the API flags an
  unmatched clock-out for HR to correct instead of rejecting it.
- **The terminal always gets `200`**, immediately. Its retry behaviour is
  limited, and an error response could make it discard the event outright.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Nothing in `raw-events.log` | Terminal isn't reaching the bridge — check the IP/port in HTTP Listening, and the firewall rule |
| `DROPPING unacceptable punch (404)` | The terminal's Employee No. doesn't match an Ye-Almaz code |
| `401` in the log | `ATTENDANCE_DEVICE_SECRET` doesn't match Railway's value |
| Punches queue but never send | No internet from Server02, or Railway is down — they will drain by themselves once it returns |
| Everyone shows as CLOCK_IN | Terminal isn't sending attendance status and someone missed a punch; HR can correct the day |
