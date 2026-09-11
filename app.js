// ============================================================
// OCULUS — config
// ============================================================
// ============================================================
// Night sky — built once, then just left to animate via CSS
// ============================================================
function buildStars() {
  const g = document.getElementById("stars");
  if (!g || g.childElementCount) return;
  const NS = "http://www.w3.org/2000/svg";
  const COUNT = 90;

  for (let i = 0; i < COUNT; i++) {
    const star = document.createElementNS(NS, "circle");
    const x = Math.random() * 1600;
    const y = Math.random() * 520;
    const r = 0.6 + Math.random() * 1.6;
    const dur = 3 + Math.random() * 5;
    const delay = Math.random() * 6;
    const minOp = 0.1 + Math.random() * 0.15;
    const maxOp = 0.55 + Math.random() * 0.4;

    star.setAttribute("cx", x.toFixed(1));
    star.setAttribute("cy", y.toFixed(1));
    star.setAttribute("r", r.toFixed(2));
    star.setAttribute("class", "star");
    star.style.animationDuration = `${dur.toFixed(2)}s`;
    star.style.animationDelay = `${delay.toFixed(2)}s`;
    star.style.setProperty("--min-op", minOp.toFixed(2));
    star.style.setProperty("--max-op", maxOp.toFixed(2));
    g.appendChild(star);
  }
}

const CONFIG = {
  name: "Love",
  latitude: 40.8075,
  longitude: -73.9626,
  timezone: "America/New_York",

  // How long the "good morning" screen stays up after your wake time.
  wakeWindowMinutes: 45,

  // Your week. Edit any day independently — it doesn't have to be uniform.
  // "sleep" is when the screen should start going blank; "wake" is when it
  // should come back for the morning greeting. If a calendar event titled
  // with the word "sleep" exists for a given night, it overrides these
  // times for that night only.
  schedule: {
    sun: { wake: "06:00", sleep: "23:00" },
    mon: { wake: "06:00", sleep: "23:00" },
    tue: { wake: "06:00", sleep: "23:00" },
    wed: { wake: "06:00", sleep: "23:00" },
    thu: { wake: "06:00", sleep: "23:00" },
    fri: { wake: "06:00", sleep: "23:00" },
    sat: { wake: "06:00", sleep: "23:00" },
  },

  dataUrl: "data.json",
  dataRefreshMs: 5 * 60 * 1000,
  weatherRefreshMs: 30 * 60 * 1000,
  tickMs: 10 * 1000,
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// ============================================================
// State
// ============================================================
let DATA = { generated_at: null, events: [], tasks: [] };
let SUN = { sunrise: null, sunset: null };
let WEATHER = null;

// ============================================================
// Schedule / sleep-window logic
// ============================================================
function parseHM(str, baseDate) {
  const [h, m] = str.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

function scheduleFor(date) {
  return CONFIG.schedule[DAY_KEYS[date.getDay()]];
}

function findSleepEvent(nightDate) {
  return DATA.events.find(e => {
    if (!/\bsleep\b/i.test(e.title)) return false;
    return new Date(e.start).toDateString() === nightDate.toDateString();
  });
}

// Returns { wakeToday, sleepTonight, wakeTomorrow } as Date objects,
// using calendar "sleep" events to override the configured schedule
// wherever one exists for that specific night.
function getBounds(now) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const schedToday = scheduleFor(today);
  const schedTomorrow = scheduleFor(tomorrow);

  const lastNightEvt = findSleepEvent(yesterday);
  const tonightEvt = findSleepEvent(today);

  const wakeToday = lastNightEvt ? new Date(lastNightEvt.end) : parseHM(schedToday.wake, today);
  const sleepTonight = tonightEvt ? new Date(tonightEvt.start) : parseHM(schedToday.sleep, today);
  const wakeTomorrow = tonightEvt ? new Date(tonightEvt.end) : parseHM(schedTomorrow.wake, tomorrow);

  return { wakeToday, sleepTonight, wakeTomorrow };
}

function currentMode(now) {
  const { wakeToday, sleepTonight, wakeTomorrow } = getBounds(now);

  if (now < wakeToday) return "asleep";
  if (now >= sleepTonight && now < wakeTomorrow) return "asleep";

  const minutesAwake = (now - wakeToday) / 60000;
  if (minutesAwake < CONFIG.wakeWindowMinutes) return "morning";

  return isFocusMode(now) ? "focus" : "open";
}

function isFocusMode(now) {
  return DATA.events.some(e => {
    if (/\bsleep\b/i.test(e.title)) return false;
    const s = new Date(e.start), en = new Date(e.end);
    return s <= now && en > now;
  });
}

function setMode(mode) {
  document.body.setAttribute("data-mode", mode);
}

// ============================================================
// Formatting
// ============================================================
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtClock(d) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtDate(d) {
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

// ============================================================
// Task helpers — Google Tasks' native "star" isn't exposed by the API,
// so sync.js treats a task as starred if its title starts with a star
// glyph (⭐ or ★), typed right in the Tasks app. Stripped for display.
// ============================================================
const STAR_RE = /^\s*[⭐★]\s*/;

function taskView(t) {
  return { ...t, starred: STAR_RE.test(t.title), title: t.title.replace(STAR_RE, "") };
}

function sortTasks(tasks) {
  const now = new Date();
  const key = t => {
    if (t.done) return [3, Infinity];
    const overdue = t.due && new Date(t.due) < now;
    if (t.starred) return [0, t.due ? new Date(t.due).getTime() : -1];
    if (overdue) return [1, new Date(t.due).getTime()];
    if (t.due) return [2, new Date(t.due).getTime()];
    return [2, Infinity];
  };
  return [...tasks].sort((a, b) => {
    const ka = key(a), kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1];
  });
}

// ============================================================
// Rendering
// ============================================================
function renderClocks(now) {
  document.getElementById("clock").textContent = fmtClock(now);
  document.getElementById("date").textContent = fmtDate(now);
  document.getElementById("asleep-clock").textContent = fmtClock(now);
}

function renderMorning(now) {
  document.getElementById("morning-date").textContent = fmtDate(now);
  document.getElementById("morning-greeting").textContent = `Good morning, ${CONFIG.name}.`;

  const todays = DATA.events
    .map(e => ({ ...e, start: new Date(e.start) }))
    .filter(e => e.start.toDateString() === now.toDateString() && !/\bsleep\b/i.test(e.title))
    .sort((a, b) => a.start - b.start);

  document.getElementById("morning-first").textContent = todays.length
    ? `First up: ${todays[0].title} at ${fmtTime(todays[0].start)}`
    : "Nothing on the calendar yet today.";

  document.getElementById("morning-weather").textContent = WEATHER
    ? `${Math.round(WEATHER.temp)}°  ·  ${WEATHER.description}`
    : "—";
}

function renderNowBand(now, events) {
  const current = events.find(e => e.start <= now && e.end > now);
  const upcoming = events.filter(e => e.start > now)[0];

  const tag = document.getElementById("now-tag");
  const title = document.getElementById("now-title");
  const time = document.getElementById("now-time");

  if (current) {
    tag.textContent = "now";
    title.textContent = current.title;
    time.textContent = `until ${fmtTime(current.end)}`;
  } else if (upcoming) {
    tag.textContent = "next";
    title.textContent = upcoming.title;
    time.textContent = fmtTime(upcoming.start);
  } else {
    tag.textContent = "now";
    title.textContent = "Free time";
    time.textContent = "nothing else today";
  }
}

function renderTimeline(now, events) {
  const list = document.getElementById("timeline-list");
  list.innerHTML = "";

  const todays = events.filter(e => e.start.toDateString() === now.toDateString());
  if (todays.length === 0) {
    list.innerHTML = `<li class="empty-note">Nothing on the calendar today.</li>`;
    return;
  }
  for (const e of todays) {
    const li = document.createElement("li");
    const done = e.end <= now, current = e.start <= now && e.end > now;
    li.className = done ? "done" : current ? "current" : "";
    li.innerHTML = `<span class="t-time">${fmtTime(e.start)}</span><span class="t-title">${e.title}</span>`;
    list.appendChild(li);
  }
}

function renderTasks(focus) {
  document.getElementById("tasks-heading").textContent = focus ? "Due now" : "Tasks";
  const list = document.getElementById("task-list");
  list.innerHTML = "";

  let tasks = DATA.tasks.map(taskView);
  if (focus) {
    // "Due now": starred tasks always, plus anything due today or overdue.
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
    tasks = tasks.filter(t => t.starred || (!t.done && t.due && new Date(t.due) <= endOfToday));
  }
  tasks = sortTasks(tasks);

  if (tasks.length === 0) {
    list.innerHTML = `<li class="empty-note">Nothing here right now.</li>`;
    return;
  }

  const now = new Date();
  for (const t of tasks) {
    const li = document.createElement("li");
    const overdue = !t.done && t.due && new Date(t.due) < now;
    li.className = [t.done && "done", t.starred && "starred", overdue && "overdue"].filter(Boolean).join(" ");
    const star = t.starred ? `<span class="t-star">★</span>` : "";
    const due = t.due ? `<span class="t-due">${new Date(t.due).toLocaleDateString([], { month: "short", day: "numeric" })}</span>` : "";
    li.innerHTML = `<span class="t-check"></span><span class="t-title">${star}${t.title}</span>${due}`;
    list.appendChild(li);
  }
}

function renderDayBar(now) {
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const nextMidnight = new Date(midnight); nextMidnight.setDate(nextMidnight.getDate() + 1);
  const pct = ((now - midnight) / (nextMidnight - midnight)) * 100;
  document.getElementById("day-bar-fill").style.width = `${pct.toFixed(2)}%`;
}

function renderSyncNote() {
  const el = document.getElementById("sync-note");
  if (!DATA.generated_at) { el.textContent = "no sync yet"; return; }
  const d = new Date(DATA.generated_at);
  el.textContent = `synced ${fmtClock(d)}`;
}

function renderWeatherBar() {
  document.getElementById("weather").textContent = WEATHER
    ? `${Math.round(WEATHER.temp)}°  ${WEATHER.description}`
    : "—";
}

function renderSunArc(now) {
  const path = document.getElementById("arc-path");
  const dot = document.getElementById("arc-dot");
  if (!SUN.sunrise || !SUN.sunset) return;

  document.getElementById("arc-sunrise").textContent = fmtTime(SUN.sunrise);
  document.getElementById("arc-sunset").textContent = fmtTime(SUN.sunset);

  const sunrise = new Date(SUN.sunrise), sunset = new Date(SUN.sunset);
  let frac = (now - sunrise) / (sunset - sunrise);
  frac = Math.max(0, Math.min(1, frac));

  const len = path.getTotalLength();
  const pt = path.getPointAtLength(len * frac);
  dot.setAttribute("cx", pt.x);
  dot.setAttribute("cy", pt.y);
}

// ============================================================
// Data fetching
// ============================================================
async function loadData() {
  try {
    const res = await fetch(`${CONFIG.dataUrl}?t=${Date.now()}`);
    if (res.ok) DATA = await res.json();
  } catch (err) {
    console.error("Oculus: failed to load data.json", err);
  }
}

const WMO_DESCRIPTIONS = {
  0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
  45: "fog", 48: "fog", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 71: "light snow", 73: "snow",
  75: "heavy snow", 80: "rain showers", 81: "rain showers", 82: "violent showers",
  95: "thunderstorms", 96: "thunderstorms", 99: "thunderstorms",
};

async function loadWeather() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.latitude}&longitude=${CONFIG.longitude}` +
      `&current=temperature_2m,weather_code&daily=sunrise,sunset&temperature_unit=fahrenheit&timezone=${encodeURIComponent(CONFIG.timezone)}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const json = await res.json();
    SUN.sunrise = json.daily.sunrise[0];
    SUN.sunset = json.daily.sunset[0];
    WEATHER = { temp: json.current.temperature_2m, description: WMO_DESCRIPTIONS[json.current.weather_code] || "" };
  } catch (err) {
    console.error("Oculus: failed to load weather", err);
  }
}

// ============================================================
// Main loop
// ============================================================
function tick() {
  const now = new Date();
  const mode = currentMode(now);
  setMode(mode);
  renderClocks(now);

  if (mode === "morning") {
    renderMorning(now);
  } else if (mode === "focus" || mode === "open") {
    const events = DATA.events
      .filter(e => !/\bsleep\b/i.test(e.title))
      .map(e => ({ ...e, start: new Date(e.start), end: new Date(e.end) }))
      .sort((a, b) => a.start - b.start);

    renderNowBand(now, events);
    renderTimeline(now, events);
    renderTasks(mode === "focus");
    renderDayBar(now);
    renderSyncNote();
    renderSunArc(now);
    renderWeatherBar();
  }
}

async function boot() {
  buildStars();
  await Promise.all([loadData(), loadWeather()]);
  tick();
  setInterval(tick, CONFIG.tickMs);
  setInterval(loadData, CONFIG.dataRefreshMs);
  setInterval(loadWeather, CONFIG.weatherRefreshMs);
}

boot();
