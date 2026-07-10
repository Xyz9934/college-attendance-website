const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "zoologybotany";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const APP_TIME_ZONE = "Asia/Kolkata";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "docs");
const adminSessions = new Set();

function setCorsHeaders(res, reqOrigin = "") {
  const allowedOrigin = CORS_ORIGIN || reqOrigin;
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(text);
}

function safeJoin(baseDir, requestPath) {
  const targetPath = path.normalize(path.join(baseDir, requestPath));
  if (!targetPath.startsWith(baseDir)) return null;
  return targetPath;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((acc, pair) => {
    const index = pair.indexOf("=");
    if (index === -1) return acc;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function getAdminToken(req) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }
  return "";
}

function isAdmin(req) {
  return adminSessions.has(getAdminToken(req));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function validateSubmission(body) {
  const name = String(body.name || "").trim();
  const rollNumber = String(body.rollNumber || "").trim();
  const mobileNumber = String(body.mobileNumber || "").trim();
  const semester = String(body.semester || "").trim();
  const latitude = body.latitude === null || body.latitude === undefined ? "" : String(body.latitude).trim();
  const longitude = body.longitude === null || body.longitude === undefined ? "" : String(body.longitude).trim();

  if (!name) return "Full name is required.";
  if (!rollNumber) return "Roll number is required.";
  if (!mobileNumber) return "Mobile number is required.";
  if (!/^[0-9+\-\s()]{7,20}$/.test(mobileNumber)) return "Enter a valid mobile number.";
  if (!semester) return "Semester is required.";

  return { name, rollNumber, mobileNumber, semester, latitude, longitude };
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return {
    date: date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  };
}

function getAttendanceDay(timestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "";
}

async function supabaseRequest(pathname, { method = "GET", body, preferCount = false, preferRepresentation = false } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured.");
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  if (preferCount) {
    headers.Prefer = "count=exact";
  }
  if (preferRepresentation) {
    headers.Prefer = headers.Prefer ? `${headers.Prefer},return=representation` : "return=representation";
  }

  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Supabase request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function insertAttendance(record) {
  const payload = await supabaseRequest("/rest/v1/attendance_records", {
    method: "POST",
    body: [record],
    preferRepresentation: true,
  });
  return payload[0];
}

async function fetchAttendanceByToken(token) {
  const query = new URLSearchParams({
    select: "id,name,roll_number,mobile_number,semester,course,date,time,timestamp,attendance_day,ip_address,user_agent,latitude,longitude,access_token",
    access_token: `eq.${token}`,
    limit: "1",
  });
  const payload = await supabaseRequest(`/rest/v1/attendance_records?${query.toString()}`);
  return payload[0] || null;
}

async function fetchAllAttendance() {
  const query = new URLSearchParams({
    select: "id,name,roll_number,mobile_number,semester,course,date,time,timestamp,attendance_day,ip_address,user_agent,latitude,longitude",
    order: "timestamp.desc",
    limit: "1000",
  });
  return supabaseRequest(`/rest/v1/attendance_records?${query.toString()}`);
}

async function fetchTodaysAttendance(rollNumber, attendanceDay) {
  const query = new URLSearchParams({
    select: "id,name,roll_number,mobile_number,semester,course,date,time,timestamp,attendance_day,ip_address,user_agent,latitude,longitude",
    roll_number: `eq.${rollNumber}`,
    attendance_day: `eq.${attendanceDay}`,
    limit: "1",
  });
  const payload = await supabaseRequest(`/rest/v1/attendance_records?${query.toString()}`);
  return payload[0] || null;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsedUrl.pathname || "/");
  const reqOrigin = req.headers.origin || "";

  setCorsHeaders(res, reqOrigin);

  if (req.method === "OPTIONS") {
    return res.writeHead(204).end();
  }

  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/admin/session") {
    return sendJson(res, 200, { authenticated: isAdmin(req) });
  }

  if (req.method === "POST" && pathname === "/api/admin/login") {
    try {
      const body = await readBody(req);
      const password = String(body.password || "");
      if (password !== ADMIN_PASSWORD) {
        return sendJson(res, 401, { ok: false, error: "Incorrect password." });
      }

      const token = crypto.randomUUID();
      adminSessions.add(token);
      return sendJson(res, 200, { ok: true, token });
    } catch {
      return sendJson(res, 500, { ok: false, error: "Could not sign in." });
    }
  }

  if (req.method === "POST" && pathname === "/api/admin/logout") {
    const token = getAdminToken(req);
    if (token) adminSessions.delete(token);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/admin/records") {
    if (!isAdmin(req)) {
      return sendJson(res, 401, { ok: false, error: "Admin access required." });
    }

    try {
      const records = await fetchAllAttendance();
      return sendJson(res, 200, { records: records || [] });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Could not load attendance records." });
    }
  }

  if (req.method === "POST" && pathname === "/api/attendance") {
    try {
      const body = await readBody(req);
      const validated = validateSubmission(body);
      if (typeof validated === "string") {
        return sendJson(res, 400, { ok: false, error: validated });
      }

      const timestamp = new Date().toISOString();
      const { date, time } = formatDateTime(timestamp);
      const attendanceDay = getAttendanceDay(timestamp);

      const existing = await fetchTodaysAttendance(validated.rollNumber, attendanceDay);
      if (existing) {
        return sendJson(res, 409, {
          ok: false,
          error: `Attendance already submitted for roll number ${validated.rollNumber} today.`,
        });
      }

      const accessToken = crypto.randomUUID();
      const record = {
        name: validated.name,
        roll_number: validated.rollNumber,
        mobile_number: validated.mobileNumber,
        semester: validated.semester,
        course: "B.Sc. Zoology",
        date,
        time,
        timestamp,
        attendance_day: attendanceDay,
        ip_address: getClientIp(req),
        user_agent: req.headers["user-agent"] || "",
        latitude: validated.latitude,
        longitude: validated.longitude,
        access_token: accessToken,
      };

      const inserted = await insertAttendance(record);
      return sendJson(res, 201, {
        ok: true,
        accessToken,
        record: {
          id: inserted.id,
          name: inserted.name,
          rollNumber: inserted.roll_number,
          mobileNumber: inserted.mobile_number,
          semester: inserted.semester,
          course: inserted.course,
          date: inserted.date,
          time: inserted.time,
          timestamp: inserted.timestamp,
          attendanceDay: inserted.attendance_day,
          ipAddress: inserted.ip_address,
          latitude: inserted.latitude,
          longitude: inserted.longitude,
        },
      });
    } catch (error) {
      return sendJson(res, 500, {
        ok: false,
        error: error.message || "Could not save attendance record.",
      });
    }
  }

  if (req.method === "GET" && pathname === "/api/my-attendance") {
    const accessToken = String(parsedUrl.query.token || "").trim();
    if (!accessToken) {
      return sendJson(res, 400, { ok: false, error: "Token is required." });
    }

    try {
      const record = await fetchAttendanceByToken(accessToken);
      if (!record) {
        return sendJson(res, 404, { ok: false, error: "Record not found." });
      }

      return sendJson(res, 200, {
        ok: true,
        record: {
          id: record.id,
          name: record.name,
          rollNumber: record.roll_number,
          mobileNumber: record.mobile_number,
          semester: record.semester,
          course: record.course,
          date: record.date,
          time: record.time,
          timestamp: record.timestamp,
          attendanceDay: record.attendance_day,
          ipAddress: record.ip_address,
          latitude: record.latitude,
          longitude: record.longitude,
        },
      });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Could not load your attendance." });
    }
  }

  if (req.method === "GET") {
    const requestPath = pathname === "/" ? "/index.html" : pathname;
    const filePath = safeJoin(PUBLIC_DIR, requestPath);
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return sendText(res, 404, "Not found");
    }
    res.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
    return fs.createReadStream(filePath).pipe(res);
  }

  return sendText(res, 405, "Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Attendance app running on http://localhost:${PORT}`);
});
