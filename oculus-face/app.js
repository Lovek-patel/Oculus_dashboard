// ============================================================
// OCULUS — config
// Edit these to match reality; everything else is automatic.
// ============================================================
const CONFIG = {
  name: "Love",
  // Where the projector lives — used for weather + sunrise/sunset.
  // Default: Morningside Heights, NYC (Columbia). Change if needed.
  latitude: 40.8075,
  longitude: -73.9626,
  timezone: "America/New_York",

  // Night / morning boundaries (24h, local time)
  nightStart: { h: 21, m: 30 }, // 9:30pm -> screen goes black
  morningStart: { h: 6, m: 0 }, // 6:00am -> good morning screen
  morningDuration: 45, // minutes the morning screen stays up before the day view takes over

  dataUrl: "data.json",
  dataRefreshMs: 5 * 60 * 1000,   // reload data.json every 5 min
  weatherRefreshMs: 30 * 60 * 1000, // refresh weather/sunrise every 30 min
  tickMs: 1000,
};

// ============================================================
// State
// ============================================================
let DATA = { generated_at: null, events: [], tasks: [] };
let SUN = { sunrise: null, sunset: null };
let WEATHER = null;

// ============================================================
// Time-of-day state machine
// ============================================================
function minutesSinceMidnight(d) {
  return d.getHours() * 60 + d.getMinutes();
}

function boundaryMinutes(b) {
  return b.h * 60 + b.m;
}

function currentMode(now) {
  const mins = minutesSinceMidnight(now);
  const night = boundaryMinutes(CONFIG.nightStart);
  const morning = boundaryMinutes(CONFIG.morningStart);
  const morningEnd = morning + CONFIG.morningDuration;

  // Night wraps across midnight (e.g. 21:30 -> 06:00)
  const inNight = night > morning
    ? (mins >= night || mins < morning)
    : (mins >= night && mins < morning);

  if (inNight) return "night";
  if (mins >= morning && mins < morningEnd) return "morning";
  return "day";
}

function setScreen(mode) {
  for (const id of ["night", "morning", "day"]) {
    document.getElementById(id).classList.toggle("active", id === mode);
  }
}

// ============================================================
// Rendering — day view
// ============================================================
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtClock(d) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtDate(d) {
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function renderClock(now) {
  document.getElementById("clock").textContent = fmtClock(now);
  document.getElementById("date").textContent = fmtDate(now);
  document.getElementById("morning-date").textContent = fmtDate(now);
  document.getElementById("night-clock").textContent = fmtClock(now);
}

function renderNowNext(now) {
  const events = DATA.events
    .map(e => ({ ...e, start: new Date(e.start), end: new Date(e.end) }))
    .sort((a, b) => a.start - b.start);

  const current = events.find(e => e.start <= now && e.end > now);
  const upcoming = events.filter(e => e.start > now).sort((a, b) => a.start - b.start)[0];

  const nowTitle = document.getElementById("now-title");
  const nowTime = document.getElementById("now-time");
  const nextTitle = document.getElementById("next-title");
  const nextTime = document.getElementById("next-time");

  if (current) {
    nowTitle.textContent = current.title;
    nowTime.textContent = `${fmtTime(current.start)} – ${fmtTime(current.end)}`;
  } else {
    nowTitle.textContent = "Nothing on right now";
    nowTime.textContent = "";
  }

  if (upcoming) {
    nextTitle.textContent = upcoming.title;
    nextTime.textContent = `${fmtTime(upcoming.start)} – ${fmtTime(upcoming.end)}`;
  } else {
    nextTitle.textContent = "Nothing else today";
    nextTime.textContent = "";
  }
}

function renderTimeline(now) {
  const list = document.getElementById("timeline-list");
  list.innerHTML = "";

  const todayEvents = DATA.events
    .map(e => ({ ...e, start: new Date(e.start), end: new Date(e.end) }))
    .filter(e => e.start.toDateString() === now.toDateString())
    .sort((a, b) => a.start - b.start);

  if (todayEvents.length === 0) {
    list.innerHTML = `<div class="empty-note">Nothing on the calendar today.</div>`;
    return;
  }

  for (const e of todayEvents) {
    const li = document.createElement("li");
    const isDone = e.end <= now;
    const isCurrent = e.start <= now && e.end > now;
    li.className = isDone ? "done" : isCurrent ? "current" : "";
    li.innerHTML = `<span class="t-time">${fmtTime(e.start)}</span><span class="t-title">${e.title}</span>`;
    list.appendChild(li);
  }
}

function renderTasks() {
  const list = document.getElementById("task-list");
  list.innerHTML = "";

  const tasks = [...DATA.tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.due && b.due) return new Date(a.due) - new Date(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  });

  if (tasks.length === 0) {
    list.innerHTML = `<div class="empty-note">Nothing on the task list.</div>`;
    return;
  }

  for (const t of tasks) {
    const li = document.createElement("li");
    li.className = t.done ? "done" : "";
    const due = t.due ? `<span class="t-due">${new Date(t.due).toLocaleDateString([], { month: "short", day: "numeric" })}</span>` : "";
    li.innerHTML = `<span class="t-check"></span><span class="t-title">${t.title}</span>${due}`;
    list.appendChild(li);
  }
}

function renderDayProgress(now) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const nextMidnight = new Date(midnight);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  const pct = ((now - midnight) / (nextMidnight - midnight)) * 100;
  document.getElementById("day-progress-fill").style.width = `${pct.toFixed(2)}%`;
}

function renderSyncNote() {
  const el = document.getElementById("sync-note");
  if (!DATA.generated_at) { el.textContent = "no sync yet"; return; }
  const d = new Date(DATA.generated_at);
  el.textContent = `synced ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

// ---------- sun arc ----------
function renderSunArc(now) {
  const path = document.getElementById("arc-path");
  const dot = document.getElementById("arc-dot");
  const sunriseEl = document.getElementById("arc-sunrise");
  const sunsetEl = document.getElementById("arc-sunset");

  if (!SUN.sunrise || !SUN.sunset) return;

  sunriseEl.textContent = fmtTime(SUN.sunrise);
  sunsetEl.textContent = fmtTime(SUN.sunset);

  const sunrise = new Date(SUN.sunrise);
  const sunset = new Date(SUN.sunset);
  let frac = (now - sunrise) / (sunset - sunrise);
  frac = Math.max(0, Math.min(1, frac));

  const len = path.getTotalLength();
  const pt = path.getPointAtLength(len * frac);
  dot.setAttribute("cx", pt.x);
  dot.setAttribute("cy", pt.y);
}

// ---------- morning screen ----------
function renderMorning(now) {
  const hour = now.getHours();
  const greeting = document.getElementById("morning-greeting");
  greeting.textContent = `Good morning, ${CONFIG.name}.`;

  const events = DATA.events
    .map(e => ({ ...e, start: new Date(e.start) }))
    .filter(e => e.start.toDateString() === now.toDateString())
    .sort((a, b) => a.start - b.start);

  const firstEl = document.getElementById("morning-first");
  if (events.length > 0) {
    firstEl.textContent = `First up: ${events[0].title} at ${fmtTime(events[0].start)}`;
  } else {
    firstEl.textContent = "Nothing on the calendar yet today.";
  }

  const weatherEl = document.getElementById("morning-weather");
  weatherEl.textContent = WEATHER
    ? `${Math.round(WEATHER.temp)}°  ·  ${WEATHER.description}`
    : "—";
}

function renderWeatherBar() {
  const el = document.getElementById("weather");
  el.textContent = WEATHER
    ? `${Math.round(WEATHER.temp)}°  ${WEATHER.description}`
    : "—";
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

// Open-Meteo — free, no key, CORS-enabled. Gives sunrise/sunset + current weather.
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

    WEATHER = {
      temp: json.current.temperature_2m,
      description: WMO_DESCRIPTIONS[json.current.weather_code] || "",
    };
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
  setScreen(mode);
  renderClock(now);

  if (mode === "day") {
    renderNowNext(now);
    renderTimeline(now);
    renderTasks();
    renderDayProgress(now);
    renderSyncNote();
    renderSunArc(now);
    renderWeatherBar();
  } else if (mode === "morning") {
    renderMorning(now);
  }
}

async function boot() {
  await Promise.all([loadData(), loadWeather()]);
  tick();
  setInterval(tick, CONFIG.tickMs);
  setInterval(loadData, CONFIG.dataRefreshMs);
  setInterval(loadWeather, CONFIG.weatherRefreshMs);
}

boot();
