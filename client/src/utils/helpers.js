/**
 * Strips HTML tags and unescapes common entities from GHL Rich-Text Notes
 */
export function stripHtml(htmlStr) {
  if (!htmlStr) return "";
  let cleanText = htmlStr
    .replace(/<[^>]*>?/gm, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return cleanText.trim();
}

/**
 * Calculates current onboarding week (1-12) based on Start Date
 */
export function localNoonFromStart(startDateStr) {
  if (!startDateStr) return null;
  if (startDateStr.toDate) startDateStr = startDateStr.toDate();
  else if (startDateStr.seconds) startDateStr = new Date(startDateStr.seconds * 1000);
  if (startDateStr instanceof Date && !isNaN(startDateStr.getTime())) {
    return new Date(startDateStr.getFullYear(), startDateStr.getMonth(), startDateStr.getDate(), 12, 0, 0);
  }
  const s = String(startDateStr);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

function ymdParts(input) {
  if (!input) return null;
  if (typeof input === "string") {
    const m = input.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
  }
  const noon = localNoonFromStart(input);
  if (!noon) return null;
  return { y: noon.getFullYear(), mo: noon.getMonth() + 1, d: noon.getDate() };
}

export function localDaysSinceStart(startDateStr) {
  const start = ymdParts(startDateStr);
  if (!start) return 0;
  const now = new Date();
  const today = { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() };
  return Math.max(
    0,
    Math.round(
      (Date.UTC(today.y, today.mo - 1, today.d) - Date.UTC(start.y, start.mo - 1, start.d)) /
        (1000 * 60 * 60 * 24)
    )
  );
}

export function calculateWeekFromDate(startDateStr) {
  if (!startDateStr) return 1;
  const week = Math.floor(localDaysSinceStart(startDateStr) / 7) + 1;
  if (week < 1) return 1;
  if (week > 12) return 12;
  return week;
}

/**
 * Calculates pace-aware churn risk based on visits AND days elapsed in current week
 */
export function getMemberRiskInfo(checkIns, startDateStr, status) {
  if (status === "pending") {
    return { label: "Pending Start", color: "#2563eb", bg: "#eff6ff", level: "pending" };
  }
  if (status === "graduated") {
    return { label: "Graduated", color: "#16a34a", bg: "#f0fdf4", level: "graduated" };
  }
  if (status === "cancelled") {
    return { label: "Cancelled", color: "#64748b", bg: "#f1f5f9", level: "cancelled" };
  }

  let daysIntoWeek = 1;
  if (startDateStr) {
    daysIntoWeek = (localDaysSinceStart(startDateStr) % 7) + 1;
  }

  if (checkIns >= 3) {
    return { label: "Low Risk (Target Met)", color: "#16a34a", bg: "#f0fdf4", level: "low" };
  }

  if (checkIns === 2) {
    if (daysIntoWeek <= 4) {
      return { label: "Low Risk (Great Pace)", color: "#16a34a", bg: "#f0fdf4", level: "low" };
    }
    return { label: "Moderate Risk (2 visits)", color: "#d97706", bg: "#fef3c7", level: "medium" };
  }

  if (checkIns === 1) {
    if (daysIntoWeek <= 2) {
      return { label: "Low Risk (1 visit)", color: "#16a34a", bg: "#f0fdf4", level: "low" };
    }
    if (daysIntoWeek <= 4) {
      return { label: "Moderate Risk (1 visit)", color: "#d97706", bg: "#fef3c7", level: "medium" };
    }
    return { label: "High Risk (1 visit)", color: "#dc2626", bg: "#fef2f2", level: "high" };
  }

  if (daysIntoWeek <= 2) {
    return { label: "Moderate Risk (0 visits)", color: "#d97706", bg: "#fef3c7", level: "medium" };
  }
  return { label: "High Risk (0 visits)", color: "#dc2626", bg: "#fef2f2", level: "high" };
}

/**
 * Generates 3 consecutive month structures for calendar view starting from Start Date
 */
export function generateThreeMonthCalendar(startDateStr) {
  if (!startDateStr) return [];
  const start = new Date(startDateStr);
  const months = [];
  
  const baseYear = start.getFullYear();
  const baseMonth = start.getMonth();

  for (let m = 0; m < 3; m++) {
    const monthObj = new Date(baseYear, baseMonth + m, 1);
    const year = monthObj.getFullYear();
    const month = monthObj.getMonth();
    
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = monthObj.toLocaleString("en-US", { month: "long", year: "numeric" });
    
    months.push({ year, month, firstDayOfWeek, daysInMonth, monthName });
  }
  return months;
}