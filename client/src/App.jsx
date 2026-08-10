import React, { useState, useEffect } from "react";
import { 
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
  signInAnonymously, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";

import { db, auth } from "./firebase";

import { 
  stripHtml, 
  calculateWeekFromDate, 
  getMemberRiskInfo, 
  generateThreeMonthCalendar 
} from "./utils/helpers";

import Login from "./components/Login";
import AddMemberModal from "./components/AddMemberModal";
import MemberDetailModal from "./components/MemberDetailModal";

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
    <Login
      passwordInput={passwordInput}
      setPasswordInput={setPasswordInput}
      passwordError={passwordError}
      onSubmit={handleLoginSubmit}
    />
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
   {selectedMember && (
  <MemberDetailModal
    selectedMember={selectedMember}
    personStats={personStats}
    memberCheckIns={memberCheckIns}
    loadingHistory={loadingHistory}
    isEditing={isEditing}
    setIsEditing={setIsEditing}
    editFormData={editFormData}
    setEditFormData={setEditFormData}
    activeTab={activeTab}
    setActiveTab={setActiveTab}
    ghlData={ghlData}
    loadingGhl={loadingGhl}
    newNoteText={newNoteText}
    setNewNoteText={setNewNoteText}
    addingNote={addingNote}
    newSmsText={newSmsText}
    setNewSmsText={setNewSmsText}
    sendingSms={sendingSms}
    checkInDatesSet={checkInDatesSet}
    threeMonthCalendars={threeMonthCalendars}
    onClose={() => setSelectedMember(null)}
    onManualCheckIn={handleAddManualCheckIn}
    onDeleteLog={handleDeleteCheckIn}
    onAddNote={handleAddGhlNote}
    onSendSms={handleSendGhlSms}
    onSaveEdit={handleSavePersonEdits}
    onDeleteMember={handleDeleteMember}
    onToggleScan={handleToggleScan}
  />
)}

      {/* --- ADD MEMBER MODAL --- */}
     {showAddModal && (
  <AddMemberModal
    newMember={newMember}
    setNewMember={setNewMember}
    onSubmit={handleAddMember}
    onClose={() => setShowAddModal(false)}
  />
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