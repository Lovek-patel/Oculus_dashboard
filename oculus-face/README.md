# Oculus

A forever-on, non-interactive dashboard. Blank while you're asleep, a
"good morning" screen when you wake up, a full schedule/task view the rest
of the time — with a quieter, animated "focus" layout that takes over
automatically whenever a calendar event is happening, so tasks (especially
starred ones) stay in front of you while you're working.

Pure static site — GitHub Pages hosts it, a GitHub Action keeps the data
fresh, and your Chromebook just opens the URL.

## What changed in this redesign

- **Layout uses `rem`/`clamp()` everywhere** instead of independent `vw`
  values per element, so spacing stays proportional and doesn't drift at
  different window sizes — this was the "spacing is off" bug.
- **Sleep now follows a real weekly schedule**, not one fixed time. Edit
  `CONFIG.schedule` in `app.js` — every day can be different. You can also
  put an event titled containing the word "sleep" on your calendar for a
  specific night (e.g. "Sleep 11:30pm–7am") and it overrides that night only.
- **A "focus" mode** kicks in automatically whenever a calendar event is
  currently happening: a slow, subtle animated glow in the background, and
  the layout shifts weight toward a "Due now" task panel instead of the
  full schedule.
- **Starred tasks.** Google's Tasks API doesn't actually expose the star
  you set in the Tasks app — it's UI-only, not in the data Google returns.
  The workaround: type `⭐` (or `★`) at the start of a task's title in
  Google Tasks. Oculus treats that as starred, strips it from the display,
  and always keeps starred tasks at the top — in focus mode they're what
  the "Due now" panel leads with. If you'd rather use a separate task list
  as your "priority" list instead of the emoji, see the `TASKLIST_IDS`
  note below — either works, pick whichever fits how you actually use Tasks.

## 1. Set your location and schedule

Open `app.js`, edit the top `CONFIG` block — coordinates, timezone, and
the weekly `schedule` (wake/sleep per day, 24h `"HH:MM"`).

## 2. Google Cloud setup (one-time)

1. console.cloud.google.com → create or reuse a project.
2. Enable the **Google Calendar API** and **Google Tasks API**.
3. Credentials → **OAuth client ID** → type **Desktop app**. Note the
   Client ID and Client Secret.
4. On the OAuth consent screen, add your Google account as a test user if
   the app is in "Testing" mode — fine for personal use, no need to publish.

## 3. Get a refresh token (one-time, on your own machine)

```bash
npm install
GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy npm run get-token
```

Open the printed URL, sign in, approve access. It prints a refresh token —
save it for the next step.

## 4. Add GitHub repo secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `TASKLIST_IDS` — optional. Defaults to your default list (`@default`).
  If you want tasks pulled from more than one list (e.g. a separate
  "Priority" list), find list IDs with the Tasks API's `tasklists.list`
  and set this to a comma-separated string of them.

## 5. Push to your repo

```bash
cd oculus-face
git init
git add .
git commit -m "oculus redesign"
git branch -M main
git remote add origin https://github.com/Lovek-patel/Oculus_dashboard.git
git push -u origin main --force
```

(`--force` only needed if the repo already has different content in it —
drop it if this is the first push.)

## 6. Turn on Pages + Actions

**Settings → Pages** → Source: "Deploy from a branch" → Branch `main`,
folder `/ (root)`.

One real constraint worth knowing before you decide public vs. private:
**GitHub Free can't serve Pages from a private repo at all.** You'd need
GitHub Pro at minimum — and even then, the *published site itself* is
still openly viewable by anyone with the link; only an Enterprise Cloud
organization can make the actual Pages output private. Making the repo
private only hides your source files and commit history, not the live
dashboard URL.

Given that, the practical options are:
1. **Public repo, on the free plan.** Your event titles and task names
   would be visible to anyone who found the URL (it won't be indexed or
   linked anywhere, but it isn't secret). This is what the setup above
   assumes.
2. **Private repo + GitHub Pro**, if you want the source hidden — the
   live site is still an unauthenticated public URL either way.

If neither sits right, the cleanest genuinely-private option is a
different static host with access control (e.g. Cloudflare Pages with
Cloudflare Access, or Vercel with password protection) — same repo,
same files, just a different place to point the "Pages" step at.

Your display will be live at `https://lovek-patel.github.io/Oculus_dashboard/`
once Pages is on for whichever repo you choose.

The sync workflow runs every 15 minutes and commits an updated
`data.json`. Trigger it manually from the **Actions** tab to test
immediately instead of waiting.

## 7. Chromebook

Open the Pages URL, press full screen (F11 or the fullscreen button), and
leave the tab open. Turn off sleep/screen-lock and "put display to sleep"
in Chromebook settings for whatever time range you'll actually be near it,
since Oculus is handling the "looks asleep" behavior at the browser level,
not the OS level — the OS shouldn't also blank the screen independently.

## Notes

- Weather and sunrise/sunset come straight from the browser (Open-Meteo,
  no key) — this part works even before Calendar/Tasks are wired up.
- Only today, yesterday, and tomorrow's events are fetched (yesterday's
  only to catch an overnight "sleep" event that started before midnight).
- If data ever looks stale, check the **Actions** tab for a failed sync
  run before anything else.
