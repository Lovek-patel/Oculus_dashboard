// Pulls today + tomorrow's Google Calendar events and Google Tasks, writes
// them to data.json at the repo root. Run by .github/workflows/sync.yml on
// a schedule, or locally with the same env vars for testing.

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  CALENDAR_ID = "primary",
  // Comma-separated if you keep tasks in more than one list, e.g.
  // "@default,MDk1MjM0NTY3ODkw" — find list IDs with tasklists.list.
  TASKLIST_IDS = "@default",
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN env vars.");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

const calendar = google.calendar({ version: "v3", auth: oauth2Client });
const tasksApi = google.tasks({ version: "v1", auth: oauth2Client });

function startOfDay(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

async function fetchEvents() {
  const timeMin = startOfDay(-1).toISOString(); // include yesterday, for overnight "sleep" events
  const timeMax = startOfDay(2).toISOString();  // through tomorrow

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  return (res.data.items || [])
    .filter(e => e.start && (e.start.dateTime || e.start.date))
    .map(e => ({
      title: e.summary || "(untitled)",
      start: e.start.dateTime || `${e.start.date}T00:00:00`,
      end: e.end.dateTime || `${e.end.date}T23:59:59`,
      allDay: !e.start.dateTime,
      location: e.location || null,
    }));
}

async function fetchTasksFromList(tasklistId) {
  const res = await tasksApi.tasks.list({
    tasklist: tasklistId,
    showCompleted: true,
    showHidden: false,
    maxResults: 100,
  });

  const items = res.data.items || [];
  const today = new Date().toDateString();

  return items
    .filter(t => {
      if (t.status !== "completed") return true;
      if (!t.completed) return false;
      return new Date(t.completed).toDateString() === today; // keep today's completions visible briefly
    })
    .map(t => ({
      title: t.title || "(untitled)",
      done: t.status === "completed",
      due: t.due || null,
    }));
}

async function fetchTasks() {
  const raw = TASKLIST_IDS && TASKLIST_IDS.trim() ? TASKLIST_IDS : "@default";
  const listIds = raw.split(",").map(s => s.trim()).filter(Boolean);
  const results = await Promise.all(listIds.map(fetchTasksFromList));
  return results.flat();
}

async function main() {
  const [events, tasks] = await Promise.all([fetchEvents(), fetchTasks()]);

  const data = { generated_at: new Date().toISOString(), events, tasks };

  const outPath = path.join(__dirname, "..", "data.json");
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`Wrote ${events.length} events and ${tasks.length} tasks to data.json`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
