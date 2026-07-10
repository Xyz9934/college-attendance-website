const form = document.getElementById("attendanceForm");
const recordsBody = document.getElementById("recordsBody");
const message = document.getElementById("formMessage");
const currentDate = document.getElementById("currentDate");
const currentTime = document.getElementById("currentTime");
const ipAddress = document.getElementById("ipAddress");
const searchInput = document.getElementById("searchInput");
const dateFilter = document.getElementById("dateFilter");
const semesterFilter = document.getElementById("semesterFilter");
const exportButton = document.getElementById("exportButton");
const openAdminButton = document.getElementById("openAdminButton");
const adminLogin = document.getElementById("adminLogin");
const adminPassword = document.getElementById("adminPassword");
const adminSubmitButton = document.getElementById("adminSubmitButton");
const adminPanel = document.getElementById("adminPanel");
const logoutButton = document.getElementById("logoutButton");

const APP_CONFIG = window.APP_CONFIG || {};
const API_BASE_URL = APP_CONFIG.apiBaseUrl || "";
const STORAGE_KEY = "attendance-my-token";
const SESSION_KEY = "attendance-admin-auth";

let records = [];
let adminAuthenticated = sessionStorage.getItem(SESSION_KEY) === "true";
let myAttendanceToken = localStorage.getItem(STORAGE_KEY) || "";
let gps = { latitude: "", longitude: "" };

function apiUrl(pathname) {
  return `${API_BASE_URL}${pathname}`;
}

function updateClock() {
  const now = new Date();
  currentDate.textContent = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  currentTime.textContent = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function formatLocation(record) {
  if (record.latitude && record.longitude) {
    const lat = Number(record.latitude).toFixed(6);
    const lng = Number(record.longitude).toFixed(6);
    return `${lat}, ${lng}`;
  }
  return "Not available";
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(apiUrl(pathname), {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function matchesFilters(record) {
  const term = searchInput?.value.trim().toLowerCase() || "";
  const selectedDate = dateFilter?.value || "";
  const selectedSemester = semesterFilter?.value || "";

  const haystack = `${record.name} ${record.rollNumber}`.toLowerCase();
  const termMatch = !term || haystack.includes(term);
  const dateMatch = !selectedDate || selectedDate === record.timestamp.slice(0, 10);
  const semesterMatch = !selectedSemester || selectedSemester === record.semester;

  return termMatch && dateMatch && semesterMatch;
}

function renderRecords() {
  if (!adminAuthenticated) {
    recordsBody.innerHTML = '<tr><td colspan="8" class="empty">Admin records will appear here.</td></tr>';
    return;
  }

  const visible = records.filter(matchesFilters);
  if (!visible.length) {
    recordsBody.innerHTML = '<tr><td colspan="8" class="empty">No matching attendance records.</td></tr>';
    return;
  }

  recordsBody.innerHTML = visible
    .map((record) => {
      const locationCell =
        record.latitude && record.longitude
          ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(`${record.latitude},${record.longitude}`)}" target="_blank" rel="noreferrer">${formatLocation(record)}</a>`
          : "Not available";

      return `
        <tr>
          <td>${record.name}</td>
          <td>${record.rollNumber}</td>
          <td>${record.mobileNumber}</td>
          <td>${record.semester}</td>
          <td>${record.date}</td>
          <td>${record.time}</td>
          <td>${record.ipAddress || "Unknown"}</td>
          <td>${locationCell}</td>
        </tr>
      `;
    })
    .join("");
}

async function loadAdminSession() {
  try {
    const data = await requestJson("/api/admin/session");
    adminAuthenticated = Boolean(data.authenticated);
    sessionStorage.setItem(SESSION_KEY, String(adminAuthenticated));
    adminPanel.hidden = !adminAuthenticated;
    if (adminAuthenticated) {
      await loadRecords();
    } else {
      renderRecords();
    }
  } catch {
    adminAuthenticated = false;
    adminPanel.hidden = true;
    renderRecords();
  }
}

async function loadRecords() {
  if (!adminAuthenticated) return;
  const data = await requestJson("/api/admin/records");
  records = data.records || [];
  renderRecords();
}

function saveMyToken(token) {
  myAttendanceToken = token;
  localStorage.setItem(STORAGE_KEY, token);
}

async function loadMyAttendance() {
  if (!myAttendanceToken) return;
  try {
    const data = await requestJson(`/api/my-attendance?token=${encodeURIComponent(myAttendanceToken)}`);
    if (data.record) {
      const r = data.record;
      setMessage(`Your attendance is saved for ${r.date} at ${r.time}.`, "success");
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    myAttendanceToken = "";
  }
}

async function loginAdmin() {
  const password = adminPassword.value.trim();
  if (!password) {
    window.alert("Enter the admin password.");
    return;
  }

  try {
    await requestJson("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });

    adminAuthenticated = true;
    sessionStorage.setItem(SESSION_KEY, "true");
    adminPanel.hidden = false;
    adminLogin.hidden = true;
    adminPassword.value = "";
    await loadRecords();
  } catch (error) {
    window.alert(error.message);
  }
}

async function logoutAdmin() {
  try {
    await requestJson("/api/admin/logout", { method: "POST" });
  } finally {
    adminAuthenticated = false;
    sessionStorage.removeItem(SESSION_KEY);
    records = [];
    adminPanel.hidden = true;
    renderRecords();
  }
}

async function loadIp() {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    ipAddress.textContent = data.ip || "Unknown";
  } catch {
    ipAddress.textContent = "Unknown";
  }
}

function captureLocation() {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      gps = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    },
    () => {
      gps = { latitude: "", longitude: "" };
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function downloadCsv(rows) {
  const headers = ["Name", "Roll Number", "Mobile Number", "Semester", "Course", "Date", "Time", "IP Address", "Location", "Timestamp"];
  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.name,
        row.rollNumber,
        row.mobileNumber,
        row.semester,
        row.course,
        row.date,
        row.time,
        row.ipAddress,
        formatLocation(row),
        row.timestamp,
      ]
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(",")
    ),
  ];

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "attendance-records.csv";
  a.click();
  URL.revokeObjectURL(url);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("Saving attendance...");

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.latitude = gps.latitude;
  payload.longitude = gps.longitude;

  try {
    const data = await requestJson("/api/attendance", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (data.accessToken) {
      saveMyToken(data.accessToken);
    }

    form.reset();
    captureLocation();
    setMessage("Attendance saved successfully. Only you can reopen your record with your token.", "success");
    if (data.record) {
      records = [data.record, ...records];
      renderRecords();
    }
  } catch (error) {
    setMessage(error.message || "Failed to save attendance.", "error");
  }
});

openAdminButton.addEventListener("click", () => {
  adminLogin.hidden = false;
  adminPassword.focus();
});
adminSubmitButton.addEventListener("click", loginAdmin);
logoutButton.addEventListener("click", logoutAdmin);
searchInput?.addEventListener("input", renderRecords);
dateFilter?.addEventListener("change", renderRecords);
semesterFilter?.addEventListener("change", renderRecords);
exportButton?.addEventListener("click", () => downloadCsv(records.filter(matchesFilters)));

updateClock();
setInterval(updateClock, 1000);
loadIp();
captureLocation();
loadAdminSession();
loadMyAttendance();
