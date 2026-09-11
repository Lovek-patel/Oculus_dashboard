# Oculus

An always-on, non-interactive dashboard for a projector: good morning message
at 6am, your day's events/tasks while you're awake, black screen at 9:30pm.
Runs as a static site — open the GitHub Pages URL full-screen on the kiosk
machine and leave it running.

## 1. Set your location

Open `app.js`, edit the top `CONFIG` block:

```js
latitude: 40.8075,
longitude: -73.9626,
timezone: "America/New_York",
nightStart: { h: 21, m: 30 },
morningStart: { h: 6, m: 0 },
```

## 2. Google Cloud setup (one-time)

1. Go to console.cloud.google.com, create (or reuse) a project.
2. Enable the **Google Calendar API** and **Google Tasks API**.
3. Under "APIs & Services → Credentials", create an **OAuth client ID** of
   type **Desktop app**. Note the Client ID and Client Secret.
4. On the OAuth consent screen, add your own Google account as a test user
   if the app is in "Testing" mode (fine for personal use — no need to publish it).

## 3. Get a refresh token (one-time, run on your own laptop)

```bash
npm install
GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy npm run get-token
```

Open the printed URL, sign in, approve access. The script prints a refresh
token — save it, you'll need it in the next step.

## 4. Add GitHub repo secrets

In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**.
Add three:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

## 5. Push the repo and turn on Pages + Actions

```bash
git init
git add .
git commit -m "oculus"
git branch -M main
git remote add origin https://github.com/<you>/oculus-face.git
git push -u origin main
```

Then in the repo: **Settings → Pages** → Source: "Deploy from a branch" →
Branch: `main`, folder `/ (root)`. Your display will be live at
`https://<you>.github.io/oculus-face/`.

The sync workflow (`.github/workflows/sync.yml`) runs every 15 minutes and
commits an updated `data.json`. You can also trigger it manually from the
repo's **Actions** tab to test it immediately instead of waiting.

## 6. Kiosk machine

On the cheap computer connected to the projector, open a browser to your
Pages URL and go full screen:

- Chrome/Edge: `--kiosk https://<you>.github.io/oculus-face/` as a launch
  flag, or press F11 for plain full screen.
- Set it to open automatically on boot/login if you want zero-touch startup.
- Disable sleep/screen-lock on that machine.

## Notes

- Only today + tomorrow's events are fetched, and tasks with no due date or
  a due date in the past still show up (Google Tasks doesn't really do
  recurring "someday" tasks well — completed tasks drop off the list the
  day after you check them off).
- Weather and sunrise/sunset come from Open-Meteo directly in the browser
  (no key needed) — this doesn't depend on the sync workflow at all.
- If the calendar/tasks data ever looks stale, check the **Actions** tab for
  a failed sync run before anything else.
