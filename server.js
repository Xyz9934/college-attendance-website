const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "zoology123";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "attendance.json");
const adminSessions = new Set();

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

function readRecords() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeRecords(records) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), "utf8");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(text);
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "";
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
  return parseCookies(req).admin_token || "";
}

function isAdmin(req) {
  return adminSessions.has(getAdminToken(req));
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

  return {
    name,
    rollNumber,
    mobileNumber,
    semester,
    latitude,
    longitude,
  };
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

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsedUrl.pathname || "/");

  if (req.method === "GET" && pathname === "/api/records") {
    return sendJson(res, 404, { ok: false, error: "Not found." });
  }

  if (req.method === "GET" && pathname === "/api/admin/session") {
    return sendJson(res, 200, { authenticated: isAdmin(req) });
  }

  if (req.method === "GET" && pathname === "/api/admin/records") {
    if (!isAdmin(req)) {
      return sendJson(res, 401, { ok: false, error: "Admin access required." });
    }
    const records = readRecords();
    return sendJson(res, 200, { records });
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
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": `admin_token=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400`,
      });
      return res.end(JSON.stringify({ ok: true }));
    } catch {
      return sendJson(res, 500, { ok: false, error: "Could not sign in." });
    }
  }

  if (req.method === "POST" && pathname === "/api/admin/logout") {
    const token = getAdminToken(req);
    if (token) adminSessions.delete(token);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": "admin_token=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0",
    });
    return res.end(JSON.stringify({ ok: true }));
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
      const records = readRecords();
      const record = {
        id: crypto.randomUUID(),
        ...validated,
        course: "B.Sc. Zoology",
        date,
        time,
        timestamp,
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || "",
      };

      records.unshift(record);
      writeRecords(records);

      return sendJson(res, 201, { ok: true, record });
    } catch (error) {
      return sendJson(res, 500, {
        ok: false,
        error: "Could not save attendance record.",
      });
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
