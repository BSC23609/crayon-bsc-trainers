// Shared login / user helpers for the Sales AI Suite (Vercel serverless, Node).
// Users live in Postgres (Neon). Needs Vercel env vars:
//   DATABASE_URL or POSTGRES_URL - Neon connection string (Vercel > Storage > Neon sets it for you)
//   DEFAULT_PASSWORD  - first password of the bootstrap admin (only used while the user table is empty)
// Optional:
//   SESSION_SECRET    - signs login cookies (falls back to a hash of DATABASE_URL)
//   BOOTSTRAP_ADMIN   - Emp No of the first admin (default BSC/119)
// No personal data is stored in this code: employees are added in Settings (Add user / Import CSV).

const crypto = require("crypto");
const { Pool } = require("pg");

const COOKIE = "bsg_sess";
const SESSION_DAYS = 30;
const COMPANIES = ["bsc", "crayon"];

// Vercel's Neon integration may name the variable DATABASE_URL or POSTGRES_URL - accept either.
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";

let _pool = null;
function pool() {
  if (!DB_URL) {
    const e = new Error("Server is missing DATABASE_URL. In Vercel: Storage > Create Database > Neon, connect it to this project, then redeploy.");
    e.status = 500; throw e;
  }
  if (!_pool) {
    _pool = new Pool({ connectionString: DB_URL, max: 2, idleTimeoutMillis: 10000,
                       ssl: /localhost|127\.0\.0\.1/.test(DB_URL) ? false : { rejectUnauthorized: false } });
  }
  return _pool;
}
async function q(text, params) { return (await pool().query(text, params)).rows; }

// ---------- schema (self-creating, fast after the first call) ----------
let _ready = false;
async function ensureTables() {
  if (_ready) return;
  await q(`CREATE TABLE IF NOT EXISTS sales_users (
      emp_no       TEXT PRIMARY KEY,
      emp_key      TEXT UNIQUE NOT NULL,
      name         TEXT NOT NULL DEFAULT '',
      designation  TEXT NOT NULL DEFAULT '',
      dept         TEXT NOT NULL DEFAULT '',
      mobile       TEXT NOT NULL DEFAULT '',
      company      TEXT NOT NULL DEFAULT 'bsc',
      is_admin     BOOLEAN NOT NULL DEFAULT FALSE,
      can_insights BOOLEAN NOT NULL DEFAULT FALSE,
      active       BOOLEAN NOT NULL DEFAULT TRUE,
      pw_hash      TEXT NOT NULL DEFAULT '',
      pw_ver       INTEGER NOT NULL DEFAULT 1,
      must_change  BOOLEAN NOT NULL DEFAULT TRUE,
      failed       INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      last_login   TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const n = await q("SELECT count(*)::int AS n FROM sales_users");
  if (n[0].n === 0 && process.env.DEFAULT_PASSWORD) {
    const emp = normEmp(process.env.BOOTSTRAP_ADMIN || "BSC/119");
    await q(`INSERT INTO sales_users (emp_no, emp_key, name, company, is_admin, can_insights, pw_hash, must_change)
             VALUES ($1,$2,'Admin','bsc',TRUE,TRUE,$3,TRUE) ON CONFLICT DO NOTHING`,
            [emp, empKey(emp), hashPw(process.env.DEFAULT_PASSWORD)]);
  }
  _ready = true;
}

// ---------- helpers ----------
function normEmp(s) { return String(s || "").trim().toUpperCase().replace(/\s+/g, ""); }
function empKey(s) { return normEmp(s).replace(/[^A-Z0-9]/g, ""); }   // "bsc/119" == "BSC119" == "BSC-119"
function cleanMobile(s) { return String(s || "").replace(/\D/g, "").slice(-12); }

function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(String(pw), salt, 64).toString("hex");
  return `scrypt$${salt}$${h}`;
}
function checkPw(pw, stored) {
  const [alg, salt, h] = String(stored || "").split("$");
  if (alg !== "scrypt" || !salt || !h) return false;
  const got = crypto.scryptSync(String(pw), salt, 64);
  const want = Buffer.from(h, "hex");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
function tempPassword() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const b = crypto.randomBytes(8);
  let s = ""; for (let i = 0; i < 8; i++) s += abc[b[i] % abc.length];
  return s;
}
function pwProblem(pw) {
  pw = String(pw || "");
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use letters and at least one number.";
  return "";
}

// ---------- sessions (signed cookie) ----------
function secret() {
  return process.env.SESSION_SECRET ||
    crypto.createHash("sha256").update("bsg-sales-suite|" + DB_URL).digest("hex");
}
function sign(data) { return crypto.createHmac("sha256", secret()).update(data).digest("base64url"); }
function makeToken(u) {
  const body = Buffer.from(JSON.stringify({ e: u.emp_no, v: u.pw_ver, x: Date.now() + SESSION_DAYS * 864e5 })).toString("base64url");
  return body + "." + sign(body);
}
function readToken(tok) {
  const [body, sig] = String(tok || "").split(".");
  if (!body || !sig) return null;
  const want = sign(body);
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try { const d = JSON.parse(Buffer.from(body, "base64url").toString()); return d.x > Date.now() ? d : null; }
  catch { return null; }
}
function getCookie(req, name) {
  const m = String(req.headers.cookie || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : "";
}
function isHttps(req) { return (req.headers["x-forwarded-proto"] || "").includes("https") || process.env.VERCEL === "1"; }
function setSession(req, res, u) {
  res.setHeader("Set-Cookie", `${COOKIE}=${makeToken(u)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${isHttps(req) ? "; Secure" : ""}`);
}
function clearSession(req, res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? "; Secure" : ""}`);
}

// public view of a user (never send hashes)
function pub(u) {
  return { emp_no: u.emp_no, name: u.name, designation: u.designation, dept: u.dept, mobile: u.mobile,
           company: u.company, is_admin: u.is_admin, can_insights: u.is_admin || u.can_insights,
           active: u.active, must_change: u.must_change, last_login: u.last_login };
}

async function currentUser(req) {
  const d = readToken(getCookie(req, COOKIE));
  if (!d) return null;
  await ensureTables();
  const r = await q("SELECT * FROM sales_users WHERE emp_no=$1", [d.e]);
  const u = r[0];
  if (!u || !u.active || u.pw_ver !== d.v) return null;
  return u;
}

// Use inside an API handler. Returns the user, or sends 401/403 and returns null.
//   opts.admin    -> admins only
//   opts.company  -> user must belong to that company (admins can see all)
//   opts.insights -> user needs Customer Insights access
//   opts.allowMustChange -> allow users who still have to change their first password
async function requireUser(req, res, opts = {}) {
  let u;
  try { u = await currentUser(req); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); return null; }
  if (!u) { res.status(401).json({ error: "Please log in.", login: true }); return null; }
  if (u.must_change && !opts.allowMustChange) { res.status(403).json({ error: "Please set your own password first.", change: true }); return null; }
  if (opts.admin && !u.is_admin) { res.status(403).json({ error: "Admins only." }); return null; }
  if (opts.company && !u.is_admin && u.company !== opts.company) {
    res.status(403).json({ error: "You don't have access to the " + (opts.company === "bsc" ? "BSC" : "Crayon") + " trainer." }); return null;
  }
  if (opts.insights && !(u.is_admin || u.can_insights)) { res.status(403).json({ error: "You don't have access to Customer Insights." }); return null; }
  return u;
}

// Basic CSRF guard for POSTs: the request must come from this site.
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;                        // same-origin fetch from older browsers / curl
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}
function body(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b || "{}"); } catch { b = {}; } }
  return b || {};
}

module.exports = { q, ensureTables, normEmp, empKey, cleanMobile, hashPw, checkPw, tempPassword, pwProblem,
                   setSession, clearSession, pub, currentUser, requireUser, sameOrigin, body, COMPANIES };
