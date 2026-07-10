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

const ADMIN_PASSWORD = "zoology123";
const STORAGE_KEY = "attendance-records";
const SESSION_KEY = "attendance-admin-auth";

let records = [];
let gps = { latitude: "", longitude: "" };
let adminAuthenticated = sessionStorage.getItem(SESSION_KEY) === "true";

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

function getStoredRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveStoredRecords(nextRecords) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords));
}

function formatLocation(record) {
  if (record.latitude && record.longitude) {
    const lat = Number(record.latitude).toFixed(6);
    const lng = Number(record.longitude).toFixed(6);
    return `${lat}, ${lng}`;
  }
  return "Not available";
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

function loadAdminSession() {
  adminPanel.hidden = !adminAuthenticated;
  if (adminAuthenticated) {
    records = getStoredRecords();
  }
  renderRecords();
}

function loginAdmin() {
  const password = adminPassword.value.trim();
  if (!password) {
    window.alert("Enter the admin password.");
    return;
  }
  if (password !== ADMIN_PASSWORD) {
    window.alert("Incorrect password.");
    return;
  }

  adminAuthenticated = true;
  sessionStorage.setItem(SESSION_KEY, "true");
  adminPanel.hidden = false;
  adminLogin.hidden = true;
  adminPassword.value = "";
  records = getStoredRecords();
  renderRecords();
}

function logoutAdmin() {
  adminAuthenticated = false;
  sessionStorage.removeItem(SESSION_KEY);
  records = [];
  adminPanel.hidden = true;
  renderRecords();
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
  if (!navigator.geolocation) {
    return;
  }

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
    const timestamp = new Date().toISOString();
    const now = new Date(timestamp);
    const record = {
      id: crypto.randomUUID(),
      ...payload,
      course: "B.Sc. Zoology",
      date: now.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      time: now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
      timestamp,
      ipAddress: ipAddress.textContent || "Unknown",
      userAgent: navigator.userAgent,
    };

    const nextRecords = [record, ...getStoredRecords()];
    saveStoredRecords(nextRecords);
    records = nextRecords;

    form.reset();
    captureLocation();
    setMessage("Attendance saved successfully.", "success");
    renderRecords();
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
