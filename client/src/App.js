import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  getDocs,
  addDoc
} from "firebase/firestore";
import { 
  getAuth, 
  signInAnonymously, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";

// --- YOUR FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyAMs-wQc8FG9cu9aHFzXYLy2XC41phCmaA",
  authDomain: "swarm-12-week-startup.firebaseapp.com",
  projectId: "swarm-12-week-startup",
  storageBucket: "swarm-12-week-startup.firebasestorage.app",
  messagingSenderId: "936210614408",
  appId: "1:936210614408:web:afc70c25feb9892cdbb73d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/**
 * Strips HTML tags and unescapes common entities from GHL Rich-Text Notes
 */
function stripHtml(htmlStr) {
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
function calculateWeekFromDate(startDateStr) {
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
function getMemberRiskInfo(checkIns, startDateStr, status) {
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
function generateThreeMonthCalendar(startDateStr) {
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

export default function App() {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  // App Data State
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);

  // Person View Modal State
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberCheckIns, setMemberCheckIns] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});

  // GHL Sync State inside Person View
  const [activeTab, setActiveTab] = useState("logs");
  const [ghlData, setGhlData] = useState({ contactId: null, notes: [], appointments: [], messages: [] });
  const [loadingGhl, setLoadingGhl] = useState(false);

  // Form Inputs for Adding Notes & Sending SMS
  const [newNoteText, setNewNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [newSmsText, setNewSmsText] = useState("");
  const [sendingSms, setSendingSms] = useState(false);

  // Add Member State
  const [newMember, setNewMember] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    status: "pending",
    dateAdded: "",
    startDate: "",
    totalCheckIns: "",
    scan1: false,
    scan2: false,
    scan3: false
  });

  // Monitor Auth State
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user && sessionStorage.getItem("swarm_dashboard_auth") === "true") {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
      setAuthChecking(false);
    });
    return () => unsubscribeAuth();
  }, []);

  // Password Login Handler
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (passwordInput === "SwarmCoach01!") {
      try {
        await signInAnonymously(auth);
        sessionStorage.setItem("swarm_dashboard_auth", "true");
        setIsAuthenticated(true);
        setPasswordError(false);
      } catch (err) {
        console.error("Anonymous auth error:", err);
        setPasswordError(true);
      }
    } else {
      setPasswordError(true);
    }
  };

  // Password Logout Handler
  const handleLogout = async () => {
    sessionStorage.removeItem("swarm_dashboard_auth");
    await signOut(auth);
    setIsAuthenticated(false);
    setPasswordInput("");
  };

  // Real-time Firestore sync for Members
  useEffect(() => {
    if (!isAuthenticated) return;

    const q = query(collection(db, "members"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMembers(data);

      if (selectedMember) {
        const updated = data.find(m => m.id === selectedMember.id);
        if (updated) {
          setSelectedMember(updated);
        }
      }
      setLoading(false);
    }, (error) => {
      console.error("Firestore sync error:", error);
    });

    return () => unsubscribe();
  }, [isAuthenticated, selectedMember?.id]);

  // Fetch GHL Notes, Appointments, and SMS Messages
  const fetchGhlDetails = async (member) => {
    if (!member?.email) return;
    setLoadingGhl(true);
    try {
      const res = await fetch(
        `https://us-central1-swarm-12-week-startup.cloudfunctions.net/getGhlContactDetails?email=${encodeURIComponent(member.email)}`
      );
      const data = await res.json();
      setGhlData({
        contactId: data.contactId || null,
        notes: data.notes || [],
        appointments: data.appointments || [],
        messages: data.messages || []
      });
    } catch (err) {
      console.error("Error loading GHL data:", err);
    } finally {
      setLoadingGhl(false);
    }
  };

  // Open Person View, fetch Firestore logs and live GHL data
  const handleOpenPersonView = async (member) => {
    setSelectedMember(member);
    setActiveTab("logs");
    setGhlData({ contactId: null, notes: [], appointments: [], messages: [] });
    setNewNoteText("");
    setNewSmsText("");
    setEditFormData({
      ...member,
      startDateFormatted: member.startDate ? new Date(member.startDate).toISOString().split('T')[0] : "",
      dateAddedFormatted: member.dateAdded ? new Date(member.dateAdded).toISOString().split('T')[0] : "",
      weeklyCheckIns: { ...(member.weeklyCheckIns || {}) }
    });
    setIsEditing(false);
    setLoadingHistory(true);
    
    try {
      const checkInsRef = collection(db, "check_ins");
      const q = query(checkInsRef, where("memberId", "==", member.id));
      const querySnapshot = await getDocs(q);
      const history = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      setMemberCheckIns(history);
    } catch (err) {
      console.error("Error fetching check-in history:", err);
    } finally {
      setLoadingHistory(false);
    }

    fetchGhlDetails(member);
  };

  // Handler: Create Staff Note in GHL
  const handleAddGhlNote = async (e) => {
    e.preventDefault();
    if (!newNoteText.trim() || !ghlData.contactId) return;

    setAddingNote(true);
    try {
      const res = await fetch("https://us-central1-swarm-12-week-startup.cloudfunctions.net/createGhlNote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: ghlData.contactId,
          note: newNoteText.trim()
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setNewNoteText("");
        await fetchGhlDetails(selectedMember); // Auto-refresh notes thread
      } else {
        alert(`Failed to add note: ${data.error || "Check GHL Integration scopes"}`);
      }
    } catch (err) {
      console.error("Error adding GHL note:", err);
      alert("Error connecting to server.");
    } finally {
      setAddingNote(false);
    }
  };

  // Handler: Send Outbound SMS via GHL
  const handleSendGhlSms = async (e) => {
    e.preventDefault();
    if (!newSmsText.trim() || !ghlData.contactId) return;

    setSendingSms(true);
    try {
      const res = await fetch("https://us-central1-swarm-12-week-startup.cloudfunctions.net/sendGhlSms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: ghlData.contactId,
          message: newSmsText.trim()
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setNewSmsText("");
        await fetchGhlDetails(selectedMember); // Auto-refresh conversation
      } else {
        alert(`Failed to send SMS: ${data.error || "Check GHL SMS scopes"}`);
      }
    } catch (err) {
      console.error("Error sending GHL SMS:", err);
      alert("Error connecting to server.");
    } finally {
      setSendingSms(false);
    }
  };

  // Toggle InBody scan directly
  const handleToggleScan = async (memberId, scanKey, e) => {
    if (e) e.stopPropagation();
    const targetMember = members.find(m => m.id === memberId);
    if (!targetMember) return;

    const currentScans = targetMember.inBodyScans || { scan1: false, scan2: false, scan3: false };
    const updatedScans = {
      ...currentScans,
      [scanKey]: !currentScans[scanKey]
    };

    await updateDoc(doc(db, "members", memberId), {
      inBodyScans: updatedScans
    });
  };

  // Add a manual check-in log inside Person View
  const handleAddManualCheckIn = async () => {
    if (!selectedMember) return;
    const now = new Date();
    const currentWeek = selectedMember.currentWeek || 1;

    const currentWeeklyCounts = selectedMember.weeklyCheckIns || {};
    const newCount = (currentWeeklyCounts[currentWeek] || 0) + 1;
    currentWeeklyCounts[currentWeek] = newCount;

    const riskInfo = getMemberRiskInfo(newCount, selectedMember.startDate, selectedMember.status);

    await updateDoc(doc(db, "members", selectedMember.id), {
      weeklyCheckIns: currentWeeklyCounts,
      lastCheckIn: now.toISOString(),
      riskLevel: riskInfo.level
    });

    const newLog = {
      memberId: selectedMember.id,
      email: selectedMember.email || "",
      timestamp: now.toISOString(),
      weekNumber: currentWeek,
      source: "Manual Check-In (Dashboard)"
    };
    const logRef = await addDoc(collection(db, "check_ins"), newLog);

    setMemberCheckIns(prev => [{ id: logRef.id, ...newLog }, ...prev]);
  };

  // Delete Individual Check-In Log
  const handleDeleteCheckIn = async (log) => {
    if (!window.confirm("Are you sure you want to delete this check-in entry?")) return;

    try {
      await deleteDoc(doc(db, "check_ins", log.id));

      if (selectedMember) {
        const weekNum = log.weekNumber || selectedMember.currentWeek || 1;
        const currentWeeklyCounts = { ...(selectedMember.weeklyCheckIns || {}) };
        const currentCount = currentWeeklyCounts[weekNum] || 0;
        const newCount = Math.max(0, currentCount - 1);
        currentWeeklyCounts[weekNum] = newCount;

        const riskInfo = getMemberRiskInfo(newCount, selectedMember.startDate, selectedMember.status);

        await updateDoc(doc(db, "members", selectedMember.id), {
          weeklyCheckIns: currentWeeklyCounts,
          riskLevel: riskInfo.level
        });

        setMemberCheckIns(prev => prev.filter(item => item.id !== log.id));
      }
    } catch (err) {
      console.error("Error deleting check-in:", err);
    }
  };

  // Save Edits
  const handleSavePersonEdits = async (e) => {
    e.preventDefault();
    if (!selectedMember) return;

    const memberRef = doc(db, "members", selectedMember.id);
    
    let newStartDate = selectedMember.startDate;
    if (editFormData.startDateFormatted) {
      newStartDate = new Date(editFormData.startDateFormatted).toISOString();
    }

    let newDateAdded = selectedMember.dateAdded || new Date().toISOString();
    if (editFormData.dateAddedFormatted) {
      newDateAdded = new Date(editFormData.dateAddedFormatted).toISOString();
    }

    let calculatedWeek = editFormData.currentWeek;
    if (newStartDate) {
      calculatedWeek = calculateWeekFromDate(newStartDate);
    }

    const updatedWeeklyCheckIns = {};
    for (let w = 1; w <= 12; w++) {
      updatedWeeklyCheckIns[w] = Number(editFormData.weeklyCheckIns?.[w] || 0);
    }

    const activeWeekCount = updatedWeeklyCheckIns[calculatedWeek] || 0;
    const riskInfo = getMemberRiskInfo(activeWeekCount, newStartDate, editFormData.status);

    let updates = {
      firstName: editFormData.firstName,
      lastName: editFormData.lastName,
      email: editFormData.email,
      phone: editFormData.phone,
      status: editFormData.status,
      dateAdded: newDateAdded,
      startDate: newStartDate,
      currentWeek: Number(calculatedWeek || 1),
      weekOverride: Number(calculatedWeek || 1),
      weeklyCheckIns: updatedWeeklyCheckIns,
      riskLevel: riskInfo.level
    };

    if (editFormData.status === "active" && !newStartDate) {
      updates.startDate = new Date().toISOString();
    }

    await updateDoc(memberRef, updates);
    setIsEditing(false);
  };

  // Delete Member
  const handleDeleteMember = async (memberId) => {
    if (window.confirm("Are you sure you want to permanently delete this member?")) {
      await deleteDoc(doc(db, "members", memberId));
      setSelectedMember(null);
    }
  };

  // Add Member submit
  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMember.firstName) return;

    const memberId = newMember.email 
      ? newMember.email.replace(/[^a-zA-Z0-9]/g, "_") 
      : `manual_${Date.now()}`;

    const dateAddedIso = newMember.dateAdded 
      ? new Date(newMember.dateAdded).toISOString() 
      : new Date().toISOString();

    const inBodyScans = {
      scan1: !!newMember.scan1,
      scan2: !!newMember.scan2,
      scan3: !!newMember.scan3
    };

    if (newMember.status === "pending") {
      await setDoc(doc(db, "members", memberId), {
        id: memberId,
        firstName: newMember.firstName,
        lastName: newMember.lastName,
        email: newMember.email || "",
        phone: newMember.phone || "",
        dateAdded: dateAddedIso,
        startDate: null,
        currentWeek: 0,
        weekOverride: null,
        status: "pending",
        weeklyCheckIns: {},
        lastCheckIn: null,
        riskLevel: "pending",
        inBodyScans
      });
    } else {
      const start = new Date(newMember.startDate || Date.now());
      const currentWeek = calculateWeekFromDate(start);

      const totalCheckIns = parseInt(newMember.totalCheckIns || 0, 10);
      const weeklyCheckIns = {};
      const basePerWeek = Math.floor(totalCheckIns / currentWeek);
      let remainder = totalCheckIns % currentWeek;

      for (let w = 1; w <= 12; w++) {
        if (w <= currentWeek) {
          let count = basePerWeek;
          if (remainder > 0) {
            count += 1;
            remainder--;
          }
          weeklyCheckIns[w] = count;
        } else {
          weeklyCheckIns[w] = 0;
        }
      }

      const activeCount = weeklyCheckIns[currentWeek] || 0;
      const riskInfo = getMemberRiskInfo(activeCount, start.toISOString(), "active");

      await setDoc(doc(db, "members", memberId), {
        id: memberId,
        firstName: newMember.firstName,
        lastName: newMember.lastName,
        email: newMember.email || "",
        phone: newMember.phone || "",
        dateAdded: dateAddedIso,
        startDate: start.toISOString(),
        currentWeek: currentWeek,
        weekOverride: null,
        status: "active",
        weeklyCheckIns: weeklyCheckIns,
        lastCheckIn: new Date().toISOString(),
        riskLevel: riskInfo.level,
        inBodyScans
      });
    }

    setNewMember({ 
      firstName: "", lastName: "", email: "", phone: "", status: "pending", 
      dateAdded: "", startDate: "", totalCheckIns: "", scan1: false, scan2: false, scan3: false 
    });
    setShowAddModal(false);
  };

  if (authChecking) {
    return (
      <div style={styles.loadingContainer}>
        <h2>Verifying Security Credentials...</h2>
      </div>
    );
  }

  // --- PASSWORD LOCK SCREEN UNLESS AUTHENTICATED ---
  if (!isAuthenticated) {
    return (
      <div style={styles.lockScreenContainer}>
        <div style={styles.lockCard}>
          <div style={styles.lockIcon}>🔐</div>
          <h2 style={styles.lockTitle}>Swarm Onboarding Access</h2>
          <p style={styles.lockSubtitle}>Enter the staff password to open the dashboard</p>
          
          <form onSubmit={handleLoginSubmit} style={styles.lockForm}>
            <input 
              type="password"
              placeholder="Enter Password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              style={passwordError ? styles.lockInputError : styles.lockInput}
              autoFocus
            />
            {passwordError && (
              <p style={styles.errorText}>Incorrect Password. Please try again.</p>
            )}
            <button type="submit" style={styles.lockBtn}>
              Unlock Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- GLOBAL STATS CALCULATIONS ---
  const pendingMembers = members.filter(m => m.status === "pending");
  const activeMembers = members.filter(m => m.status === "active");
  const highRiskMembers = activeMembers.filter(m => {
    const currentWeekVisits = m.weeklyCheckIns?.[m.currentWeek] || 0;
    const risk = getMemberRiskInfo(currentWeekVisits, m.startDate, m.status);
    return risk.level === "high";
  });
  
  const totalThisWeekVisits = activeMembers.reduce((acc, m) => {
    return acc + (m.weeklyCheckIns?.[m.currentWeek] || 0);
  }, 0);

  const avgVisitsPerWeek = activeMembers.length 
    ? (totalThisWeekVisits / activeMembers.length).toFixed(1) 
    : "0.0";

  let totalScansCompleted = 0;
  activeMembers.forEach(m => {
    if (m.inBodyScans?.scan1) totalScansCompleted++;
    if (m.inBodyScans?.scan2) totalScansCompleted++;
    if (m.inBodyScans?.scan3) totalScansCompleted++;
  });
  const possibleScans = activeMembers.length * 3;
  const inBodyCompletionRate = possibleScans > 0 
    ? Math.round((totalScansCompleted / possibleScans) * 100) 
    : 0;

  // Filtered Members for Table
  const filteredMembers = members.filter(m => {
    if (filter === "pending") return m.status === "pending";
    if (filter === "active") return m.status === "active";
    if (filter === "high_risk") {
      const currentWeekVisits = m.weeklyCheckIns?.[m.currentWeek] || 0;
      const risk = getMemberRiskInfo(currentWeekVisits, m.startDate, m.status);
      return m.status === "active" && risk.level === "high";
    }
    return m.status !== "cancelled";
  });

  // --- PERSON VIEW DETAILED STATS, NEXT WEEK CALCULATIONS & CALENDAR ---
  let personStats = null;
  let checkInDatesSet = new Set();
  let threeMonthCalendars = [];

  if (selectedMember) {
    const totalAllTimeVisits = Object.values(selectedMember.weeklyCheckIns || {}).reduce((a, b) => a + Number(b), 0);
    const activeWeeks = selectedMember.status === "active" ? Math.max(1, selectedMember.currentWeek || 1) : 0;
    const avgWeeklyVisitsPerson = activeWeeks > 0 ? (totalAllTimeVisits / activeWeeks).toFixed(1) : "0.0";
    const projected12WkTotal = activeWeeks > 0 ? Math.round(Number(avgWeeklyVisitsPerson) * 12) : 0;

    const startDateObj = selectedMember.startDate ? new Date(selectedMember.startDate) : null;
    const nowObj = new Date();
    const daysActive = startDateObj ? Math.max(0, Math.floor((nowObj - startDateObj) / (1000 * 60 * 60 * 24))) : 0;
    const onboardingProgressPct = selectedMember.status === "pending" ? 0 : Math.min(100, Math.round((activeWeeks / 12) * 100));

    // NEXT WEEK ADVANCEMENT CALCULATIONS
    let nextWeekNum = activeWeeks + 1;
    let nextWeekStartDateStr = "N/A";
    let daysUntilNextWeek = 0;

    if (startDateObj && selectedMember.status === "active") {
      if (activeWeeks < 12) {
        const nextWeekObj = new Date(startDateObj.getTime() + activeWeeks * 7 * 24 * 60 * 60 * 1000);
        nextWeekStartDateStr = nextWeekObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        
        const todayMid = new Date();
        todayMid.setHours(0,0,0,0);
        const nextWeekMid = new Date(nextWeekObj);
        nextWeekMid.setHours(0,0,0,0);
        
        const diffMs = nextWeekMid - todayMid;
        daysUntilNextWeek = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      } else {
        nextWeekStartDateStr = "Completed 12 Wks";
        nextWeekNum = 12;
      }
    }

    const scanObj = selectedMember.inBodyScans || {};
    const scansCompleted = (scanObj.scan1 ? 1 : 0) + (scanObj.scan2 ? 1 : 0) + (scanObj.scan3 ? 1 : 0);
    const scanPct = Math.round((scansCompleted / 3) * 100);

    const currentWkVisits = selectedMember.weeklyCheckIns?.[selectedMember.currentWeek] || 0;
    const riskInfo = getMemberRiskInfo(currentWkVisits, selectedMember.startDate, selectedMember.status);

    const lastCheckInFormatted = selectedMember.lastCheckIn 
      ? new Date(selectedMember.lastCheckIn).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) 
      : "No check-ins recorded";

    memberCheckIns.forEach(log => {
      if (log.timestamp) {
        const d = new Date(log.timestamp);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        checkInDatesSet.add(key);
      }
    });

    threeMonthCalendars = generateThreeMonthCalendar(selectedMember.startDate);

    personStats = {
      totalAllTimeVisits,
      activeWeeks,
      nextWeekNum,
      nextWeekStartDateStr,
      daysUntilNextWeek,
      avgWeeklyVisitsPerson,
      projected12WkTotal,
      daysActive,
      onboardingProgressPct,
      scansCompleted,
      scanPct,
      currentWkVisits,
      riskInfo,
      lastCheckInFormatted
    };
  }

  const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <h2>Loading 12-Week Member Onboarding...</h2>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>12-Week Onboarding Dashboard</h1>
          <p style={styles.subtitle}>Click any member row to view full stats, adjust check-ins & edit dates</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button style={styles.addBtn} onClick={() => setShowAddModal(true)}>
            + Add Member
          </button>
          <button style={styles.logoutBtn} onClick={handleLogout}>
            🔒 Logout
          </button>
        </div>
      </header>

      {/* Metrics Overview */}
      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Active Onboarding</span>
          <span style={styles.metricValue}>{activeMembers.length}</span>
          <span style={styles.metricSubText}>In 12-week program</span>
        </div>
        <div style={{ ...styles.metricCard, borderColor: "#3b82f6", backgroundColor: "#eff6ff" }}>
          <span style={{ ...styles.metricLabel, color: "#1e40af" }}>Pending 1st Class</span>
          <span style={{ ...styles.metricValue, color: "#2563eb" }}>{pendingMembers.length}</span>
          <span style={styles.metricSubText}>Signed up, waiting</span>
        </div>
        <div style={{ ...styles.metricCard, borderColor: "#ef4444", backgroundColor: "#fef2f2" }}>
          <span style={{ ...styles.metricLabel, color: "#991b1b" }}>High Risk (Needs Touchpoint)</span>
          <span style={{ ...styles.metricValue, color: "#dc2626" }}>{highRiskMembers.length}</span>
          <span style={styles.metricSubText}>Behind on weekly pace</span>
        </div>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Avg Weekly Visits</span>
          <span style={styles.metricValue}>{avgVisitsPerWeek}</span>
          <span style={styles.metricSubText}>Per active member</span>
        </div>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>InBody Scan Rate</span>
          <span style={styles.metricValue}>{inBodyCompletionRate}%</span>
          <span style={styles.metricSubText}>{totalScansCompleted} / {possibleScans} scans done</span>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <button 
          style={filter === "all" ? styles.activeFilterBtn : styles.filterBtn} 
          onClick={() => setFilter("all")}
        >
          All Members ({members.filter(m => m.status !== "cancelled").length})
        </button>
        <button 
          style={filter === "pending" ? styles.activeFilterBtn : styles.filterBtn} 
          onClick={() => setFilter("pending")}
        >
          ⏳ Pending ({pendingMembers.length})
        </button>
        <button 
          style={filter === "active" ? styles.activeFilterBtn : styles.filterBtn} 
          onClick={() => setFilter("active")}
        >
          🔥 Active ({activeMembers.length})
        </button>
        <button 
          style={filter === "high_risk" ? styles.activeFilterBtn : styles.filterBtn} 
          onClick={() => setFilter("high_risk")}
        >
          ⚠️ At Risk ({highRiskMembers.length})
        </button>
      </div>

      {/* Main Table */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>Member Name</th>
              <th style={styles.th}>Week</th>
              <th style={styles.th}>InBody Scans</th>
              <th style={styles.th}>This Wk Visits</th>
              <th style={styles.th}>12-Week Attendance Matrix</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map((member) => {
              const isPending = member.status === "pending";
              const thisWeekVisits = isPending ? 0 : (member.weeklyCheckIns?.[member.currentWeek] || 0);
              const risk = getMemberRiskInfo(thisWeekVisits, member.startDate, member.status);
              const scans = member.inBodyScans || { scan1: false, scan2: false, scan3: false };
              const scanCount = (scans.scan1 ? 1 : 0) + (scans.scan2 ? 1 : 0) + (scans.scan3 ? 1 : 0);

              return (
                <tr 
                  key={member.id} 
                  style={styles.clickableTableRow}
                  onClick={() => handleOpenPersonView(member)}
                >
                  <td style={styles.td}>
                    <div style={styles.memberName}>{member.firstName} {member.lastName}</div>
                    <div style={styles.memberSub}>{member.email || member.phone || "No contact info"}</div>
                  </td>

                  <td style={styles.td}>
                    {isPending ? (
                      <span style={styles.badgePending}>⏳ Pending</span>
                    ) : (
                      <span style={styles.badgeWeek}>Week {member.currentWeek}</span>
                    )}
                  </td>

                  <td style={styles.td}>
                    <span style={scanCount === 3 ? styles.scanCompleteBadge : styles.scanPartialBadge}>
                      {scanCount} / 3 Scans
                    </span>
                  </td>

                  <td style={styles.td}>
                    {isPending ? (
                      <span style={{ fontSize: "12px", color: "#9ca3af", fontStyle: "italic" }}>Not started</span>
                    ) : (
                      <span style={{ backgroundColor: risk.bg, color: risk.color, padding: "3px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: "700" }}>
                        {thisWeekVisits} visits
                      </span>
                    )}
                  </td>

                  <td style={styles.td}>
                    {isPending ? (
                      <span style={styles.waitingText}>Waiting for 1st check-in to start journey</span>
                    ) : (
                      <div style={styles.matrixGrid}>
                        {[...Array(12)].map((_, i) => {
                          const weekNum = i + 1;
                          const count = member.weeklyCheckIns?.[weekNum] || 0;
                          const isCurrent = weekNum === member.currentWeek;

                          let bg = "#e5e7eb";
                          if (count >= 3) bg = "#22c55e";
                          else if (count === 2) bg = "#f59e0b";
                          else if (count === 1) bg = "#ef4444";
                          else if (weekNum < member.currentWeek && count === 0) bg = "#9ca3af";

                          return (
                            <div 
                              key={weekNum} 
                              title={`Week ${weekNum}: ${count} visits`}
                              style={{
                                ...styles.matrixBox,
                                backgroundColor: bg,
                                border: isCurrent ? "2px solid #000" : "1px solid #d1d5db"
                              }}
                            >
                              <span style={styles.matrixText}>{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>

                  <td style={{ ...styles.td, textAlign: "right" }}>
                    <span style={styles.arrowIcon}>→</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* --- PERSON VIEW MODAL --- */}
      {selectedMember && personStats && (
        <div style={styles.modalOverlay} onClick={() => setSelectedMember(null)}>
          <div style={styles.personViewModal} onClick={(e) => e.stopPropagation()}>
            
            <div style={styles.personHeader}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h2 style={{ margin: 0, fontSize: "24px" }}>{selectedMember.firstName} {selectedMember.lastName}</h2>
                  <span style={{ backgroundColor: personStats.riskInfo.bg, color: personStats.riskInfo.color, padding: "4px 10px", borderRadius: "8px", fontSize: "12px", fontWeight: "700" }}>
                    {personStats.riskInfo.label}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0 0", color: "#6b7280", fontSize: "14px" }}>
                  {selectedMember.email} • {selectedMember.phone || "No phone"}
                </p>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedMember(null)}>✕</button>
            </div>

            <div style={styles.progressCard}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                <span>12-Week Journey Progress ({personStats.onboardingProgressPct}%)</span>
                <span>{selectedMember.status === "pending" ? "Pending Start" : `Week ${selectedMember.currentWeek} of 12`}</span>
              </div>
              <div style={styles.progressBarTrack}>
                <div style={{ ...styles.progressBarFill, width: `${personStats.onboardingProgressPct}%` }} />
              </div>
            </div>

            {/* Person View Stats Row */}
            <div style={styles.personStatsRow}>
              <div style={styles.personStatBox}>
                <span style={styles.personStatLabel}>Next Week Starts</span>
                <span style={styles.personStatValue}>{personStats.nextWeekStartDateStr}</span>
                <span style={styles.personStatSubText}>
                  {selectedMember.status === "pending" 
                    ? "Pending 1st visit" 
                    : (personStats.activeWeeks >= 12 ? "12 Wks Completed" : `Week ${personStats.nextWeekNum} in ${personStats.daysUntilNextWeek} days`)}
                </span>
              </div>
              <div style={styles.personStatBox}>
                <span style={styles.personStatLabel}>Total Check-Ins</span>
                <span style={styles.personStatValue}>{personStats.totalAllTimeVisits} visits</span>
                <span style={styles.personStatSubText}>Across all weeks</span>
              </div>
              <div style={styles.personStatBox}>
                <span style={styles.personStatLabel}>Avg Weekly Pace</span>
                <span style={styles.personStatValue}>{personStats.avgWeeklyVisitsPerson} / wk</span>
                <span style={styles.personStatSubText}>Proj. {personStats.projected12WkTotal} visits total</span>
              </div>
              <div style={styles.personStatBox}>
                <span style={styles.personStatLabel}>Time Active</span>
                <span style={styles.personStatValue}>{personStats.daysActive} days</span>
                <span style={styles.personStatSubText}>Since 1st Check-In</span>
              </div>
            </div>

            {/* 3-Month Calendar */}
            <div style={styles.sectionCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", textTransform: "uppercase", color: "#374151" }}>
                  3-Month Onboarding Attendance Calendar
                </h4>
                <div style={{ display: "flex", gap: "12px", fontSize: "11px", fontWeight: "600", color: "#64748b" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "10px", height: "10px", backgroundColor: "#2563eb", borderRadius: "2px", display: "inline-block" }}></span> Week Start (W1-W12)
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "10px", height: "10px", backgroundColor: "#22c55e", borderRadius: "2px", display: "inline-block" }}></span> Visit Day
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "10px", height: "10px", backgroundColor: "#fff", border: "2px solid #2563eb", borderRadius: "2px", display: "inline-block" }}></span> Today
                  </span>
                </div>
              </div>

              {selectedMember.status === "pending" || !selectedMember.startDate ? (
                <div style={{ padding: "16px", backgroundColor: "#eff6ff", borderRadius: "8px", border: "1px solid #bfdbfe", textAlign: "center", color: "#1d4ed8", fontSize: "13px" }}>
                  ⏳ Calendar view will automatically populate here once the member completes their first check-in class.
                </div>
              ) : (
                <div style={styles.calendarGridContainer}>
                  {threeMonthCalendars.map((mObj, mIdx) => (
                    <div key={mIdx} style={styles.calendarMonthCard}>
                      <div style={styles.calendarMonthTitle}>{mObj.monthName}</div>
                      
                      <div style={styles.calendarHeaderRow}>
                        {["S", "M", "T", "W", "T", "F", "S"].map((dayName, dIdx) => (
                          <div key={dIdx} style={styles.calendarHeaderCell}>{dayName}</div>
                        ))}
                      </div>

                      <div style={styles.calendarDaysGrid}>
                        {[...Array(mObj.firstDayOfWeek)].map((_, emptyIdx) => (
                          <div key={`empty-${emptyIdx}`} style={styles.calendarDayEmpty} />
                        ))}

                        {[...Array(mObj.daysInMonth)].map((_, dayIdx) => {
                          const dayNum = dayIdx + 1;
                          const dateKey = `${mObj.year}-${String(mObj.month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                          const hasVisit = checkInDatesSet.has(dateKey);
                          const isToday = dateKey === todayKey;

                          let weekBadgeLabel = null;
                          if (selectedMember.startDate) {
                            const sObj = new Date(selectedMember.startDate);
                            const startLocal = new Date(sObj.getFullYear(), sObj.getMonth(), sObj.getDate());
                            const cellLocal = new Date(mObj.year, mObj.month, dayNum);
                            
                            const diffDays = Math.round((cellLocal - startLocal) / (1000 * 60 * 60 * 24));
                            if (diffDays >= 0 && diffDays < 84) {
                              if (diffDays % 7 === 0) {
                                const wNum = Math.floor(diffDays / 7) + 1;
                                weekBadgeLabel = `W${wNum}`;
                              }
                            }
                          }

                          let cellStyle = { ...styles.calendarDayCell };
                          if (hasVisit) cellStyle = { ...cellStyle, ...styles.calendarDayVisited };
                          if (isToday) cellStyle = { ...cellStyle, ...styles.calendarDayToday };

                          return (
                            <div key={dayNum} style={cellStyle} title={hasVisit ? `Visited on ${dateKey}` : dateKey}>
                              {weekBadgeLabel && (
                                <span style={styles.calendarWeekBadge}>{weekBadgeLabel}</span>
                              )}
                              <span style={{ marginTop: weekBadgeLabel ? "-2px" : "0" }}>{dayNum}</span>
                              {hasVisit && <span style={{ fontSize: "8px", lineHeight: "1" }}>✓</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* InBody Scans */}
            <div style={styles.sectionCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", textTransform: "uppercase", color: "#374151" }}>
                  InBody Scans Checklist
                </h4>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "#16a34a" }}>
                  {personStats.scansCompleted} / 3 Complete ({personStats.scanPct}%)
                </span>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                {["scan1", "scan2", "scan3"].map((scanKey, idx) => {
                  const isDone = selectedMember.inBodyScans?.[scanKey];
                  return (
                    <button
                      key={scanKey}
                      onClick={() => handleToggleScan(selectedMember.id, scanKey)}
                      style={isDone ? styles.scanBoxDone : styles.scanBoxPending}
                    >
                      <span style={{ fontSize: "16px" }}>{isDone ? "✓" : "○"}</span>
                      <span>Scan {idx + 1} {isDone ? "(Done)" : "(Pending)"}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* --- GHL & LOGS MULTI-TAB SECTION --- */}
            <div style={styles.sectionCard}>
              <div style={styles.tabHeaderBar}>
                <button 
                  style={activeTab === "logs" ? styles.tabBtnActive : styles.tabBtn}
                  onClick={() => setActiveTab("logs")}
                >
                  📜 Check-In Logs ({memberCheckIns.length})
                </button>
                <button 
                  style={activeTab === "messages" ? styles.tabBtnActive : styles.tabBtn}
                  onClick={() => setActiveTab("messages")}
                >
                  💬 GHL SMS History ({ghlData.messages.length})
                </button>
                <button 
                  style={activeTab === "notes" ? styles.tabBtnActive : styles.tabBtn}
                  onClick={() => setActiveTab("notes")}
                >
                  📝 GHL Staff Notes ({ghlData.notes.length})
                </button>
                <button 
                  style={activeTab === "appts" ? styles.tabBtnActive : styles.tabBtn}
                  onClick={() => setActiveTab("appts")}
                >
                  📅 GHL Appointments ({ghlData.appointments.length})
                </button>
              </div>

              {/* TAB 1: CHECK-IN LOGS */}
              {activeTab === "logs" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>Raw attendance entries from GHL webhooks & manual logs</span>
                    {selectedMember.status === "active" && (
                      <button style={styles.manualCheckInBtn} onClick={handleAddManualCheckIn}>
                        + Quick Log Check-In
                      </button>
                    )}
                  </div>

                  {loadingHistory ? (
                    <p style={{ color: "#6b7280", fontSize: "13px" }}>Loading logs...</p>
                  ) : memberCheckIns.length === 0 ? (
                    <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "13px" }}>
                      No check-ins logged yet.
                    </p>
                  ) : (
                    <div style={styles.historyLogList}>
                      {memberCheckIns.map((log) => (
                        <div key={log.id} style={styles.historyLogItem}>
                          <div>
                            <div style={{ fontWeight: "600", fontSize: "13px" }}>
                              {new Date(log.timestamp).toLocaleString("en-US", {
                                weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
                              })}
                            </div>
                            <div style={{ fontSize: "11px", color: "#64748b" }}>{log.source || "GHL Webhook"}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={styles.weekPill}>Week {log.weekNumber || 1}</span>
                            <button 
                              style={styles.deleteLogBtn}
                              onClick={() => handleDeleteCheckIn(log)}
                              title="Delete this check-in entry"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: LIVE GHL MESSAGES & 2-WAY SMS SENDING */}
              {activeTab === "messages" && (
                <div>
                  {loadingGhl ? (
                    <p style={{ fontSize: "13px", color: "#64748b" }}>Loading SMS conversation thread from GoHighLevel...</p>
                  ) : ghlData.messages.length === 0 ? (
                    <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "13px" }}>No SMS conversation history found in GHL for this email.</p>
                  ) : (
                    <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column-reverse", gap: "8px", paddingRight: "4px", marginBottom: "12px" }}>
                      {ghlData.messages.map((msg) => {
                        const isOutbound = msg.direction === "outbound";
                        return (
                          <div 
                            key={msg.id || Math.random()} 
                            style={{
                              alignSelf: isOutbound ? "flex-end" : "flex-start",
                              backgroundColor: isOutbound ? "#2563eb" : "#f1f5f9",
                              color: isOutbound ? "#ffffff" : "#0f172a",
                              padding: "8px 12px",
                              borderRadius: "10px",
                              maxWidth: "80%",
                              fontSize: "12px",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                            }}
                          >
                            <div style={{ whiteSpace: "pre-wrap" }}>{msg.body}</div>
                            <div style={{ fontSize: "9px", opacity: 0.7, marginTop: "4px", textAlign: "right" }}>
                              {new Date(msg.dateAdded || msg.date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* SMS Input Box */}
                  {ghlData.contactId ? (
                    <form onSubmit={handleSendGhlSms} style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                      <input 
                        type="text"
                        placeholder="Type text message to send via GHL..."
                        value={newSmsText}
                        onChange={(e) => setNewSmsText(e.target.value)}
                        style={{ ...styles.input, flex: 1 }}
                      />
                      <button 
                        type="submit" 
                        disabled={sendingSms || !newSmsText.trim()}
                        style={{ ...styles.addBtn, opacity: sendingSms || !newSmsText.trim() ? 0.6 : 1 }}
                      >
                        {sendingSms ? "Sending..." : "Send Text 📤"}
                      </button>
                    </form>
                  ) : (
                    <p style={{ fontSize: "11px", color: "#ef4444" }}>Cannot send SMS: GHL Contact ID not resolved.</p>
                  )}
                </div>
              )}

              {/* TAB 3: GHL STAFF NOTES & CREATE NOTE */}
              {activeTab === "notes" && (
                <div>
                  {/* Create Note Input Box */}
                  {ghlData.contactId && (
                    <form onSubmit={handleAddGhlNote} style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                      <input 
                        type="text"
                        placeholder="Add a new coaching / staff note to GHL..."
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        style={{ ...styles.input, flex: 1 }}
                      />
                      <button 
                        type="submit" 
                        disabled={addingNote || !newNoteText.trim()}
                        style={{ ...styles.manualCheckInBtn, opacity: addingNote || !newNoteText.trim() ? 0.6 : 1 }}
                      >
                        {addingNote ? "Adding..." : "+ Add Staff Note"}
                      </button>
                    </form>
                  )}

                  {loadingGhl ? (
                    <p style={{ fontSize: "13px", color: "#64748b" }}>Loading staff notes from GoHighLevel...</p>
                  ) : ghlData.notes.length === 0 ? (
                    <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "13px" }}>No coaching/staff notes recorded in GHL.</p>
                  ) : (
                    <div style={{ maxHeight: "180px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                      {ghlData.notes.map((note) => (
                        <div key={note.id} style={{ padding: "12px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                          <div style={{ fontSize: "13px", color: "#0f172a", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>
                            {stripHtml(note.body)}
                          </div>
                          <div style={{ fontSize: "10px", color: "#64748b", marginTop: "6px", fontWeight: "600" }}>
                            Added on {new Date(note.dateAdded || note.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: GHL APPOINTMENTS */}
              {activeTab === "appts" && (
                <div>
                  {loadingGhl ? (
                    <p style={{ fontSize: "13px", color: "#64748b" }}>Loading booked calendar appointments from GoHighLevel...</p>
                  ) : ghlData.appointments.length === 0 ? (
                    <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "13px" }}>No calendar appointments found in GHL.</p>
                  ) : (
                    <div style={{ maxHeight: "220px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                      {ghlData.appointments.map((appt) => (
                        <div key={appt.id} style={{ padding: "10px 12px", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: "700", fontSize: "13px", color: "#1e40af" }}>{appt.title || appt.name || appt.calendarName || "Coaching / Review Session"}</div>
                            <div style={{ fontSize: "11px", color: "#3b82f6", marginTop: "2px" }}>
                              {new Date(appt.startTime || appt.start || appt.dateAdded).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            </div>
                          </div>
                          <span style={{ backgroundColor: (appt.appointmentStatus === "confirmed" || appt.status === "confirmed") ? "#dcfce7" : "#fef3c7", color: (appt.appointmentStatus === "confirmed" || appt.status === "confirmed") ? "#15803d" : "#d97706", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", textTransform: "capitalize" }}>
                            {appt.appointmentStatus || appt.status || "Booked"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Edit Settings */}
            <div style={styles.sectionCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", textTransform: "uppercase", color: "#374151" }}>
                  Member Settings & Manual Adjustments
                </h4>
                <button 
                  style={styles.secondaryBtn} 
                  onClick={() => setIsEditing(!isEditing)}
                >
                  {isEditing ? "Cancel Edit" : "Edit Settings & Check-Ins"}
                </button>
              </div>

              {isEditing ? (
                <form onSubmit={handleSavePersonEdits} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={styles.formGrid}>
                    <div>
                      <label style={styles.label}>First Name</label>
                      <input 
                        style={styles.input}
                        type="text" 
                        value={editFormData.firstName || ""} 
                        onChange={e => setEditFormData({...editFormData, firstName: e.target.value})}
                      />
                    </div>
                    <div>
                      <label style={styles.label}>Last Name</label>
                      <input 
                        style={styles.input}
                        type="text" 
                        value={editFormData.lastName || ""} 
                        onChange={e => setEditFormData({...editFormData, lastName: e.target.value})}
                      />
                    </div>
                    <div>
                      <label style={styles.label}>Email</label>
                      <input 
                        style={styles.input}
                        type="email" 
                        value={editFormData.email || ""} 
                        onChange={e => setEditFormData({...editFormData, email: e.target.value})}
                      />
                    </div>
                    <div>
                      <label style={styles.label}>Phone</label>
                      <input 
                        style={styles.input}
                        type="text" 
                        value={editFormData.phone || ""} 
                        onChange={e => setEditFormData({...editFormData, phone: e.target.value})}
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Date Added (App Signup)</label>
                      <input 
                        style={styles.input}
                        type="date" 
                        value={editFormData.dateAddedFormatted || ""} 
                        onChange={e => setEditFormData({...editFormData, dateAddedFormatted: e.target.value})}
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Start Date (1st Check-In)</label>
                      <input 
                        style={styles.input}
                        type="date" 
                        value={editFormData.startDateFormatted || ""} 
                        onChange={e => setEditFormData({...editFormData, startDateFormatted: e.target.value})}
                      />
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <label style={styles.label}>Status</label>
                      <select 
                        style={styles.input}
                        value={editFormData.status || "pending"}
                        onChange={e => setEditFormData({...editFormData, status: e.target.value})}
                      >
                        <option value="pending">⏳ Pending (Waiting for 1st check-in)</option>
                        <option value="active">🔥 Active Onboarding</option>
                        <option value="graduated">Graduated (Completed 12 Wks)</option>
                        <option value="cancelled">Cancelled / Quit</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ backgroundColor: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <label style={{ ...styles.label, display: "block", marginBottom: "8px" }}>
                      Adjust Weekly Check-In Counts (Weeks 1 to 12)
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px" }}>
                      {[...Array(12)].map((_, i) => {
                        const wNum = i + 1;
                        return (
                          <div key={wNum} style={{ textAlign: "center" }}>
                            <span style={{ fontSize: "10px", fontWeight: "700", color: "#64748b" }}>Wk {wNum}</span>
                            <input 
                              type="number"
                              min="0"
                              style={{ width: "100%", padding: "4px", borderRadius: "4px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}
                              value={editFormData.weeklyCheckIns?.[wNum] ?? 0}
                              onChange={e => {
                                const val = parseInt(e.target.value, 10) || 0;
                                setEditFormData({
                                  ...editFormData,
                                  weeklyCheckIns: {
                                    ...(editFormData.weeklyCheckIns || {}),
                                    [wNum]: val
                                  }
                                });
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
                    <button type="submit" style={styles.saveBtn}>Save All Settings & Check-Ins</button>
                  </div>
                </form>
              ) : (
                <div style={{ fontSize: "13px", color: "#6b7280" }}>
                  Status: <strong>{selectedMember.status}</strong> • Current Onboarding Week: <strong>Week {selectedMember.currentWeek}</strong>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "1px solid #e5e7eb" }}>
              <span style={{ fontSize: "12px", color: "#9ca3af" }}>Member ID: {selectedMember.id}</span>
              <button 
                style={styles.deleteBtn}
                onClick={() => handleDeleteMember(selectedMember.id)}
              >
                Delete Member
              </button>
            </div>

          </div>
        </div>
      )}

      {/* --- ADD MEMBER MODAL --- */}
      {showAddModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Add New Member</h3>
            <form onSubmit={handleAddMember} style={styles.form}>
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>First Name *</label>
                  <input 
                    style={styles.input}
                    type="text" 
                    required
                    value={newMember.firstName} 
                    onChange={e => setNewMember({...newMember, firstName: e.target.value})}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Last Name</label>
                  <input 
                    style={styles.input}
                    type="text" 
                    value={newMember.lastName} 
                    onChange={e => setNewMember({...newMember, lastName: e.target.value})}
                  />
                </div>
              </div>

              <label style={styles.label}>Email</label>
              <input 
                style={styles.input}
                type="email" 
                value={newMember.email} 
                onChange={e => setNewMember({...newMember, email: e.target.value})}
              />

              <label style={styles.label}>Phone</label>
              <input 
                style={styles.input}
                type="text" 
                value={newMember.phone} 
                onChange={e => setNewMember({...newMember, phone: e.target.value})}
              />

              <label style={styles.label}>Date Added (App Signup)</label>
              <input 
                style={styles.input}
                type="date" 
                value={newMember.dateAdded} 
                onChange={e => setNewMember({...newMember, dateAdded: e.target.value})}
              />

              <label style={styles.label}>InBody Scans Completed</label>
              <div style={{ display: "flex", gap: "12px", margin: "4px 0" }}>
                <label style={{ fontSize: "13px" }}>
                  <input 
                    type="checkbox" 
                    checked={newMember.scan1} 
                    onChange={e => setNewMember({...newMember, scan1: e.target.checked})}
                  /> Scan 1
                </label>
                <label style={{ fontSize: "13px" }}>
                  <input 
                    type="checkbox" 
                    checked={newMember.scan2} 
                    onChange={e => setNewMember({...newMember, scan2: e.target.checked})}
                  /> Scan 2
                </label>
                <label style={{ fontSize: "13px" }}>
                  <input 
                    type="checkbox" 
                    checked={newMember.scan3} 
                    onChange={e => setNewMember({...newMember, scan3: e.target.checked})}
                  /> Scan 3
                </label>
              </div>

              <label style={styles.label}>Status</label>
              <select 
                style={styles.input}
                value={newMember.status}
                onChange={e => setNewMember({...newMember, status: e.target.value})}
              >
                <option value="pending">⏳ Pending (Waiting for 1st check-in)</option>
                <option value="active">🔥 Active (Already started onboarding)</option>
              </select>

              {newMember.status === "active" && (
                <>
                  <label style={styles.label}>Start Date (1st Check-In)</label>
                  <input 
                    style={styles.input}
                    type="date" 
                    value={newMember.startDate} 
                    onChange={e => setNewMember({...newMember, startDate: e.target.value})}
                  />

                  <label style={styles.label}>Total Check-Ins To Date</label>
                  <input 
                    style={styles.input}
                    type="number" 
                    min="0"
                    placeholder="e.g. 8"
                    value={newMember.totalCheckIns} 
                    onChange={e => setNewMember({...newMember, totalCheckIns: e.target.value})}
                  />
                </>
              )}

              <div style={styles.modalActions}>
                <button type="submit" style={styles.saveBtn}>Add Member</button>
                <button type="button" style={styles.cancelBtn} onClick={() => setShowAddModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline Styling System
const styles = {
  // Lock Screen Styles
  lockScreenContainer: { display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#0f172a", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  lockCard: { backgroundColor: "#1e293b", padding: "36px", borderRadius: "16px", border: "1px solid #334155", textAlign: "center", width: "360px", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)" },
  lockIcon: { fontSize: "40px", marginBottom: "12px" },
  lockTitle: { color: "#f8fafc", fontSize: "22px", fontWeight: "800", margin: "0 0 6px 0" },
  lockSubtitle: { color: "#94a3b8", fontSize: "13px", margin: "0 0 24px 0" },
  lockForm: { display: "flex", flexDirection: "column", gap: "12px" },
  lockInput: { padding: "12px 14px", borderRadius: "8px", border: "1px solid #475569", backgroundColor: "#0f172a", color: "#fff", fontSize: "14px", outline: "none", textAlign: "center" },
  lockInputError: { padding: "12px 14px", borderRadius: "8px", border: "1px solid #ef4444", backgroundColor: "#0f172a", color: "#fff", fontSize: "14px", outline: "none", textAlign: "center" },
  errorText: { color: "#f87171", fontSize: "12px", margin: "0" },
  lockBtn: { padding: "12px", borderRadius: "8px", border: "none", backgroundColor: "#2563eb", color: "#fff", fontWeight: "700", cursor: "pointer", fontSize: "14px" },

  // Dashboard Styles
  container: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", padding: "24px", backgroundColor: "#f8fafc", minHeight: "100vh" },
  loadingContainer: { display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" },
  title: { fontSize: "26px", fontWeight: "800", color: "#0f172a", margin: 0 },
  subtitle: { fontSize: "14px", color: "#64748b", marginTop: "4px", margin: 0 },
  addBtn: { backgroundColor: "#2563eb", color: "#fff", padding: "10px 18px", borderRadius: "8px", border: "none", fontWeight: "600", cursor: "pointer" },
  logoutBtn: { backgroundColor: "#334155", color: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "none", fontWeight: "600", cursor: "pointer" },
  metricsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "20px" },
  metricCard: { backgroundColor: "#fff", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column" },
  metricLabel: { fontSize: "12px", color: "#64748b", fontWeight: "600" },
  metricValue: { fontSize: "28px", fontWeight: "800", color: "#0f172a", marginTop: "4px" },
  metricSubText: { fontSize: "11px", color: "#94a3b8", marginTop: "2px" },
  filterBar: { display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" },
  filterBtn: { padding: "8px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#fff", cursor: "pointer", fontSize: "13px" },
  activeFilterBtn: { padding: "8px 14px", borderRadius: "8px", border: "none", backgroundColor: "#2563eb", color: "#fff", fontWeight: "600", cursor: "pointer", fontSize: "13px" },
  tableContainer: { backgroundColor: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
  tableHeader: { backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" },
  th: { padding: "12px 16px", fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase" },
  clickableTableRow: { borderBottom: "1px solid #f1f5f9", cursor: "pointer", transition: "background-color 0.15s" },
  td: { padding: "14px 16px", verticalAlign: "middle" },
  memberName: { fontWeight: "600", color: "#0f172a", fontSize: "14px" },
  memberSub: { fontSize: "12px", color: "#64748b" },
  badgePending: { backgroundColor: "#eff6ff", color: "#1d4ed8", padding: "3px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: "600" },
  badgeWeek: { backgroundColor: "#f1f5f9", color: "#334155", padding: "3px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: "600" },
  scanCompleteBadge: { backgroundColor: "#dcfce7", color: "#15803d", padding: "3px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: "600" },
  scanPartialBadge: { backgroundColor: "#f8fafc", color: "#64748b", border: "1px solid #cbd5e1", padding: "3px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: "500" },
  waitingText: { fontSize: "12px", color: "#94a3b8", fontStyle: "italic" },
  matrixGrid: { display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "4px", width: "260px" },
  matrixBox: { width: "18px", height: "22px", borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center" },
  matrixText: { fontSize: "10px", fontWeight: "700", color: "#fff" },
  arrowIcon: { fontSize: "16px", color: "#cbd5e1", fontWeight: "bold" },
  
  // Person View Modal Styles
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15, 23, 42, 0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 },
  personViewModal: { backgroundColor: "#fff", borderRadius: "12px", width: "720px", maxWidth: "95%", maxHeight: "90vh", overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" },
  personHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "12px", borderBottom: "1px solid #e2e8f0" },
  closeBtn: { background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#64748b" },
  progressCard: { backgroundColor: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0" },
  progressBarTrack: { backgroundColor: "#e2e8f0", height: "8px", borderRadius: "4px", overflow: "hidden" },
  progressBarFill: { backgroundColor: "#2563eb", height: "100%", borderRadius: "4px", transition: "width 0.3s ease" },
  personStatsRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" },
  personStatBox: { backgroundColor: "#f8fafc", padding: "10px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column" },
  personStatLabel: { fontSize: "10px", color: "#64748b", textTransform: "uppercase", fontWeight: "700" },
  personStatValue: { fontSize: "15px", fontWeight: "800", color: "#0f172a", marginTop: "2px" },
  personStatSubText: { fontSize: "10px", color: "#94a3b8", marginTop: "2px" },
  sectionCard: { backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" },
  
  // Calendar Styles
  calendarGridContainer: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" },
  calendarMonthCard: { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px" },
  calendarMonthTitle: { fontSize: "12px", fontWeight: "700", color: "#0f172a", marginBottom: "8px", textAlign: "center" },
  calendarHeaderRow: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" },
  calendarHeaderCell: { fontSize: "9px", fontWeight: "700", color: "#64748b", textAlign: "center" },
  calendarDaysGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" },
  calendarDayEmpty: { height: "26px" },
  calendarDayCell: { position: "relative", height: "26px", borderRadius: "3px", backgroundColor: "#fff", border: "1px solid #e2e8f0", fontSize: "10px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#475569" },
  calendarDayVisited: { backgroundColor: "#22c55e", color: "#fff", fontWeight: "bold", border: "none" },
  calendarDayToday: { border: "2px solid #2563eb", fontWeight: "bold" },
  calendarWeekBadge: { position: "absolute", top: "1px", left: "2px", fontSize: "7px", fontWeight: "800", color: "#2563eb", backgroundColor: "#eff6ff", borderRadius: "2px", padding: "0 2px" },

  // Tabs System Styles
  tabHeaderBar: { display: "flex", gap: "6px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px", marginBottom: "12px", overflowX: "auto" },
  tabBtn: { padding: "6px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", backgroundColor: "#f8fafc", color: "#475569", fontSize: "12px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" },
  tabBtnActive: { padding: "6px 12px", borderRadius: "6px", border: "none", backgroundColor: "#2563eb", color: "#ffffff", fontSize: "12px", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" },

  scanBoxDone: { flex: 1, backgroundColor: "#dcfce7", color: "#15803d", border: "1px solid #86efac", padding: "10px", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontWeight: "600", fontSize: "13px" },
  scanBoxPending: { flex: 1, backgroundColor: "#f8fafc", color: "#64748b", border: "1px solid #cbd5e1", padding: "10px", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontWeight: "500", fontSize: "13px" },
  historyLogList: { maxHeight: "180px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" },
  historyLogItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", backgroundColor: "#f8fafc", borderRadius: "6px", border: "1px solid #f1f5f9" },
  weekPill: { backgroundColor: "#e0e7ff", color: "#3730a3", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "700" },
  deleteLogBtn: { background: "none", border: "none", cursor: "pointer", fontSize: "14px", padding: "2px 4px", opacity: 0.8 },
  manualCheckInBtn: { backgroundColor: "#16a34a", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer" },
  secondaryBtn: { backgroundColor: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" },
  deleteBtn: { backgroundColor: "#ef4444", color: "#fff", border: "none", padding: "8px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" },
  form: { display: "flex", flexDirection: "column", gap: "10px" },
  label: { fontSize: "11px", fontWeight: "600", color: "#475569" },
  input: { padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" },
  modalContent: { backgroundColor: "#fff", padding: "24px", borderRadius: "12px", width: "420px", maxWidth: "90%" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" },
  saveBtn: { padding: "8px 16px", borderRadius: "6px", backgroundColor: "#2563eb", color: "#fff", border: "none", cursor: "pointer", fontWeight: "600" },
  cancelBtn: { padding: "8px 16px", borderRadius: "6px", backgroundColor: "#e2e8f0", color: "#334155", border: "none", cursor: "pointer" }
};