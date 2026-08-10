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
export function calculateWeekFromDate(startDateStr) {
  if (!startDateStr) return 1;
  const start = new Date(startDateStr);
  const now = new Date();
  const diffInDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  let week = Math.floor(diffInDays / 7) + 1;
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
    const start = new Date(startDateStr);
    const now = new Date();
    const diffDays = Math.max(0, Math.floor((now - start) / (1000 * 60 * 60 * 24)));
    daysIntoWeek = (diffDays % 7) + 1;
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