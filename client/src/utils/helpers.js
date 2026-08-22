/**
 * Strips HTML tags and unescapes common entities from GHL Rich-Text Notes
 */
export function stripHtml(htmlStr) {
  if (!htmlStr) return "";
  let cleanText = htmlStr
    .replace(/<[^>]*>?/gm, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  return cleanText.trim();
}

export const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

/**
 * Local calendar noon for a date string / Timestamp / Date (avoids UTC off-by-one).
 */
export function localNoonFromStart(startDateStr) {
  if (!startDateStr) return null;
  if (startDateStr.toDate) startDateStr = startDateStr.toDate();
  else if (startDateStr.seconds) startDateStr = new Date(startDateStr.seconds * 1000);
  if (startDateStr instanceof Date && !isNaN(startDateStr.getTime())) {
    return new Date(
      startDateStr.getFullYear(),
      startDateStr.getMonth(),
      startDateStr.getDate(),
      12,
      0,
      0
    );
  }
  const s = String(startDateStr);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

/**
 * First week-start day ON OR AFTER the member start date.
 * weekStartDay: 0=Sun … 6=Sat (default 0).
 * If they start on that weekday → that day is week 1.
 * Otherwise → the next occurrence of that weekday (partial week does not count).
 */
export function programWeek1Start(startDateStr, weekStartDay = 0) {
  const start = localNoonFromStart(startDateStr);
  if (!start) return null;
  const ws = ((Number(weekStartDay) % 7) + 7) % 7;
  const day = start.getDay();
  const daysUntil = (ws - day + 7) % 7;
  const result = new Date(start);
  result.setDate(result.getDate() + daysUntil);
  return result;
}

/** Alias kept for older imports */
export function programWeek1Monday(startDateStr, weekStartDay = 0) {
  return programWeek1Start(startDateStr, weekStartDay);
}

/** Last day of week 12 (week1 start + 83 days). */
export function programEndSunday(startDateStr, weekStartDay = 0) {
  const week1 = programWeek1Start(startDateStr, weekStartDay);
  if (!week1) return null;
  const end = new Date(week1);
  end.setDate(end.getDate() + 12 * 7 - 1);
  return end;
}

function todayLocalNoon() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
}

/** Days since program week-1 start (0 on that day). Before week 1 → 0. */
export function localDaysSinceStart(startDateStr, weekStartDay = 0) {
  const week1 = programWeek1Start(startDateStr, weekStartDay);
  if (!week1) return 0;
  const today = todayLocalNoon();
  if (today < week1) return 0;
  return Math.round((today - week1) / (1000 * 60 * 60 * 24));
}

/**
 * Current onboarding week 1–12.
 * Before the first week-start day → 0.
 * After week 12 → 12 (capped for display).
 */
export function calculateWeekFromDate(startDateStr, weekStartDay = 0) {
  if (!startDateStr) return 1;
  const week1 = programWeek1Start(startDateStr, weekStartDay);
  if (!week1) return 1;
  const today = todayLocalNoon();
  if (today < week1) return 0;
  const days = Math.round((today - week1) / (1000 * 60 * 60 * 24));
  const week = Math.floor(days / 7) + 1;
  if (week < 1) return 0;
  if (week > 12) return 12;
  return week;
}

/**
 * Which program week (1–12) a class date falls in.
 * Returns null if before week-1 start (partial week / not counted).
 */
export function weekNumberForClassDate(startDateStr, classDate, weekStartDay = 0) {
  if (!startDateStr || !classDate) return null;
  const week1 = programWeek1Start(startDateStr, weekStartDay);
  if (!week1) return null;
  const day = localNoonFromStart(classDate);
  if (!day) return null;
  if (day < week1) return null;
  const diffDays = Math.round((day - week1) / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  // Only weeks 1–12; after program ends return null (no badge / not counted)
  if (week < 1 || week > 12) return null;
  return week;
}

/** Date range for a program week number (1–12). */
export function getWeekDateRange(startDateStr, weekNum, weekStartDay = 0) {
  const week1 = programWeek1Start(startDateStr, weekStartDay);
  if (!week1 || !weekNum || weekNum < 1) return null;
  const weekStart = new Date(week1);
  weekStart.setDate(weekStart.getDate() + (weekNum - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const fmt = (d) =>
    [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  return { startKey: fmt(weekStart), endKey: fmt(weekEnd), weekStart, weekEnd };
}

/**
 * Pace-aware churn risk based on visits AND days elapsed in current program week.
 */
export function getMemberRiskInfo(checkIns, startDateStr, status, weekStartDay = 0) {
  if (status === "pending") {
    return { label: "Pending Start", color: "#2563eb", bg: "#eff6ff", level: "pending" };
  }
  if (status === "complete" || status === "completed") {
    return { label: "Completed", color: "#059669", bg: "#ecfdf5", level: "complete" };
  }

  const week = calculateWeekFromDate(startDateStr, weekStartDay);
  if (week === 0) {
    const name =
      WEEKDAY_OPTIONS.find((o) => o.value === Number(weekStartDay))?.label || "week start";
    return {
      label: `Starts next ${name}`,
      color: "#2563eb",
      bg: "#eff6ff",
      level: "pending",
    };
  }

  const visits = Number(checkIns) || 0;
  const daysIntoWeek = (localDaysSinceStart(startDateStr, weekStartDay) % 7) + 1;

  if (visits >= 2) {
    return { label: "On Track", color: "#059669", bg: "#ecfdf5", level: "good" };
  }
  if (visits === 1) {
    if (daysIntoWeek <= 3) {
      return { label: "Watch", color: "#d97706", bg: "#fffbeb", level: "watch" };
    }
    return { label: "Behind", color: "#dc2626", bg: "#fef2f2", level: "risk" };
  }
  if (daysIntoWeek <= 2) {
    return { label: "Watch", color: "#d97706", bg: "#fffbeb", level: "watch" };
  }
  return { label: "At Risk", color: "#dc2626", bg: "#fef2f2", level: "risk" };
}

/**
 * Generates 3 consecutive month structures for calendar view starting from Start Date
 */
export function generateThreeMonthCalendar(startDateStr) {
  if (!startDateStr) return [];
  const start = localNoonFromStart(startDateStr) || new Date();
  const baseYear = start.getFullYear();
  const baseMonth = start.getMonth();
  const months = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(baseYear, baseMonth + i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = d.toLocaleString("en-US", { month: "long", year: "numeric" });
    months.push({ year, month, daysInMonth, monthName });
  }
  return months;
}