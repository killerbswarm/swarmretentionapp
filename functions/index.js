const { onRequest } = require("firebase-functions/v2/https");
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

    let memberData;

    if (!memberDoc.exists || memberDoc.data().status === "pending") {
      const existingData = memberDoc.exists ? memberDoc.data() : {};
      
      memberData = {
        id: memberRef.id,
        firstName: existingData.firstName || firstName,
        lastName: existingData.lastName || lastName,
        email: existingData.email || email || "",
        phone: existingData.phone || phone || "",
        dateAdded: existingData.dateAdded || now.toISOString(),
        startDate: now.toISOString(),
        currentWeek: 1,
        weekOverride: null,
        status: "active",
        weeklyCheckIns: { 1: 1 },
        lastCheckIn: now.toISOString(),
        riskLevel: "high",
        inBodyScans: existingData.inBodyScans || { scan1: false, scan2: false, scan3: false }
      };
      await memberRef.set(memberData, { merge: true });
    } else {
      const existing = memberDoc.data();
      const currentWeek = calculateCurrentWeek(existing.startDate, existing.weekOverride);
      
      const currentWeeklyCounts = existing.weeklyCheckIns || {};
      const newCountForWeek = (currentWeeklyCounts[currentWeek] || 0) + 1;
      
      currentWeeklyCounts[currentWeek] = newCountForWeek;
      const newRiskLevel = calculateRiskLevel(newCountForWeek);

      memberData = {
        ...existing,
        currentWeek,
        weeklyCheckIns: currentWeeklyCounts,
        lastCheckIn: now.toISOString(),
        riskLevel: newRiskLevel
      };

      await memberRef.update({
        currentWeek,
        weeklyCheckIns: currentWeeklyCounts,
        lastCheckIn: now.toISOString(),
        riskLevel: newRiskLevel
      });
    }

    await db.collection("check_ins").add({
      memberId: memberRef.id,
      email: email || "",
      timestamp: now.toISOString(),
      weekNumber: memberData.currentWeek,
      source: "GHL Webhook",
      rawPayload: payload
    });

    return res.status(200).json({
      success: true,
      message: `Check-in logged for ${firstName} ${lastName} (Week ${memberData.currentWeek})`,
      member: memberData
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
        const msgRes = await fetch(`https://services.leadconnectorhq.com/conversations/${conversationId}/messages`, {
          headers: { Authorization: `Bearer ${GHL_API_TOKEN.value()}`, Version: GHL_API_VERSION },
        });
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

    const { contactId, message, attachments } = req.body;

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

    return res.status(200).json({ success: true, message: data });

  } catch (err) {
    console.error("Send SMS Error:", err);
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

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