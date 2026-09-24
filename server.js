import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { predict, supportedSymptoms } from "./ml/predict.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const STORE_PATH = path.join(ROOT, "data", "store.json");
const SESSION_TTL = 1000 * 60 * 60 * 8;
const sessions = new Map();
const rateWindows = new Map();

const json = (status, body, headers = {}) => ({
  status,
  headers: { "content-type": "application/json; charset=utf-8", ...headers },
  body: JSON.stringify(body)
});

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(STORE_PATH, "utf8"));
  } catch {
    return { users: [], predictions: [] };
  }
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2));
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function makeSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL });
  return token;
}

function userFromRequest(req, store) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return store.users.find((user) => user.id === session.userId) || null;
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("Request body must be valid JSON"); }
}

function rateLimit(req, key, limit = 30) {
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucketKey = `${ip}:${key}`;
  const recent = (rateWindows.get(bucketKey) || []).filter((time) => now - time < 60_000);
  recent.push(now);
  rateWindows.set(bucketKey, recent);
  return recent.length <= limit;
}

function chatbotReply(message) {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return "Ask me about the app, symptom entry, or how to interpret a preliminary result.";
  if (/chest|breath|faint|unconscious|stroke|bleed|allergic reaction/.test(text)) {
    return "These may be urgent warning signs. Contact your local emergency service or seek immediate medical care. Do not wait for an AI response.";
  }
  if (/diagnos|certain|accurate|confidence|score|result/.test(text)) {
    return "A result here is informational only, not a diagnosis or medical certainty. Please discuss symptoms with a qualified healthcare professional.";
  }
  if (/symptom|select|input/.test(text)) {
    return "Select every symptom that applies, then add duration and severity. Accurate context makes the information more useful, but it cannot replace an examination.";
  }
  if (/medicine|drug|tablet|dosage|prescription/.test(text)) {
    return "I cannot prescribe medicines or dosages. A qualified healthcare professional can recommend treatment for your specific situation.";
  }
  return "I can explain how CareSignal works, help organize symptom information, and clarify safety guidance. I cannot diagnose or replace professional care.";
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const radians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function nearbyCare(latitude, longitude) {
  const overpassQuery = `[out:json][timeout:15];(nwr["amenity"~"doctors|clinic|hospital"](around:5000,${latitude},${longitude}););out center tags;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "CareSignal educational prototype" },
    body: `data=${encodeURIComponent(overpassQuery)}`
  });
  if (!response.ok) throw new Error("Nearby care search is temporarily unavailable.");
  const payload = await response.json();
  return (payload.elements || []).map((place) => {
    const tags = place.tags || {};
    const placeLatitude = place.lat ?? place.center?.lat;
    const placeLongitude = place.lon ?? place.center?.lon;
    const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"], tags["addr:postcode"]].filter(Boolean).join(", ");
    return {
      id: place.id,
      name: tags.name || "Unnamed care provider",
      type: tags.amenity === "hospital" ? "Hospital" : tags.amenity === "clinic" ? "Clinic" : "Doctor",
      address: address || "Address not listed",
      phone: tags.phone || tags["contact:phone"] || "",
      website: tags.website || tags["contact:website"] || "",
      latitude: placeLatitude,
      longitude: placeLongitude,
      distanceKm: Number(distanceKm(latitude, longitude, placeLatitude, placeLongitude).toFixed(1)),
      mapUrl: `https://www.openstreetmap.org/?mlat=${placeLatitude}&mlon=${placeLongitude}#map=18/${placeLatitude}/${placeLongitude}`
    };
  }).filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude)).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 20);
}

async function api(req, res, pathname, searchParams = new URLSearchParams()) {
  if (!rateLimit(req, pathname, pathname.includes("auth") ? 15 : 60)) return json(429, { error: "Too many requests. Please try again shortly." });
  const store = await readStore();
  const user = userFromRequest(req, store);
  const method = req.method || "GET";
  const segments = pathname.split("/").filter(Boolean);

  if (method === "GET" && pathname === "/api/health") return json(200, { ok: true, service: "CareSignal API" });
  if (method === "GET" && pathname === "/api/symptoms") return json(200, { symptoms: supportedSymptoms() });

  if (method === "POST" && pathname === "/api/auth/register") {
    const data = await body(req);
    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Enter a valid name and email address." });
    if (!validatePassword(data.password)) return json(400, { error: "Password must be at least 8 characters and include a letter and number." });
    if (store.users.some((item) => item.email === email)) return json(409, { error: "An account with this email already exists." });
    const newUser = { id: id("usr"), name, email, mobile: String(data.mobile || ""), age: Number(data.age) || null, gender: String(data.gender || ""), passwordHash: hashPassword(data.password), createdAt: new Date().toISOString() };
    store.users.push(newUser);
    await writeStore(store);
    return json(201, { user: publicUser(newUser), token: makeSession(newUser.id) });
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    const data = await body(req);
    const found = store.users.find((item) => item.email === String(data.email || "").trim().toLowerCase());
    if (!found || !verifyPassword(data.password, found.passwordHash)) return json(401, { error: "Invalid email or password." });
    return json(200, { user: publicUser(found), token: makeSession(found.id) });
  }

  if (method === "POST" && pathname === "/api/auth/logout") {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    sessions.delete(token);
    return json(200, { ok: true });
  }

  if (method === "POST" && pathname === "/api/auth/forgot-password") {
    return json(200, { message: "If an account exists, password-reset instructions will be sent through the configured email provider." });
  }

  if (method === "POST" && pathname === "/api/chat") {
    const data = await body(req);
    return json(200, { reply: chatbotReply(data.message), disclaimer: "Informational only; not medical advice." });
  }

  if (method === "GET" && pathname === "/api/doctors/nearby") {
    const latitude = Number(searchParams.get("lat"));
    const longitude = Number(searchParams.get("lon"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return json(400, { error: "A valid location is required to search nearby care." });
    }
    try {
      return json(200, { providers: await nearbyCare(latitude, longitude), source: "OpenStreetMap contributors" });
    } catch {
      return json(503, { error: "Nearby care search is temporarily unavailable. Use the emergency or local health-service link for urgent needs." });
    }
  }

  if (!user) return json(401, { error: "Authentication required." });

  if (method === "GET" && pathname === "/api/user/profile") return json(200, { user: publicUser(user) });
  if (method === "PUT" && pathname === "/api/user/profile") {
    const data = await body(req);
    user.name = String(data.name || user.name).trim();
    user.mobile = String(data.mobile ?? user.mobile);
    user.age = Number(data.age) || null;
    user.gender = String(data.gender ?? user.gender);
    await writeStore(store);
    return json(200, { user: publicUser(user) });
  }

  if (method === "POST" && pathname === "/api/predict") {
    const data = await body(req);
    if (!Array.isArray(data.symptoms) || data.symptoms.length === 0) return json(400, { error: "Select at least one symptom." });
    if (data.symptoms.length > 40) return json(400, { error: "Please select fewer symptoms." });
    const result = predict(data);
    const record = { id: id("pred"), userId: user.id, ...result, age: Number(data.age) || null, gender: String(data.gender || ""), duration: String(data.duration || ""), severity: String(data.severity || ""), additionalSymptoms: String(data.additionalSymptoms || ""), createdAt: new Date().toISOString() };
    store.predictions.push(record);
    await writeStore(store);
    return json(201, { prediction: record });
  }

  if (method === "GET" && pathname === "/api/predictions") {
    const records = store.predictions.filter((item) => item.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json(200, { predictions: records });
  }

  if (segments[0] === "api" && segments[1] === "predictions" && segments[2]) {
    const record = store.predictions.find((item) => item.id === segments[2] && item.userId === user.id);
    if (!record) return json(404, { error: "Prediction not found." });
    if (method === "GET") return json(200, { prediction: record });
    if (method === "DELETE") {
      store.predictions = store.predictions.filter((item) => item.id !== record.id);
      await writeStore(store);
      return json(200, { ok: true });
    }
  }
  return json(404, { error: "Route not found." });
}

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
async function serveStatic(req, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(ROOT, "public", requested));
  if (!filePath.startsWith(path.join(ROOT, "public"))) return null;
  try { return { status: 200, headers: { "content-type": mime[path.extname(filePath)] || "text/plain; charset=utf-8" }, body: await fs.readFile(filePath) }; } catch { return null; }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const result = url.pathname.startsWith("/api/") ? await api(req, res, url.pathname, url.searchParams) : await serveStatic(req, url.pathname) || json(404, { error: "Not found." });
    res.writeHead(result.status, { ...result.headers, "cache-control": "no-store" });
    res.end(result.body);
  } catch (error) {
    console.error(error);
    const result = json(500, { error: "Unexpected server error." });
    res.writeHead(result.status, result.headers);
    res.end(result.body);
  }
});

server.listen(PORT, () => console.log(`CareSignal running at http://localhost:${PORT}`));