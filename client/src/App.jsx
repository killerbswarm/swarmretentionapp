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
  localNoonFromStart,
  localDaysSinceStart, 
  generateThreeMonthCalendar 
} from "./utils/helpers";

import Login from "./components/Login";
import AddMemberModal from "./components/AddMemberModal";
import MemberDetailModal from "./components/MemberDetailModal";
import { storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import AtRiskDetailModal from "./components/AtRiskDetailModal";
import AddAtRiskModal from "./components/AddAtRiskModal";
import AppVersion from "./components/AppVersion";
import { checkinsDb, collection as masterCol, onSnapshot as masterOnSnapshot, query as masterQuery, where as masterWhere } from "./checkinsFirebase";

// Master check-in service (swarm-checkins)
const CHECKINS_API = "https://us-central1-swarm-checkins-5436d.cloudfunctions.net";

/** CHIP times like "6:15", "5:0", "5:00", "6:15 AM" → {h, m} */
function parseClassTime(raw) {
  if (!raw && raw !== 0) return null;
  const s = String(raw).trim();
  const ampm = s.match(/\s*(am|pm)$/i);
  const core = s.replace(/\s*(am|pm)$/i, "").trim();
  const parts = core.split(":");
  if (!parts.length) return null;
  let h = parseInt(parts[0], 10);
  let m = parseInt(parts[1] || "0", 10);
  if (isNaN(h)) return null;
  if (isNaN(m)) m = 0;
  if (ampm) {
    const ap = ampm[1].toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  }
  return { h, m };
}

function timestampFromClass(classDate, classTime) {
  if (!classDate) return null;
  const t = parseClassTime(classTime);
  if (!t) return `${classDate}T12:00:00`;
  return `${classDate}T${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}:00`;
}

function weekNumberFromStart(startDateStr, classDate) {
  if (!startDateStr || !classDate) return null;
  const start = new Date(startDateStr);
  const day = new Date(`${classDate}T12:00:00`);
  if (isNaN(start) || isNaN(day)) return null;
  start.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((day - start) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 1;
  return Math.min(12, Math.max(1, Math.floor(diffDays / 7) + 1));
}

function mapMasterCheckin(c, startDateStr) {
  const classDate = c.classDate || null;
  return {
    id: c.id,
    email: c.email,
    classDate,
    className: c.className,
    classTime: c.classTime,
    totalAttendanceCount: c.totalAttendanceCount,
    timestamp: timestampFromClass(classDate, c.classTime),
    weekNumber: weekNumberFromStart(startDateStr, classDate),
    source: "swarm-checkins",
    _dateKey: classDate
  };
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
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [showAddModal, setShowAddModal] = useState(false);
  const [atRiskMembers, setAtRiskMembers] = useState([]);
  const [mainTab, setMainTab] = useState("twelve_week"); // "twelve_week" | "at_risk"
  const [selectedAtRiskMember, setSelectedAtRiskMember] = useState(null);
  const [showAddAtRiskModal, setShowAddAtRiskModal] = useState(false);
  const [sendAsInternal, setSendAsInternal] = useState(false);

  // Person View Modal State
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberCheckIns, setMemberCheckIns] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // Live map from swarm-checkins: email -> { dates: string[], lastDate, lastClassName, lastClassTime, totalAttendanceCount }
  const [masterByEmail, setMasterByEmail] = useState({});
  // Local check_ins dates by email (for week counts during transition)
  const [localDatesByEmail, setLocalDatesByEmail] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});

  // GHL Sync State inside Person View
  const [activeTab, setActiveTab] = useState("calendar");
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

async function compressImage(file, maxWidth = 800, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      // Scale down
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Compression failed"));
            return;
          }
          const compressedFile = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, ".jpg"),
            { type: "image/jpeg", lastModified: Date.now() }
          );
          resolve(compressedFile);
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}
  useEffect(() => {
  if (!selectedAtRiskMember) return;
  const fresh = atRiskMembers.find((m) => m.id === selectedAtRiskMember.id);
  if (fresh) setSelectedAtRiskMember(fresh);
}, [atRiskMembers]);


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

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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

  // Real-time At Risk members
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = onSnapshot(
      collection(db, "atRiskMembers"),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setAtRiskMembers(data);
      },
      (error) => console.error("At Risk sync error:", error)
    );

  return () => unsubscribe();
}, [isAuthenticated]);

  const [smsFile, setSmsFile] = useState(null);          // the selected File object
  const [smsFilePreview, setSmsFilePreview] = useState(null); // local preview URL
  // Open Person View, fetch Firestore logs and live GHL data
  const handleOpenPersonView = async (member) => {
    setSelectedMember(member);
    setActiveTab("calendar");
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
      // 1) Local retention check_ins (existing)
      const checkInsRef = collection(db, "check_ins");
      const q = query(checkInsRef, where("memberId", "==", member.id));
      const querySnapshot = await getDocs(q);
      const localHistory = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data(), source: doc.data().source || "local" }))
        .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

      // 2) Master swarm-checkins by email
      let masterHistory = [];
      if (member.email) {
        try {
          const res = await fetch(
            `${CHECKINS_API}/getCheckins?email=${encodeURIComponent(member.email.toLowerCase())}`
          );
          if (res.ok) {
            const data = await res.json();
            masterHistory = (data.checkins || []).map(c =>
              mapMasterCheckin(c, member.startDate)
            );
          }
        } catch (apiErr) {
          console.error("Master check-ins API error:", apiErr);
        }
      }

      // Merge: prefer unique dates; master + local
      const byDate = new Map();
      [...localHistory, ...masterHistory].forEach(item => {
        let key = null;
        if (item.classDate) key = item.classDate;
        else if (item.timestamp) {
          const d = new Date(item.timestamp);
          if (!isNaN(d)) {
            key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          }
        }
        if (!key) return;
        const existing = byDate.get(key);
        if (!existing) {
          byDate.set(key, { ...item, _dateKey: key });
        } else if (item.source === "swarm-checkins") {
          const hasTime = !!parseClassTime(item.classTime);
          byDate.set(key, {
            ...item,
            _dateKey: key,
            timestamp: hasTime ? item.timestamp : (existing.timestamp || item.timestamp),
            weekNumber: item.weekNumber || existing.weekNumber
          });
        }
      });

      const history = Array.from(byDate.values()).sort((a, b) =>
        (b._dateKey || "").localeCompare(a._dateKey || "")
      );

      setMemberCheckIns(history);
    } catch (err) {
      console.error("Error fetching check-in history:", err);
    } finally {
      setLoadingHistory(false);
    }

    fetchGhlDetails(member);
  };




  // Load local check_ins dates once (merge with master for accurate week counts)
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "check_ins"));
        const map = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          const email = (data.email || "").toLowerCase().trim();
          let key = null;
          if (data.classDate) key = data.classDate;
          else if (data.timestamp) {
            const dt = new Date(data.timestamp);
            if (!isNaN(dt)) {
              key = [
                dt.getFullYear(),
                String(dt.getMonth() + 1).padStart(2, "0"),
                String(dt.getDate()).padStart(2, "0")
              ].join("-");
            }
          }
          if (!key) return;
          // prefer email key; also index by memberId for fallback
          if (email) {
            if (!map[email]) map[email] = new Set();
            map[email].add(key);
          }
          if (data.memberId) {
            const mk = `id:${data.memberId}`;
            if (!map[mk]) map[mk] = new Set();
            map[mk].add(key);
          }
        });
        const out = {};
        Object.keys(map).forEach((k) => {
          out[k] = Array.from(map[k]).sort();
        });
        setLocalDatesByEmail(out);
      } catch (err) {
        console.error("Local check_ins load error:", err);
      }
    })();
  }, [isAuthenticated]);

  // Dashboard-wide live listener: all check-ins from master
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsub = masterOnSnapshot(
      masterCol(checkinsDb, "checkins"),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          const c = d.data();
          const email = (c.email || "").toLowerCase();
          if (!email || !c.classDate) return;
          if (!map[email]) {
            map[email] = {
              dates: [],
              lastDate: c.classDate,
              lastClassName: c.className || "",
              lastClassTime: c.classTime || "",
              totalAttendanceCount: c.totalAttendanceCount ?? null
            };
          }
          map[email].dates.push(c.classDate);
          if (c.classDate >= map[email].lastDate) {
            map[email].lastDate = c.classDate;
            map[email].lastClassName = c.className || "";
            map[email].lastClassTime = c.classTime || "";
            if (c.totalAttendanceCount != null) {
              map[email].totalAttendanceCount = c.totalAttendanceCount;
            }
          }
        });
        // sort dates unique
        Object.keys(map).forEach((email) => {
          map[email].dates = Array.from(new Set(map[email].dates)).sort();
        });
        setMasterByEmail(map);
      },
      (err) => console.error("Dashboard master check-ins listener:", err)
    );

    return () => unsub();
  }, [isAuthenticated]);


  // Auto-remove from At Risk when master shows a check-in on/after the day they were flagged (or today)
  useEffect(() => {
    if (!isAuthenticated || !atRiskMembers.length) return;
    if (!masterByEmail || Object.keys(masterByEmail).length === 0) return;

    const today = new Date();
    const todayKey = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("-");

    (async () => {
      for (const member of atRiskMembers) {
        const email = (member.email || "").toLowerCase();
        if (!email) continue;
        const entry = masterByEmail[email];
        if (!entry?.lastDate) continue;

        let threshold = todayKey;
        if (member.atRiskSince) {
          const d = new Date(member.atRiskSince);
          if (!isNaN(d)) {
            threshold = [
              d.getFullYear(),
              String(d.getMonth() + 1).padStart(2, "0"),
              String(d.getDate()).padStart(2, "0")
            ].join("-");
          }
        }

        // Checked in on or after being marked at risk (or at least today)
        if (entry.lastDate >= threshold || entry.lastDate >= todayKey) {
          try {
            await deleteDoc(doc(db, "atRiskMembers", member.id));
            console.log(`At Risk cleared: ${member.firstName || ""} ${member.lastName || ""} (${email}) — check-in ${entry.lastDate}`);
          } catch (err) {
            console.error("Failed to clear At Risk:", err);
          }
        }
      }
    })();
  }, [isAuthenticated, masterByEmail, atRiskMembers]);

  // Live updates from swarm-checkins while a member is open
  useEffect(() => {
    if (!selectedMember?.email) return;

    const email = selectedMember.email.toLowerCase();
    const q = masterQuery(masterCol(checkinsDb, "checkins"), masterWhere("email", "==", email));

    const unsub = masterOnSnapshot(q, (snap) => {
      const masterHistory = snap.docs.map(d =>
        mapMasterCheckin({ id: d.id, ...d.data() }, selectedMember.startDate)
      );

      setMemberCheckIns(prev => {
        const byDate = new Map();
        // keep local logs
        (prev || []).forEach(item => {
          if (item.source === "swarm-checkins") return;
          let key = item.classDate || item._dateKey;
          if (!key && item.timestamp) {
            const d = new Date(item.timestamp);
            if (!isNaN(d)) {
              key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            }
          }
          if (key) byDate.set(key, { ...item, _dateKey: key });
        });
        masterHistory.forEach(item => {
          if (!item._dateKey) return;
          const existing = byDate.get(item._dateKey);
          const hasTime = !!parseClassTime(item.classTime);
          byDate.set(item._dateKey, {
            ...item,
            timestamp: hasTime ? item.timestamp : (existing?.timestamp || item.timestamp),
            weekNumber: item.weekNumber || existing?.weekNumber
          });
        });
        return Array.from(byDate.values()).sort((a, b) =>
          (b._dateKey || "").localeCompare(a._dateKey || "")
        );
      });
    }, (err) => console.error("Master check-ins listener:", err));

    return () => unsub();
  }, [selectedMember?.id, selectedMember?.email]);


  // Handler: Create Staff Note in GHL
  const handleAddGhlNote = async (e) => {
    e.preventDefault();
    if (!newNoteText.trim() || !ghlData.contactId) return;

    setAddingNote(true);
    try {
      // ========== PUT THE NEW CODE HERE ==========
  let attachments = [];

if (smsFile) {
  let compressed = await compressImage(smsFile, 600, 0.45);

  // Keep compressing harder if still too big
  let attempts = 0;
  while (compressed.size > 2.8 * 1024 * 1024 && attempts < 3) {
    attempts++;
    console.log(`Still too big (${(compressed.size / 1024 / 1024).toFixed(2)} MB), compressing more... attempt ${attempts}`);
    compressed = await compressImage(compressed, 500 - (attempts * 50), 0.35);
  }

  console.log("Final size:", (compressed.size / 1024 / 1024).toFixed(2), "MB");

  if (compressed.size > 3 * 1024 * 1024) {
    alert(`Image is still too large (${(compressed.size / 1024 / 1024).toFixed(1)} MB) even after compression.`);
    setSendingSms(false);
    return;
  }

  const fileRef = ref(storage, `sms-media/${ghlData.contactId}/${Date.now()}_photo.jpg`);
  await uploadBytes(fileRef, compressed);
  const downloadURL = await getDownloadURL(fileRef);
  attachments.push(downloadURL);
}
    // ========== END OF NEW CODE ==========
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
  if (sendAsInternal) {
  if (!newSmsText.trim() || !ghlData.contactId) return;

  setSendingSms(true);
  try {
    const res = await fetch(
      "https://us-central1-swarm-12-week-startup.cloudfunctions.net/sendGhlInternalComment",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: ghlData.contactId,
          message: newSmsText.trim(),
        }),
      }
    );
    const data = await res.json();

    if (res.ok && data.success) {
      setNewSmsText("");
      setSendAsInternal(false);
      await fetchGhlDetails(selectedMember); // your existing refresh
    } else {
      alert(data.error || "Failed to post internal comment");
    }
  } catch (err) {
    console.error(err);
    alert("Error posting internal comment");
  } finally {
    setSendingSms(false);
  }
  return;
}

// ... existing normal SMS logic stays below
  if ((!newSmsText.trim() && !smsFile) || !ghlData.contactId) return;

  setSendingSms(true);
  try {
    let attachments = [];

    // Upload photo to Firebase Storage if one is selected
   if (smsFile) {
  // First pass
  let compressed = await compressImage(smsFile, 700, 0.55);
  console.log(`Pass 1: ${(compressed.size / 1024 / 1024).toFixed(2)} MB`);

  // Keep compressing if still too big
  let attempt = 1;
  while (compressed.size > 2.5 * 1024 * 1024 && attempt < 4) {
    attempt++;
    const newWidth = 600 - (attempt * 50);
    const newQuality = 0.45 - (attempt * 0.05);
    compressed = await compressImage(compressed, Math.max(newWidth, 400), Math.max(newQuality, 0.3));
    console.log(`Pass ${attempt}: ${(compressed.size / 1024 / 1024).toFixed(2)} MB`);
  }

  console.log("Final compressed size:", (compressed.size / 1024 / 1024).toFixed(2), "MB");

  if (compressed.size > 3 * 1024 * 1024) {
    alert(`Image is still too large (${(compressed.size / 1024 / 1024).toFixed(1)} MB) after compression.`);
    setSendingSms(false);
    return;
  }

  const fileRef = ref(storage, `sms-media/${ghlData.contactId}/${Date.now()}_photo.jpg`);
  await uploadBytes(fileRef, compressed);
  const downloadURL = await getDownloadURL(fileRef);
  attachments.push(downloadURL);
}

    const res = await fetch("https://us-central1-swarm-12-week-startup.cloudfunctions.net/sendGhlSms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: ghlData.contactId,
        message: newSmsText.trim() || "",
        attachments: attachments.length > 0 ? attachments : undefined
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      setNewSmsText("");
      setSmsFile(null);
      setSmsFilePreview(null);
      await fetchGhlDetails(selectedMember); // refresh conversation
    } else {
      alert(`Failed to send SMS: ${data.error || "Check GHL SMS scopes"}`);
    }
  } catch (err) {
    console.error("Error sending GHL SMS:", err);
    alert("Error connecting to server or uploading image.");
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
const handleAddManualCheckIn = async (dateKey) => {
  if (!selectedMember) return;
  if (dateKey && typeof dateKey !== "string") dateKey = null;

  const now = new Date();
  let when = now;
  if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    const [y, mo, d] = dateKey.split("-").map(Number);
    when = new Date(y, mo - 1, d, 12, 0, 0);
  }
  const memberRef = doc(db, "members", selectedMember.id);

  try {
    // First check-in for a pending member (same as webhook)
    if (selectedMember.status === "pending") {
      const memberData = {
        startDate: when.toISOString(),
        currentWeek: 1,
        weekOverride: null,
        status: "active",
        weeklyCheckIns: { 1: 1 },
        lastCheckIn: now.toISOString(),
        riskLevel: "high",
      };

      await updateDoc(memberRef, memberData);

      const newLog = {
        memberId: selectedMember.id,
        email: selectedMember.email || "",
        timestamp: when.toISOString(),
        classDate: dateKey || when.toISOString().slice(0, 10),
        weekNumber: 1,
        source: "Manual Check-In (Dashboard)",
      };
      const logRef = await addDoc(collection(db, "check_ins"), newLog);
      setMemberCheckIns((prev) => [{ id: logRef.id, ...newLog }, ...prev]);
      return;
    }

    // Existing active member
    let currentWeek = selectedMember.currentWeek || 1;
    if (dateKey && selectedMember.startDate) {
      const start = localNoonFromStart(selectedMember.startDate);
      if (start) {
        const [y, mo, d] = dateKey.split("-").map(Number);
        const cell = new Date(y, mo - 1, d, 12, 0, 0);
        const diff = Math.round((cell - start) / 86400000);
        currentWeek = Math.min(12, Math.max(1, Math.floor(diff / 7) + 1));
      }
    }

    const currentWeeklyCounts = { ...(selectedMember.weeklyCheckIns || {}) };
    const newCount = (currentWeeklyCounts[currentWeek] || 0) + 1;
    currentWeeklyCounts[currentWeek] = newCount;

    const riskInfo = getMemberRiskInfo(
      newCount,
      selectedMember.startDate,
      selectedMember.status
    );

    await updateDoc(memberRef, {
      weeklyCheckIns: currentWeeklyCounts,
      lastCheckIn: now.toISOString(),
      riskLevel: riskInfo.level,
    });

    const newLog = {
      memberId: selectedMember.id,
      email: selectedMember.email || "",
      timestamp: when.toISOString(),
      classDate: dateKey || when.toISOString().slice(0, 10),
      weekNumber: currentWeek,
      source: "Manual Check-In (Dashboard)",
    };
    const logRef = await addDoc(collection(db, "check_ins"), newLog);
    setMemberCheckIns((prev) => [{ id: logRef.id, ...newLog }, ...prev]);
  } catch (err) {
    console.error(err);
    alert("Failed to add check-in");
  }
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

  const handleRemoveFromAtRisk = async (id) => {
  if (!window.confirm("Remove this member from At Risk?")) return;
  try {
    await deleteDoc(doc(db, "atRiskMembers", id));
    setSelectedAtRiskMember(null);
  } catch (err) {
    console.error(err);
    alert("Failed to remove member");
  }
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

  const handleAddAtRiskMember = async (data) => {
  try {
    const docId = data.email
      ? data.email.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()
      : `phone_${(data.phone || "").replace(/\D/g, "")}`;

    await setDoc(doc(db, "atRiskMembers", docId), {
      id: docId,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setShowAddAtRiskModal(false);
  } catch (err) {
    console.error(err);
    alert("Failed to add At Risk member");
  }
};
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

  function getOnboardingWeekNumber(startDateStr) {
    if (!startDateStr) return 1;
    const diffDays = localDaysSinceStart(startDateStr);
    return Math.min(12, Math.max(1, Math.floor(diffDays / 7) + 1));
  }

  function getWeekDateRange(startDateStr, weekNum) {
    const start = localNoonFromStart(startDateStr);
    if (!start) return null;
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() + (weekNum - 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const startKey = [
      weekStart.getFullYear(),
      String(weekStart.getMonth() + 1).padStart(2, "0"),
      String(weekStart.getDate()).padStart(2, "0")
    ].join("-");
    const endKey = [
      weekEnd.getFullYear(),
      String(weekEnd.getMonth() + 1).padStart(2, "0"),
      String(weekEnd.getDate()).padStart(2, "0")
    ].join("-");
    return { startKey, endKey };
  }

  // All known visit dates for a member: master + local check_ins (unique)
  function getMergedDatesForMember(member) {
    const email = (member.email || "").toLowerCase();
    const set = new Set();
    const master = masterByEmail[email];
    if (master?.dates) master.dates.forEach((d) => set.add(d));
    if (email && localDatesByEmail[email]) {
      localDatesByEmail[email].forEach((d) => set.add(d));
    }
    if (member.id && localDatesByEmail[`id:${member.id}`]) {
      localDatesByEmail[`id:${member.id}`].forEach((d) => set.add(d));
    }
    return Array.from(set).sort();
  }

  function todayNY() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  }

  function daysOutLive(member) {
    const dates = getMergedDatesForMember(member);
    let last = dates.length ? dates[dates.length - 1] : "";
    if (!last && member.lastCheckIn) {
      const raw = member.lastCheckIn;
      if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) last = raw.slice(0, 10);
      else {
        const d = raw?.toDate ? raw.toDate() : new Date(raw);
        if (!isNaN(d)) last = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
      }
    }
    if (!last) return Number(member.daysOut) || 0;
    const a = new Date(last + "T12:00:00");
    const b = new Date(todayNY() + "T12:00:00");
    return Math.max(0, Math.round((b - a) / 86400000));
  }

  function lastVisitLabel(member) {
    const dates = getMergedDatesForMember(member);
    if (dates.length) return dates[dates.length - 1];
    const email = (member.email || "").toLowerCase();
    return masterByEmail[email]?.lastDate || "";
  }

  function countDatesInWeek(member, weekNum) {
    if (!member.startDate) return null;
    const range = getWeekDateRange(member.startDate, weekNum);
    if (!range) return null;
    const dates = getMergedDatesForMember(member);
    if (!dates.length) return null; // no date-level data → caller may fall back
    return dates.filter((d) => d >= range.startKey && d <= range.endKey).length;
  }

  function getMasterWeekVisits(member) {
    const week = getOnboardingWeekNumber(member.startDate);
    const counted = countDatesInWeek(member, week);
    if (counted != null) return counted;
    // fall back only if we have no date-level data at all
    return member.weeklyCheckIns?.[week] || 0;
  }

  function getWeekVisitCount(member, weekNum) {
    const counted = countDatesInWeek(member, weekNum);
    if (counted != null) return counted;
    return member.weeklyCheckIns?.[weekNum] || 0;
  }

  const pendingMembers = members.filter(m => m.status === "pending");
  const activeMembers = members.filter(m => m.status === "active");
  const highRiskMembers = activeMembers.filter(m => {
    const masterWeek = getMasterWeekVisits(m);
    const currentWeekVisits = masterWeek != null ? masterWeek : (m.weeklyCheckIns?.[m.currentWeek] || 0);
    const risk = getMemberRiskInfo(currentWeekVisits, m.startDate, m.status);
    return risk.level === "high";
  });
  
  const totalThisWeekVisits = activeMembers.reduce((acc, m) => {
    const masterWeek = getMasterWeekVisits(m);
    return acc + (masterWeek != null ? masterWeek : (m.weeklyCheckIns?.[m.currentWeek] || 0));
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

  // Filtered Members for Table — High Risk uses the same array as the title count
  const filteredMembers =
    filter === "at_risk"
      ? atRiskMembers
      : filter === "high_risk"
        ? highRiskMembers
        : members.filter((m) => {
            if (filter === "pending") return m.status === "pending";
            if (filter === "active") return m.status === "active";
            return m.status !== "cancelled";
          });
  // --- PERSON VIEW DETAILED STATS, NEXT WEEK CALCULATIONS & CALENDAR ---
  let personStats = null;
  let checkInDatesSet = new Set();
  let threeMonthCalendars = [];

  if (selectedMember) {
    const weeklySum = Object.values(selectedMember.weeklyCheckIns || {}).reduce((a, b) => a + Number(b), 0);
    const emailKey = (selectedMember.email || "").toLowerCase();
    const chipFromLogs = [...(memberCheckIns || [])]
      .map((c) => c.totalAttendanceCount)
      .filter((n) => n != null && n !== "")
      .map((n) => Number(n))
      .filter((n) => !isNaN(n));
    const chipFromMaster = masterByEmail[emailKey]?.totalAttendanceCount;
    const chipTotal = chipFromLogs.length
      ? Math.max(...chipFromLogs)
      : (chipFromMaster != null && chipFromMaster !== "" ? Number(chipFromMaster) : null);
    const totalAllTimeVisits = chipTotal != null && !isNaN(chipTotal) ? chipTotal : weeklySum;
    const totalCheckinsSource = chipTotal != null && !isNaN(chipTotal) ? "chip" : "weekly";
    const todayWeek = getOnboardingWeekNumber(selectedMember.startDate);
    const activeWeeks = selectedMember.status === "active"
      ? Math.max(1, todayWeek || selectedMember.currentWeek || 1)
      : 0;
    const avgWeeklyVisitsPerson = activeWeeks > 0 ? (weeklySum / activeWeeks).toFixed(1) : "0.0";
    const projected12WkTotal = activeWeeks > 0 ? Math.round(Number(avgWeeklyVisitsPerson) * 12) : 0;

    const startDateObj = localNoonFromStart(selectedMember.startDate);
    const daysActive = selectedMember.startDate ? localDaysSinceStart(selectedMember.startDate) : 0;
    const onboardingProgressPct = selectedMember.status === "pending" ? 0 : Math.min(100, Math.round((activeWeeks / 12) * 100));

    let nextWeekNum = activeWeeks + 1;
    let nextWeekStartDateStr = "N/A";
    let daysUntilNextWeek = 0;

    if (startDateObj && selectedMember.status === "active") {
      if (activeWeeks < 12) {
        const nextWeekObj = new Date(startDateObj);
        nextWeekObj.setDate(nextWeekObj.getDate() + todayWeek * 7);
        nextWeekStartDateStr = nextWeekObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        daysUntilNextWeek = Math.max(0, 7 - ((daysActive % 7) || 0));
        if (daysActive % 7 === 0) daysUntilNextWeek = 7;
      } else {
        nextWeekStartDateStr = "Completed 12 Wks";
        nextWeekNum = 12;
      }
    }

    const scanObj = selectedMember.inBodyScans || {};
    const scansCompleted = (scanObj.scan1 ? 1 : 0) + (scanObj.scan2 ? 1 : 0) + (scanObj.scan3 ? 1 : 0);
    const scanPct = Math.round((scansCompleted / 3) * 100);

    const currentWkVisits = getWeekVisitCount(selectedMember, activeWeeks);
    const riskInfo = getMemberRiskInfo(currentWkVisits, selectedMember.startDate, selectedMember.status);

    const lastCheckInFormatted = selectedMember.lastCheckIn 
      ? new Date(selectedMember.lastCheckIn).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) 
      : "No check-ins recorded";

    memberCheckIns.forEach(log => {
      if (log.classDate) {
        checkInDatesSet.add(log.classDate);
      } else if (log._dateKey) {
        checkInDatesSet.add(log._dateKey);
      } else if (log.timestamp) {
        const d = new Date(log.timestamp);
        if (!isNaN(d)) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          checkInDatesSet.add(key);
        }
      }
    });

    threeMonthCalendars = generateThreeMonthCalendar(selectedMember.startDate);

    personStats = {
      totalAllTimeVisits,
      totalCheckinsSource,
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
        <h2>Loading Swarm Member Retention...</h2>
      </div>
    );
  }

  return (
    <div className="ret-wrap" style={styles.container}>
      <style>{`
        html, body, #root {
          margin: 0;
          padding: 0;
          width: 100%;
          overflow-x: hidden;
        }
        html { scrollbar-gutter: auto; }
        .ret-wrap {
          box-sizing: border-box;
          width: 100%;
          max-width: 100%;
          overflow-x: hidden;
          padding-top: 16px;
          padding-bottom: 16px;
          padding-left: 16px;
          padding-right: 16px;
        }
        .ret-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; }
        .ret-title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
        .ret-sub { font-size: 13px; color: #64748b; margin: 4px 0 0; }
        .ret-actions { display: flex; gap: 8px; flex-shrink: 0; }
        .tw-cards { display: none; }
        .ar-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
        @media (max-width: 768px) {
          .ret-header { align-items: center; flex-wrap: wrap; }
          .ret-actions { margin-left: auto; }
          .ret-title { font-size: 20px; line-height: 1.1; }
          .ret-sub { display: none; }
          .ret-actions button { padding: 8px 10px !important; font-size: 12px !important; }
          .tw-table { display: none !important; }
          .tw-cards { display: block; }
          .tw-metrics {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 6px !important;
            margin-bottom: 8px !important;
          }
          .tw-metrics > div:last-child { display: none !important; }
          .tw-metrics > div { padding: 6px 4px !important; }
          .tw-metrics > div > span:nth-child(1) { font-size: 9px !important; }
          .tw-metrics > div > span:nth-child(2) { font-size: 16px !important; margin-top: 1px !important; }
          .tw-metrics > div > span:nth-child(3) { display: none !important; }
          .ar-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          .ar-table { display: none !important; }
          .ar-cards { display: flex !important; }
          .tw-filters {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 6px !important;
            margin-bottom: 10px !important;
          }
          .tw-filters button {
            width: 100% !important;
            padding: 6px 4px !important;
            font-size: 10px !important;
            white-space: nowrap !important;
          }
          .ar-detail-overlay { padding: 0 !important; align-items: stretch !important; }
          .ar-detail-modal {
            height: 100% !important;
            max-height: 100% !important;
            border-radius: 0 !important;
            max-width: 100% !important;
          }
        }
      `}</style>
<div className="ret-header">
  <div>
    <h1 className="ret-title">Swarm Retention</h1>
    <AppVersion />
    <p className="ret-sub">
      Click any member to view stats, check-ins, and dates
    </p>
  </div>

  <div className="ret-actions">
    {mainTab === "twelve_week" && (
      <button style={styles.addBtn} onClick={() => setShowAddModal(true)}>
        + Add
      </button>
    )}

    {mainTab === "at_risk" && (
      <button style={styles.addBtn} onClick={() => setShowAddAtRiskModal(true)}>
        + Add
      </button>
    )}

    <button style={styles.logoutBtn} onClick={handleLogout}>
      Logout
    </button>
  </div>
</div>

{/* Main Tabs */}
<div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
  <button
    onClick={() => {
      setMainTab("twelve_week");
      setFilter("all");
    }}
    style={mainTab === "twelve_week" ? styles.activeFilterBtn : styles.filterBtn}
  >
    12-Week Onboarding
  </button>

  <button
    onClick={() => setMainTab("at_risk")}
    style={mainTab === "at_risk" ? styles.activeFilterBtn : styles.filterBtn}
  >
    ⚠️ At Risk ({atRiskMembers.length})
  </button>
</div>


{/* ===== 12-WEEK VIEW ===== */}
{mainTab === "twelve_week" && (
  <>
    {/* STATS CARDS */}
    <div style={styles.statsRow}>
     {/* Metrics Overview */}
      <div className="tw-metrics" style={styles.metricsGrid}>
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
          <span style={{ ...styles.metricLabel, color: "#991b1b" }}>High Risk</span>
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
    </div>
        {/* FILTERS */}
    <div className="tw-filters" style={styles.filterBar}>
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
        ⚠️ High Risk ({highRiskMembers.length})
      </button>
    </div>
     {/* Main Table (desktop) */}
      <style>{`
        .tw-cards { display: none; }
        @media (max-width: 768px) {
          .tw-table { display: none !important; }
          .tw-cards { display: block; }
        }
      `}</style>
      {!isMobile && (
      <div className="tw-table" style={{...styles.tableContainer, overflowX: "auto"}}>
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
              const isAtRisk = filter === "at_risk" || !!member.atRiskSince;
              const isPending = member.status === "pending";
              const masterWeek = !isPending ? getMasterWeekVisits(member) : null;
              const thisWeekVisits = isPending ? 0 : (masterWeek != null ? masterWeek : (member.weeklyCheckIns?.[member.currentWeek] || 0));
              const risk = getMemberRiskInfo(thisWeekVisits, member.startDate, member.status);
              const scans = member.inBodyScans || { scan1: false, scan2: false, scan3: false };
              const scanCount = (scans.scan1 ? 1 : 0) + (scans.scan2 ? 1 : 0) + (scans.scan3 ? 1 : 0);

              return (
                <tr 
                  key={member.id} 
                  style={styles.clickableTableRow}
                 onClick={() => {
        if (isAtRisk) {
          setSelectedAtRiskMember(member);
        } else {
          handleOpenPersonView(member);
        }
      }}
    >
                  <td style={styles.td}>
                    <div style={styles.memberName}>{member.firstName} {member.lastName}</div>
                    
                  </td>

                 <td style={styles.td}>
        {isAtRisk ? (
          <span style={{
            backgroundColor: "#fef2f2",
            color: "#dc2626",
            padding: "3px 8px",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: "700"
          }}>
            ⚠️ {daysOutLive(member)} days out
          </span>
        ) : isPending ? (
          <span style={styles.badgePending}>⏳ Pending</span>
        ) : (
          <span style={styles.badgeWeek}>Week {getOnboardingWeekNumber(member.startDate) || member.currentWeek}</span>
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
                          const count = getWeekVisitCount(member, weekNum);
                          const todayWeek = getOnboardingWeekNumber(member.startDate);
                          const isCurrent = weekNum === todayWeek;

                          let bg = "#e5e7eb";
                          let titleExtra = "";
                          if (isCurrent) {
                            // Pace-aware: 1 visit early in the week is still on track
                            const risk = getMemberRiskInfo(count, member.startDate, member.status);
                            if (risk.level === "low") bg = "#22c55e";
                            else if (risk.level === "medium") bg = "#f59e0b";
                            else if (risk.level === "high") bg = "#ef4444";
                            titleExtra = ` · ${risk.label}`;
                          } else if (count >= 3) bg = "#22c55e";
                          else if (count === 2) bg = "#f59e0b";
                          else if (count === 1) bg = "#ef4444";
                          else if (weekNum < todayWeek && count === 0) bg = "#9ca3af";

                          return (
                            <div 
                              key={weekNum} 
                              title={`Week ${weekNum}: ${count} visits${titleExtra}`}
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
      )}

      {isMobile && (
      <div className="tw-cards" style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", minWidth: 0 }}>
        {(filter === "high_risk" ? highRiskMembers : filteredMembers).map((member) => {
          const isAtRisk = filter === "at_risk" || !!member.atRiskSince;
          const isPending = member.status === "pending";
          const masterWeek = !isPending ? getMasterWeekVisits(member) : null;
          const thisWeekVisits = isPending ? 0 : (masterWeek != null ? masterWeek : (member.weeklyCheckIns?.[member.currentWeek] || 0));
          const risk = getMemberRiskInfo(thisWeekVisits, member.startDate, member.status);
          const scans = member.inBodyScans || { scan1: false, scan2: false, scan3: false };
          const scanCount = (scans.scan1 ? 1 : 0) + (scans.scan2 ? 1 : 0) + (scans.scan3 ? 1 : 0);
          const weekLabel = isPending ? "Pending" : `Week ${getOnboardingWeekNumber(member.startDate) || member.currentWeek}`;
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => isAtRisk ? setSelectedAtRiskMember(member) : handleOpenPersonView(member)}
              style={{
                textAlign: "left",
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: "8px 10px",
                cursor: "pointer",
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                overflow: "hidden"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 14, minWidth: 0 }}>
                  {member.firstName} {member.lastName}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, fontSize: 11, color: "#64748b" }}>
                  <span style={{ fontWeight: 800, color: "#2563eb" }}>{weekLabel}</span>
                  {!isPending && (
                    <span style={{ fontWeight: 700, color: risk.color }}> · {thisWeekVisits} visits</span>
                  )}
                  <span> · {scanCount}/3</span>
                </div>
              </div>
              {!isPending && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 3, marginTop: 6 }}>
                  {[...Array(12)].map((_, i) => {
                    const weekNum = i + 1;
                    const count = getWeekVisitCount(member, weekNum);
                    const todayWeek = getOnboardingWeekNumber(member.startDate);
                    const isCurrent = weekNum === todayWeek;
                    let bg = "#e5e7eb";
                    if (isCurrent) {
                      const r = getMemberRiskInfo(count, member.startDate, member.status);
                      bg = r.level === "low" ? "#22c55e" : r.level === "medium" ? "#f59e0b" : "#ef4444";
                    } else if (count >= 3) bg = "#22c55e";
                    else if (count === 2) bg = "#f59e0b";
                    else if (count === 1) bg = "#ef4444";
                    else if (weekNum < todayWeek && count === 0) bg = "#9ca3af";
                    return (
                      <div key={weekNum} title={`Week ${weekNum}: ${count}`} style={{
                        height: 22, borderRadius: 4, background: bg, color: "#fff",
                        fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                        border: isCurrent ? "2px solid #0f172a" : "none"
                      }}>{count}</div>
                    );
                  })}
                </div>
              )}
            </button>
          );
        })}
      </div>
      )}

  </>
)}

{/* ===== AT RISK VIEW ===== */}
{mainTab === "at_risk" && (
  <div>
    {mainTab === "at_risk" && (
  <div className="ar-metrics" style={styles.metricsGrid}>
    <div style={styles.metricCard}>
      <span style={styles.metricLabel}>Total At Risk</span>
      <span style={styles.metricValue}>{atRiskMembers.length}</span>
      <span style={styles.metricSubText}>Currently out 7+ days</span>
    </div>

 <div style={styles.metricCard}>
      <span style={styles.metricLabel}>Avg Days Out</span>
      <span style={styles.metricValue}>
        {atRiskMembers.length
          ? Math.round(
              atRiskMembers
                .map((m) => daysOutLive(m))
                .filter((d) => d > 0 && d < 500)
                .reduce((sum, d) => sum + d, 0) /
              atRiskMembers.filter((m) => { const d = daysOutLive(m); return d > 0 && d < 500; }).length
            )
          : 0}
      </span>
      <span style={styles.metricSubText}>Average time away</span>
    </div>

    <div style={styles.metricCard}>
      <span style={styles.metricLabel}>Longest Out</span>
      <span style={styles.metricValue}>
        {atRiskMembers.length
          ? Math.max(...atRiskMembers.map((m) => daysOutLive(m)))
          : 0}
      </span>
      <span style={styles.metricSubText}>Days since last visit</span>
    </div>
  </div>
)}
    <h3 style={{ marginTop: 0, marginBottom: "4px" }}>At Risk Members</h3>
    <p style={{ color: "#64748b", marginBottom: "20px", fontSize: "14px" }}>
      Members who have not visited in 7+ days
    </p>

    <div className="ar-table" style={styles.tableContainer}>
      <table style={styles.table}>
        <thead>
        <tr style={styles.tableHeader}>
          <th style={styles.th}>Member</th>
          <th style={styles.th}>Days Out</th>
          <th style={styles.th}>Last Check-In</th>
          <th style={styles.th}>At Risk Since</th>
          <th style={styles.th}>Reach-outs</th>
          <th style={{ ...styles.th, textAlign: "right" }}>Details</th>
        </tr>
        </thead>
        <tbody>
          {atRiskMembers.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
                No members currently at risk
              </td>
            </tr>
          ) : (
            atRiskMembers.map((member) => (
              <tr
                key={member.id}
                style={styles.clickableTableRow}
                onClick={() => setSelectedAtRiskMember(member)}
              >
                <td style={styles.td}>
                  <div style={styles.memberName}>
                    {member.firstName} {member.lastName}
                  </div>

                </td>
                <td style={styles.td}>
                  <span style={{
                    backgroundColor: "#fef2f2",
                    color: "#dc2626",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: "700"
                  }}>
                    {daysOutLive(member)} days
                  </span>
                </td>
                <td style={styles.td}>
                  {(() => {
                    const email = (member.email || "").toLowerCase();
                    const masterLast = masterByEmail[email]?.lastDate;
                    if (masterLast) return masterLast;
                    if (member.lastCheckIn) return new Date(member.lastCheckIn).toLocaleDateString();
                    return "—";
                  })()}
                </td>
                <td style={styles.td}>
                  {member.atRiskSince
                    ? new Date(member.atRiskSince).toLocaleDateString()
                    : "—"}
                </td>
<td style={styles.td}>
  {(member.reachOuts || []).length === 0 ? (
    <span style={{ color: "#94a3b8", fontSize: 12 }}>None</span>
  ) : (
    <span
      style={{
        backgroundColor: "#dbeafe",
        color: "#1d4ed8",
        padding: "3px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {(member.reachOuts || []).length} reach-out
      {(member.reachOuts || []).length === 1 ? "" : "s"}
    </span>
  )}
</td>
                <td style={{ ...styles.td, textAlign: "right", color: "#64748b" }}>
                  View →
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
    <div className="ar-cards" style={{ display: "none", flexDirection: "column", gap: 10 }}>
      {atRiskMembers.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>No members currently at risk</div>
      ) : atRiskMembers.map((member) => (
        <button
          key={member.id}
          type="button"
          onClick={() => setSelectedAtRiskMember(member)}
          style={{
            textAlign: "left",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 12,
            cursor: "pointer",
            width: "100%",
            boxSizing: "border-box"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.3 }}>
              <span style={{ fontWeight: 800 }}>{member.firstName} {member.lastName}</span>
              <span style={{ color: "#64748b", fontWeight: 500 }}>
                {" · "}
                {masterByEmail[(member.email || "").toLowerCase()]?.lastDate
                  || (member.lastCheckIn ? new Date(member.lastCheckIn).toLocaleDateString() : "—")}
              </span>
            </div>
            <div style={{
              background: "#fef2f2", color: "#dc2626", fontWeight: 800, fontSize: 12,
              borderRadius: 8, padding: "4px 8px", height: "fit-content", flexShrink: 0
            }}>
              {daysOutLive(member)} days
            </div>
          </div>
        </button>
      ))}
    </div>
  </div>
)}

 

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
    smsFile={smsFile}
  setSmsFile={setSmsFile}
  smsFilePreview={smsFilePreview}
  setSmsFilePreview={setSmsFilePreview}
  sendAsInternal={sendAsInternal}
setSendAsInternal={setSendAsInternal}
  />
)}
  {selectedAtRiskMember && (
  <AtRiskDetailModal
    member={selectedAtRiskMember}
    daysOut={daysOutLive(selectedAtRiskMember)}
    lastVisit={lastVisitLabel(selectedAtRiskMember)}
    onClose={() => setSelectedAtRiskMember(null)}
    onRemoveFromAtRisk={handleRemoveFromAtRisk}
  />
)}
{showAddAtRiskModal && (
  <AddAtRiskModal
    onClose={() => setShowAddAtRiskModal(false)}
    onSave={handleAddAtRiskMember}
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
  container: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", padding: 16, backgroundColor: "#f8fafc", minHeight: "100vh", boxSizing: "border-box", width: "100%" },
  loadingContainer: { display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" },
  title: { fontSize: "26px", fontWeight: "800", color: "#0f172a", margin: 0 },
  subtitle: { fontSize: "14px", color: "#64748b", marginTop: "4px", margin: 0 },
  addBtn: { backgroundColor: "#2563eb", color: "#fff", padding: "10px 18px", borderRadius: "8px", border: "none", fontWeight: "600", cursor: "pointer" },
  logoutBtn: { backgroundColor: "#334155", color: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "none", fontWeight: "600", cursor: "pointer" },
  metricsGrid: { display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "10px", marginBottom: "16px" },
  metricCard: { backgroundColor: "#fff", padding: "12px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", minWidth: 0 },
  metricLabel: { fontSize: "12px", color: "#64748b", fontWeight: "600" },
  metricValue: { fontSize: "24px", fontWeight: "800", color: "#0f172a", marginTop: "2px" },
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