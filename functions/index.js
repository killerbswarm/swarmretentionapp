const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Secrets (loaded securely)
const GHL_API_TOKEN = defineSecret("GHL_API_TOKEN");
const GHL_LOCATION_ID = defineSecret("GHL_LOCATION_ID");
const GHL_USER_ID = defineSecret("GHL_USER_ID");
const GHL_API_VERSION = "2021-07-28";

function calculateCurrentWeek(startDateTimestamp, weekOverride) {
  if (weekOverride !== null && weekOverride !== undefined) {
    return Number(weekOverride);
  }
  
  const startDate = new Date(startDateTimestamp);
  const now = new Date();
  const diffInDays = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffInDays / 7) + 1;
  
  if (week > 12) return 12;
  if (week < 1) return 1;
  return week;
}

function calculateRiskLevel(checkInCount) {
  if (checkInCount >= 3) return "low";
  if (checkInCount === 2) return "medium";
  return "high";
}

/**
 * Helper to find existing member by Email or GHL ID
 */
async function findMemberDoc(email, ghlId) {
  if (email) {
    const emailDocId = email.replace(/[^a-zA-Z0-9]/g, "_");
    const docByEmail = await db.collection("members").doc(emailDocId).get();
    if (docByEmail.exists) return docByEmail.ref;

    const q = await db.collection("members").where("email", "==", email).limit(1).get();
    if (!q.empty) return q.docs[0].ref;
  }

  if (ghlId) {
    const docByGhl = await db.collection("members").doc(ghlId).get();
    if (docByGhl.exists) return docByGhl.ref;
  }

  const defaultId = email 
    ? email.replace(/[^a-zA-Z0-9]/g, "_") 
    : (ghlId || `user_${Date.now()}`);
    
  return db.collection("members").doc(defaultId);
}

// =========================================================================
// ENDPOINT 1: GHL New Member Signup Webhook
// =========================================================================
exports.ghlNewMemberWebhook = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const payload = req.body;
    const email = payload.email || payload.contact?.email;
    const ghlId = payload.contact_id || payload.contact?.id || payload.id;
    const firstName = payload.first_name || payload.contact?.first_name || "New";
    const lastName = payload.last_name || payload.contact?.last_name || "Member";
    const phone = payload.phone || payload.contact?.phone || "";

    if (!email && !ghlId) {
      return res.status(400).json({ error: "Missing email or contact_id" });
    }

    const memberRef = await findMemberDoc(email, ghlId);
    const memberDoc = await memberRef.get();

    if (memberDoc.exists) {
      return res.status(200).json({ message: "Member already exists", id: memberRef.id });
    }

    const newPendingMember = {
      id: memberRef.id,
      firstName,
      lastName,
      email: email || "",
      phone: phone || "",
      dateAdded: new Date().toISOString(),
      startDate: null,
      currentWeek: 0,
      weekOverride: null,
      status: "pending",
      weeklyCheckIns: {},
      lastCheckIn: null,
      riskLevel: "pending",
      inBodyScans: { scan1: false, scan2: false, scan3: false }
    };

    await memberRef.set(newPendingMember);

    return res.status(200).json({
      success: true,
      message: `Pending member created for ${firstName} ${lastName}.`,
      member: newPendingMember
    });

  } catch (err) {
    console.error("New Member Webhook Error:", err);
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

// =========================================================================
// ENDPOINT 2: GHL Check-In Webhook
// =========================================================================
exports.ghlCheckInWebhook = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const payload = req.body;
    const email = payload.email || payload.contact?.email;
    const ghlId = payload.contact_id || payload.contact?.id || payload.id;
    const firstName = payload.first_name || payload.contact?.first_name || "New";
    const lastName = payload.last_name || payload.contact?.last_name || "Member";
    const phone = payload.phone || payload.contact?.phone || "";

    if (!email && !ghlId) {
      return res.status(400).json({ error: "Missing email or contact_id" });
    }

    const memberRef = await findMemberDoc(email, ghlId);
    const memberDoc = await memberRef.get();
    const now = new Date();

    // Tag-only enrollment: do not create members from check-ins.
    // New members must come from ghlNewMemberWebhook (12 Week tag) or manual add.
    if (!memberDoc.exists) {
      console.log(
        `Check-in ignored — not enrolled in 12-week: ${email || ghlId || firstName}`
      );
      return res.status(200).json({
        success: false,
        skipped: true,
        reason: "not_enrolled",
        message:
          "Contact is not in the 12-week program. Add the 12 Week tag (or add them manually) before check-ins count.",
      });
    }

    let memberData;
    const existing = memberDoc.data() || {};

    // Pending (tag enrolled) → first check-in starts the 12-week clock
    if (existing.status === "pending") {
      memberData = {
        ...existing,
        id: memberRef.id,
        firstName: existing.firstName || firstName,
        lastName: existing.lastName || lastName,
        email: existing.email || email || "",
        phone: existing.phone || phone || "",
        dateAdded: existing.dateAdded || now.toISOString(),
        startDate: now.toISOString(),
        currentWeek: 1,
        weekOverride: null,
        status: "active",
        weeklyCheckIns: { 1: 1 },
        lastCheckIn: now.toISOString(),
        riskLevel: "high",
        inBodyScans: existing.inBodyScans || {
          scan1: false,
          scan2: false,
          scan3: false,
        },
      };
      await memberRef.set(memberData, { merge: true });
    } else {
      // Already active (or other status) → increment this week's visits
      const currentWeek = calculateCurrentWeek(
        existing.startDate,
        existing.weekOverride
      );
      const currentWeeklyCounts = { ...(existing.weeklyCheckIns || {}) };
      const newCountForWeek = (currentWeeklyCounts[currentWeek] || 0) + 1;
      currentWeeklyCounts[currentWeek] = newCountForWeek;
      const newRiskLevel = calculateRiskLevel(newCountForWeek);

      memberData = {
        ...existing,
        currentWeek,
        weeklyCheckIns: currentWeeklyCounts,
        lastCheckIn: now.toISOString(),
        riskLevel: newRiskLevel,
      };

      await memberRef.update({
        currentWeek,
        weeklyCheckIns: currentWeeklyCounts,
        lastCheckIn: now.toISOString(),
        riskLevel: newRiskLevel,
      });
    }

    await db.collection("check_ins").add({
      memberId: memberRef.id,
      email: email || existing.email || "",
      timestamp: now.toISOString(),
      weekNumber: memberData.currentWeek,
      source: "GHL Webhook",
      rawPayload: payload,
    });

    return res.status(200).json({
      success: true,
      message: `Check-in logged for ${firstName} ${lastName} (Week ${memberData.currentWeek})`,
      member: memberData,
    });

  } catch (err) {
    console.error("Check-In Webhook Error:", err);
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

// =========================================================================
// ENDPOINT 3: Fetch GHL Notes, Appointments & Messages for Dashboard
// =========================================================================
exports.getGhlContactDetails = onRequest(
  { 
    cors: true, 
    secrets: [GHL_API_TOKEN, GHL_LOCATION_ID] 
  }, 
  async (req, res) => {
    try {
      const { contactId, email, locationId: queryLocId } = req.query;
      const locationId = queryLocId || GHL_LOCATION_ID.value();

      if (!contactId && !email) {
        return res.status(400).json({ error: "Missing contactId or email" });
      }

      let resolvedContactId = contactId;
      let contactDetails = {
        firstName: "",
        lastName: "",
        email: email || "",
        phone: "",
        lastCheckIn: null,
      };

      // Search by email if we don't have a contactId
      if (!resolvedContactId && email) {
        const searchRes = await fetch(
          `https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&query=${encodeURIComponent(email)}`,
          {
            headers: {
              Authorization: `Bearer ${GHL_API_TOKEN.value()}`,
              Version: GHL_API_VERSION,
            },
          }
        );
        const searchData = await searchRes.json();
        
        if (!searchRes.ok) {
          console.error("GHL Contact Search Error:", searchData);
          return res.status(200).json({ 
            notes: [], appointments: [], messages: [],
            ...contactDetails 
          });
        }

        const found = searchData.contacts?.[0];
        if (found) {
          resolvedContactId = found.id;
          // Often the search result already has basic fields
          contactDetails.firstName = found.firstName || found.first_name || "";
          contactDetails.lastName = found.lastName || found.last_name || "";
          contactDetails.email = found.email || email;
          contactDetails.phone = found.phone || found.phoneNumber || "";
        }
      }

      if (!resolvedContactId) {
        return res.status(200).json({ 
          notes: [], appointments: [], messages: [],
          ...contactDetails 
        });
      }

      // Fetch full contact record (for name, phone, custom fields)
      try {
        const contactRes = await fetch(
          `https://services.leadconnectorhq.com/contacts/${resolvedContactId}`,
          {
            headers: {
              Authorization: `Bearer ${GHL_API_TOKEN.value()}`,
              Version: GHL_API_VERSION,
            },
          }
        );
        const contactData = await contactRes.json();
        const c = contactData.contact || contactData;

        contactDetails = {
          firstName: c.firstName || c.first_name || contactDetails.firstName || "",
          lastName: c.lastName || c.last_name || contactDetails.lastName || "",
          email: c.email || contactDetails.email || "",
          phone: c.phone || c.phoneNumber || contactDetails.phone || "",
          lastCheckIn:
            c.last_checkin_date ||
            c.customFields?.last_checkin_date ||
            (Array.isArray(c.customFields)
              ? c.customFields.find(f => f.key === "last_checkin_date" || f.id === "last_checkin_date")?.value
              : null) ||
            null,
        };
      } catch (err) {
        console.error("Failed to fetch full contact:", err);
      }

      // Fetch notes, appointments, messages in parallel
      const [notesRes, eventsRes, apptsRes, convosRes] = await Promise.all([
        fetch(`https://services.leadconnectorhq.com/contacts/${resolvedContactId}/notes`, {
          headers: { Authorization: `Bearer ${GHL_API_TOKEN.value()}`, Version: GHL_API_VERSION },
        }),
        fetch(`https://services.leadconnectorhq.com/calendars/events?locationId=${locationId}&contactId=${resolvedContactId}`, {
          headers: { Authorization: `Bearer ${GHL_API_TOKEN.value()}`, Version: GHL_API_VERSION },
        }),
        fetch(`https://services.leadconnectorhq.com/contacts/${resolvedContactId}/appointments`, {
          headers: { Authorization: `Bearer ${GHL_API_TOKEN.value()}`, Version: GHL_API_VERSION },
        }),
        fetch(`https://services.leadconnectorhq.com/conversations/search?locationId=${locationId}&contactId=${resolvedContactId}`, {
          headers: { Authorization: `Bearer ${GHL_API_TOKEN.value()}`, Version: GHL_API_VERSION },
        }),
      ]);

      const notesData = await notesRes.json();
      const eventsData = await eventsRes.json();
      const apptsData = await apptsRes.json();
      const convosData = await convosRes.json();

      const combinedAppointments = [
        ...(eventsData.events || []),
        ...(apptsData.appointments || []),
        ...(apptsData.events || [])
      ];

      const uniqueAppointments = Array.from(
        new Map(combinedAppointments.map((item) => [item.id, item])).values()
      );

      let messages = [];
      const conversationId = convosData.conversations?.[0]?.id;
      if (conversationId) {
      const msgRes = await fetch(
  `https://services.leadconnectorhq.com/conversations/${conversationId}/messages?type=TYPE_SMS,TYPE_INTERNAL_COMMENTS&limit=30`,
  {
    headers: {
      Authorization: `Bearer ${GHL_API_TOKEN.value()}`,
      Version: GHL_API_VERSION,
    },
  }
);
        const msgData = await msgRes.json();
        messages = msgData.messages?.messages || [];
      }

      return res.status(200).json({
        contactId: resolvedContactId,
        firstName: contactDetails.firstName,
        lastName: contactDetails.lastName,
        email: contactDetails.email,
        phone: contactDetails.phone,
        lastCheckIn: contactDetails.lastCheckIn,
        notes: notesData.notes || [],
        appointments: uniqueAppointments,
        messages: messages.slice(0, 15),
      });

    } catch (err) {
      console.error("GHL Sync Error:", err);
      return res.status(500).json({ error: "Failed to fetch GHL details", details: err.message });
    }
  }
);

// =========================================================================
// ENDPOINT 4: Create a New Staff Note in GHL
// =========================================================================
exports.createGhlNote = onRequest({ cors: true,secrets: [GHL_API_TOKEN, GHL_USER_ID] }, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const { contactId, note } = req.body;

    if (!contactId || !note) {
      return res.status(400).json({ error: "Missing contactId or note body" });
    }

    const response = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/notes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GHL_API_TOKEN.value()}`,
        Version: GHL_API_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        body: note,
        userId: GHL_USER_ID.value() 
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("GHL Note Error Details:", data);
      return res.status(400).json({ error: data.message || "Failed to create note in GHL", details: data });
    }

    return res.status(200).json({ success: true, note: data.note });

  } catch (err) {
    console.error("Create Note Error:", err);
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

// =========================================================================
// ENDPOINT 5: Send an SMS Text via GHL (Attributed to Swarm App User)
// =========================================================================
exports.sendGhlSms = onRequest({ cors: true,secrets: [GHL_API_TOKEN, GHL_USER_ID] }, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const { contactId, message, attachments, scheduledAt, scheduledTimestamp } = req.body;

    if (!contactId) {
      return res.status(400).json({ error: "Missing contactId" });
    }

    if (!message && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: "Need either message text or an attachment" });
    }

    const payload = {
      type: "SMS",
      contactId: contactId,
      userId: GHL_USER_ID.value()
    };

    if (message && message.trim()) {
      payload.message = message.trim();
    }

    if (attachments && attachments.length > 0) {
      payload.attachments = attachments;   // array of public image URLs
    }

    let ts = scheduledTimestamp;
    if (!ts && scheduledAt) {
      const d = new Date(scheduledAt);
      if (!isNaN(d.getTime())) ts = Math.floor(d.getTime() / 1000);
    }
    if (ts) {
      ts = Number(ts);
      const now = Math.floor(Date.now() / 1000);
      if (ts < now + 60) {
        return res.status(400).json({
          error: "Schedule time must be at least 1 minute in the future",
          scheduledTimestamp: ts,
          now,
        });
      }
      payload.scheduledTimestamp = ts;
    }

    const response = await fetch(`https://services.leadconnectorhq.com/conversations/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GHL_API_TOKEN.value()}`,
        Version: GHL_API_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("GHL Send SMS Error Details:", data);
      return res.status(400).json({ error: data.message || "Failed to send SMS via GHL", details: data });
    }

    const messageId =
      data.messageId ||
      data.message?.id ||
      data.id ||
      data.message?.messageId ||
      null;

    return res.status(200).json({
      success: true,
      message: data,
      messageId,
      scheduled: !!payload.scheduledTimestamp,
      scheduledTimestamp: payload.scheduledTimestamp || null,
    });

  } catch (err) {
    console.error("Send SMS Error:", err);
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

exports.cancelScheduledGhlSms = onRequest(
  { cors: true, secrets: [GHL_API_TOKEN, GHL_USER_ID] },
  async (req, res) => {
    try {
      if (req.method !== "POST" && req.method !== "DELETE") {
        return res.status(405).send("Method Not Allowed");
      }
      const messageId = req.body?.messageId || req.query?.messageId;
      if (!messageId) {
        return res.status(400).json({ error: "Missing messageId" });
      }

      const response = await fetch(
        `https://services.leadconnectorhq.com/conversations/messages/${messageId}/schedule`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${GHL_API_TOKEN.value()}`,
            Version: GHL_API_VERSION,
            Accept: "application/json",
          },
        }
      );

      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        console.error("GHL cancel schedule error", data);
        return res.status(400).json({
          error: data.message || data.error || "Failed to cancel scheduled message",
          details: data,
        });
      }

      return res.status(200).json({ success: true, messageId, data });
    } catch (err) {
      console.error("cancelScheduledGhlSms", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// =========================================================================
// ENDPOINT: GHL At-Risk Webhook (member has been out 7+ days)
// =========================================================================
exports.ghlAtRiskWebhook = onRequest(
  { cors: true, secrets: [GHL_API_TOKEN, GHL_LOCATION_ID] },
  async (req, res) => {
    try {
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

      const payload = req.body;
      const email = payload.email || payload.contact?.email || "";
      const phone = payload.phone || payload.contact?.phone || "";
      const firstName = payload.first_name || payload.contact?.first_name || "Unknown";
      const lastName = payload.last_name || payload.contact?.last_name || "";
      const ghlContactId = payload.contact_id || payload.contact?.id || payload.id || null;
      const lastCheckIn = payload.last_check_in || payload.lastCheckIn || null;

      if (!email && !ghlContactId && !phone) {
        return res.status(400).json({ error: "Need at least email, phone, or contact_id" });
      }

      // Create a stable document ID
      const docId = email
        ? email.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()
        : ghlContactId || `phone_${phone.replace(/\D/g, "")}`;

      const now = new Date();
      const lastCheckInDate = lastCheckIn ? new Date(lastCheckIn) : null;
      const daysOut = lastCheckInDate
        ? Math.floor((now - lastCheckInDate) / (1000 * 60 * 60 * 24))
        : 7; // fallback

      const atRiskData = {
        id: docId,
        firstName,
        lastName,
        email: email || "",
        phone: phone || "",
        ghlContactId: ghlContactId || null,
        lastCheckIn: lastCheckInDate ? lastCheckInDate.toISOString() : null,
        atRiskSince: now.toISOString(),
        daysOut,
        updatedAt: now.toISOString(),
        createdAt: now.toISOString(),
      };

      await db.collection("atRiskMembers").doc(docId).set(atRiskData, { merge: true });

      return res.status(200).json({
        success: true,
        message: `${firstName} ${lastName} added to At Risk`,
        data: atRiskData,
      });
    } catch (err) {
      console.error("At Risk Webhook Error:", err);
      return res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
  }
);

// =========================================================================
// ENDPOINT: GHL At-Risk Check-In Webhook (member returned → remove from At Risk)
// =========================================================================
exports.ghlAtRiskCheckInWebhook = onRequest(
  { cors: true },
  async (req, res) => {
    try {
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

      const payload = req.body;
      const email = payload.email || payload.contact?.email || "";
      const ghlContactId = payload.contact_id || payload.contact?.id || payload.id || null;
      const phone = payload.phone || payload.contact?.phone || "";

      if (!email && !ghlContactId && !phone) {
        return res.status(400).json({ error: "Need at least email, phone, or contact_id" });
      }

      const docId = email
        ? email.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()
        : ghlContactId || `phone_${phone.replace(/\D/g, "")}`;

      const docRef = db.collection("atRiskMembers").doc(docId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(200).json({
          success: true,
          message: "Person was not in At Risk list",
        });
      }

      await docRef.delete();

      return res.status(200).json({
        success: true,
        message: `${doc.data().firstName || "Member"} removed from At Risk`,
      });
    } catch (err) {
      console.error("At Risk Check-In Webhook Error:", err);
      return res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
  }
);

async function removeFromAtRisk({ email, ghlContactId, phone }) {
  const ids = new Set();
  if (email) ids.add(String(email).replace(/[^a-zA-Z0-9]/g, "_").toLowerCase());
  if (ghlContactId) ids.add(String(ghlContactId));
  if (phone) ids.add(`phone_${String(phone).replace(/\D/g, "")}`);

  let removed = 0;
  for (const id of ids) {
    const ref = db.collection("atRiskMembers").doc(id);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      removed++;
    }
  }

  if (email) {
    const q = await db.collection("atRiskMembers").where("email", "==", String(email).toLowerCase()).get();
    for (const d of q.docs) {
      await d.ref.delete();
      removed++;
    }
  }

  return removed;
}

exports.ghlPendingCancelWebhook = onRequest(
  { cors: true },
  async (req, res) => {
    try {
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

      const payload = req.body || {};
      const email = String(payload.email || payload.contact?.email || "").trim().toLowerCase();
      const ghlContactId = payload.contact_id || payload.contactId || payload.contact?.id || payload.id || null;
      const phone = payload.phone || payload.contact?.phone || "";
      const firstName = payload.first_name || payload.firstName || payload.contact?.firstName || "";
      const lastName = payload.last_name || payload.lastName || payload.contact?.lastName || "";

      if (!email && !ghlContactId && !phone) {
        return res.status(400).json({ error: "Need at least email, phone, or contact_id" });
      }

      const removed = await removeFromAtRisk({ email, ghlContactId, phone });

      if (email) {
        const memberId = email.replace(/[^a-zA-Z0-9]/g, "_");
        await db.collection("members").doc(memberId).set({
          email,
          firstName,
          lastName,
          phone,
          ghlContactId: ghlContactId || null,
          status: "pendingCancel",
          pendingCancelAt: new Date(),
          updatedAt: new Date()
        }, { merge: true });
      }

      return res.status(200).json({
        success: true,
        message: removed
          ? `Removed from At Risk (${removed} record${removed === 1 ? "" : "s"})`
          : "Not in At Risk list — marked pending cancel so they will not be re-added",
        email,
        removed
      });
    } catch (err) {
      console.error("Pending Cancel Webhook Error:", err);
      return res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
  }
);

// =========================================================================
// ENDPOINT: Send Internal Comment (shows in conversation feed, not SMS)
// =========================================================================
exports.sendGhlInternalComment = onRequest(
  { cors: true, secrets: [GHL_API_TOKEN, GHL_USER_ID] },
  async (req, res) => {
    try {
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

      const { contactId, message } = req.body;

      if (!contactId || !message) {
        return res.status(400).json({ error: "Missing contactId or message" });
      }

      const response = await fetch(
        "https://services.leadconnectorhq.com/conversations/messages",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GHL_API_TOKEN.value()}`,
            Version: GHL_API_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "InternalComment",
            contactId: contactId,
            message: message,
            userId: GHL_USER_ID.value(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("GHL Internal Comment Error:", data);
        return res.status(400).json({
          error: data.message || "Failed to post internal comment",
          details: data,
        });
      }

      return res.status(200).json({ success: true, message: data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        error: "Internal Server Error",
        details: err.message,
      });
    }
  }
);


// =========================================================================
// DAILY: Flag members with no check-in in 7+ days (from swarm-checkins master)
// Runs every day at 7:00 AM America/New_York

// =========================================================================
// DAILY: Flag members with no check-in in 7+ days (from swarm-checkins master)
// Only if GHL has "member" tag; exclude punchcard / paused / drop-in
// Runs every day at 7:00 AM America/New_York
// =========================================================================
const CHECKINS_API = "https://us-central1-swarm-checkins-5436d.cloudfunctions.net";
const DAYS_MISSING_THRESHOLD = 7;

function normalizeTags(tags) {
  if (!tags) return [];
  const list = Array.isArray(tags) ? tags : String(tags).split(",");
  return list
    .map((t) => {
      let s = String(t).toLowerCase().trim();
      if (s === "drop in" || s === "dropin" || s === "drop_in") s = "drop-in";
      if (s === "punch card") s = "punchcard";
      if (s === "pause") s = "paused";
      if (s === "pending cancel" || s === "pending cancellation" || s === "pending-cancellation") s = "pending-cancel";
      if (s === "no membership" || s === "no-membership" || s === "nonmember" || s === "non-member") s = "nomembership";
      if (s === "former member" || s === "formermember" || s === "ex-member" || s === "ex member") s = "former-member";
      return s;
    })
    .filter(Boolean);
}

function hasTag(tags, ...exactNames) {
  // exact match only (case already lowercased in normalizeTags)
  return exactNames.some((n) => tags.includes(n));
}

/** GHL contact lookup by email — returns tags array or null */
async function getGhlTagsForEmail(email, token, locationId) {
  try {
    const url =
      `https://services.leadconnectorhq.com/contacts/search/duplicate?` +
      `locationId=${encodeURIComponent(locationId)}&email=${encodeURIComponent(email)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_API_VERSION,
        Accept: "application/json"
      }
    });
    if (!res.ok) {
      console.warn(`GHL lookup ${email}: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const contact = data.contact || data.contacts?.[0] || null;
    if (!contact) return null;
    return normalizeTags(contact.tags || contact.tagsList || []);
  } catch (err) {
    console.warn(`GHL lookup error ${email}:`, err.message);
    return null;
  }
}

/**
 * Eligible for At Risk only if:
 *  - has "member" tag
 *  - does NOT have punchcard, paused, or drop-in (drop in / dropin)
 *  - member + punchcard → exclude
 */
function isEligibleMemberForAtRisk(tags) {
  if (!tags || !tags.length) return false;
  if (!hasTag(tags, "member")) return false;
  if (hasTag(tags, "punchcard", "paused", "drop-in")) return false;
  if (hasTag(tags, "pending-cancel", "cancelled", "canceled", "cancel")) return false;
  if (hasTag(tags, "nomembership", "inactive", "former-member")) return false;
  return true;
}

async function executeAtRiskScan() {
    const now = new Date();
    const todayKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");

    const token = GHL_API_TOKEN.value();
    const locationId = GHL_LOCATION_ID.value();

    console.log(`dailyAtRiskFromCheckins starting ${todayKey}`);

    // 1) Master check-ins
    let checkins = [];
    try {
      const res = await fetch(`${CHECKINS_API}/getCheckins`);
      if (!res.ok) throw new Error(`getCheckins HTTP ${res.status}`);
      const data = await res.json();
      checkins = data.checkins || [];
    } catch (err) {
      console.error("Failed to load master check-ins:", err);
      throw err;
    }

    const lastByEmail = {};
    for (const c of checkins) {
      const email = (c.email || "").toLowerCase().trim();
      const date = c.classDate;
      if (!email || !date) continue;
      if (!lastByEmail[email] || date > lastByEmail[email]) {
        lastByEmail[email] = date;
      }
    }

    // 2) Retention members + local check_ins (history before master existed)
    const membersSnap = await db.collection("members").get();
    const localCheckinsSnap = await db.collection("check_ins").get();
    const localLastByEmail = {};
    const localLastByMemberId = {};

    const toDateKey = (val) => {
      if (!val) return null;
      let d = null;
      if (typeof val === "string") d = new Date(val);
      else if (val.toDate) d = val.toDate();
      else if (val.seconds) d = new Date(val.seconds * 1000);
      else if (val instanceof Date) d = val;
      if (!d || isNaN(d)) return null;
      return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0")
      ].join("-");
    };

    localCheckinsSnap.docs.forEach((d) => {
      const data = d.data();
      const key = data.classDate || toDateKey(data.timestamp);
      if (!key) return;
      const email = (data.email || "").toLowerCase().trim();
      if (email && (!localLastByEmail[email] || key > localLastByEmail[email])) {
        localLastByEmail[email] = key;
      }
      if (data.memberId && (!localLastByMemberId[data.memberId] || key > localLastByMemberId[data.memberId])) {
        localLastByMemberId[data.memberId] = key;
      }
    });

    const atRiskSnap = await db.collection("atRiskMembers").get();
    const alreadyAtRisk = new Set();
    atRiskSnap.docs.forEach((d) => {
      const e = (d.data().email || "").toLowerCase().trim();
      if (e) alreadyAtRisk.add(e);
      alreadyAtRisk.add(d.id);
    });

    let added = 0;
    let skipped = 0;
    let excludedByTag = 0;
    let removedByTag = 0;

    for (const d of atRiskSnap.docs) {
      const email = (d.data().email || "").toLowerCase().trim();
      if (!email) continue;
      const tags = await getGhlTagsForEmail(email, token, locationId);
      if (!isEligibleMemberForAtRisk(tags)) {
        await d.ref.delete();
        alreadyAtRisk.delete(email);
        alreadyAtRisk.delete(d.id);
        removedByTag++;
        console.log(`Removed ${email} from at-risk: tags=[${(tags || []).join(", ")}]`);
      }
    }
    console.log(`Removed ${removedByTag} at-risk members by GHL tags`);

    for (const docSnap of membersSnap.docs) {
      const m = docSnap.data();
      const email = (m.email || "").toLowerCase().trim();
      if (!email) {
        skipped++;
        continue;
      }
      if (m.status === "cancelled" || m.status === "graduated" || m.status === "pending" || m.status === "pendingCancel") {
        skipped++;
        continue;
      }
      if (alreadyAtRisk.has(email) || alreadyAtRisk.has(docSnap.id)) {
        skipped++;
        continue;
      }

      // 3) GHL tags gate
      const tags = await getGhlTagsForEmail(email, token, locationId);
      if (!isEligibleMemberForAtRisk(tags)) {
        excludedByTag++;
        console.log(
          `Skip ${email}: tags=[${(tags || []).join(", ")}] (need member; exclude punchcard/paused/drop-in)`
        );
        continue;
      }

      // Last visit = newest of: master, local check_ins, member.lastCheckIn
      // Do NOT treat "not in master yet" as never checked in.
      const candidates = [
        lastByEmail[email] || null,
        localLastByEmail[email] || null,
        localLastByMemberId[docSnap.id] || null,
        toDateKey(m.lastCheckIn)
      ].filter(Boolean);
      const lastDate = candidates.length ? candidates.sort().pop() : null;

      if (!lastDate) {
        skipped++;
        console.log(`Skip ${email}: no last check-in on master, local logs, or member record`);
        continue;
      }

      const last = new Date(lastDate + "T12:00:00");
      const daysOut = Math.floor((now - last) / (1000 * 60 * 60 * 24));
      if (daysOut < DAYS_MISSING_THRESHOLD) {
        skipped++;
        continue;
      }
      const reason = `No check-in in ${daysOut} days (last: ${lastDate})`;

      const docId = email.replace(/[^a-zA-Z0-9]/g, "_") || docSnap.id;
      const atRiskData = {
        firstName: m.firstName || "",
        lastName: m.lastName || "",
        email,
        phone: m.phone || "",
        memberId: docSnap.id,
        lastCheckIn: lastDate ? new Date(lastDate + "T12:00:00").toISOString() : null,
        atRiskSince: now.toISOString(),
        daysOut,
        reason,
        ghlTags: tags,
        source: "dailyAtRiskFromCheckins",
        updatedAt: now.toISOString()
      };

      await db.collection("atRiskMembers").doc(docId).set(atRiskData, { merge: true });
      added++;
      console.log(`At Risk added: ${email} — ${reason}`);
    }

    console.log(
      `dailyAtRiskFromCheckins done. added=${added} removedByTag=${removedByTag} skipped=${skipped} excludedByTag=${excludedByTag}`
    );
    return { added, removedByTag, skipped, excludedByTag, date: todayKey };
}

exports.dailyAtRiskFromCheckins = onSchedule(
  {
    schedule: "0 7 * * *",
    timeZone: "America/New_York",
    timeoutSeconds: 540,
    memory: "512MiB",
    secrets: [GHL_API_TOKEN, GHL_LOCATION_ID]
  },
  async () => {
    await executeAtRiskScan();
  }
);

exports.runAtRiskScan = onRequest(
  {
    cors: true,
    timeoutSeconds: 540,
    memory: "512MiB",
    secrets: [GHL_API_TOKEN, GHL_LOCATION_ID]
  },
  async (req, res) => {
    try {
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
      const result = await executeAtRiskScan();
      return res.status(200).json({ success: true, ...(result || {}) });
    } catch (err) {
      console.error("runAtRiskScan error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

exports.getInBodyScans = onRequest({ cors: true }, async (req, res) => {
  try {
    const email = String(req.query.email || req.body?.email || "")
      .toLowerCase()
      .trim();
    const phone = String(req.query.phone || req.body?.phone || "").replace(/\D/g, "");
    const last10 = phone.length >= 10 ? phone.slice(-10) : phone;

    if (!email && last10.length < 7) {
      return res.status(400).json({ error: "Need email or phone" });
    }

    const seen = new Set();
    const scans = [];

    const addSnap = (snap) => {
      snap.docs.forEach((d) => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        const data = d.data() || {};
        scans.push({
          id: d.id,
          scanDate: data.scanDate || data.date || null,
          clientName: data.clientName || "",
          email: data.email || "",
          phone: data.phone || "",
          weight: data.weight || 0,
          smm: data.smm || 0,
          pbf: data.pbf || 0,
          bmi: data.bmi || 0,
          bfm: data.bfm || 0,
          lbm: data.lbm || 0,
          bmr: data.bmr || 0,
          score: data.score || 0,
          visceralFat: data.visceralFat || 0,
          height: data.height || 0,
          age: data.age || 0,
          gender: data.gender || "",
          segmentalLean: data.segmentalLean || null,
          segmentalFat: data.segmentalFat || null,
        });
      });
    };

    if (email) {
      addSnap(await db.collection("inbody_scans").where("email", "==", email).get());
    }
    if (last10.length >= 7) {
      addSnap(await db.collection("inbody_scans").where("phone", "==", last10).get());
      addSnap(await db.collection("inbody_scans").where("phone", "==", phone).get());
    }

    scans.sort((a, b) => String(b.scanDate || "").localeCompare(String(a.scanDate || "")));
    return res.status(200).json({ scans });
  } catch (err) {
    console.error("getInBodyScans", err);
    return res.status(500).json({ error: err.message });
  }
});