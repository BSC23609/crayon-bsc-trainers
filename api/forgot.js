// Forgot password via WhatsApp OTP (WATI) for the Sales AI Suite.
//   GET  /api/forgot?action=check            -> is WhatsApp set up? (no secrets shown)
//   POST /api/forgot?action=send   {emp_no}  -> sends a 6-digit code to the user's saved mobile on WhatsApp
//   POST /api/forgot?action=reset  {emp_no, otp, new_password} -> sets the new password and signs in
// Vercel env vars (same WATI account as the other BSG apps):
//   WATI_API_ENDPOINT  e.g. https://live-mt-server.wati.io/123456   (also accepted: WATI_ENDPOINT, WATI_API_URL, WATI_BASE_URL, WATI_URL)
//   WATI_TOKEN         the WATI API access token                   (also accepted: WATI_API_TOKEN, WATI_ACCESS_TOKEN)
//   WATI_OTP_TEMPLATE  optional, default otp_password2 (the shared Authentication template)
const crypto = require("crypto");
const A = require("../lib/auth");

const OTP_MIN = 10, MAX_TRIES = 5, RESEND_SEC = 60, MAX_PER_HOUR = 5;
const pick = (...names) => { for (const n of names) if (process.env[n]) return String(process.env[n]).trim(); return ""; };
const WATI_URL = pick("WATI_API_ENDPOINT", "WATI_ENDPOINT", "WATI_API_URL", "WATI_BASE_URL", "WATI_URL")
  .replace(/\/+$/, "").replace(/\/api\/v1$/i, "");
const WATI_TOKEN = pick("WATI_TOKEN", "WATI_API_TOKEN", "WATI_ACCESS_TOKEN").replace(/^Bearer\s+/i, "");
const TEMPLATE = pick("WATI_OTP_TEMPLATE") || "otp_password2";

let _otpReady = false;
async function ensureOtp() {
  if (_otpReady) return;
  await A.ensureTables();
  await A.q(`CREATE TABLE IF NOT EXISTS sales_pw_otp (
      emp_no      TEXT PRIMARY KEY,
      otp_hash    TEXT NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      tries       INTEGER NOT NULL DEFAULT 0,
      sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      hour_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
      hour_count  INTEGER NOT NULL DEFAULT 0)`);
  _otpReady = true;
}
function waNumber(m) {
  const d = A.cleanMobile(m);
  if (d.length === 10) return "91" + d;
  if (d.length === 12 && d.startsWith("91")) return d;
  return d.length >= 10 ? d : "";
}
const mask = (n) => "******" + n.slice(-4);

async function sendWhatsApp(number, otp) {
  if (!WATI_URL || !WATI_TOKEN) {
    const e = new Error("WhatsApp is not set up on the server yet. Please ask an admin to reset your password.");
    e.status = 503; throw e;
  }
  const url = `${WATI_URL}/api/v1/sendTemplateMessage?whatsappNumber=${number}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Authorization": "Bearer " + WATI_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ template_name: TEMPLATE, broadcast_name: "sales_pw_reset",
                           parameters: [{ name: "1", value: otp }] }),
  });
  let j = {}; try { j = await r.json(); } catch (_) {}
  if (!r.ok || j.result === false || j.validWhatsAppNumber === false) {
    console.error("WATI send failed", r.status, JSON.stringify(j).slice(0, 400));
    const e = new Error(j.validWhatsAppNumber === false
      ? "Your saved mobile number is not on WhatsApp. Please ask an admin to update it."
      : "Could not send the WhatsApp code right now. Please try again in a minute.");
    e.status = 502; throw e;
  }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const action = String((req.query && req.query.action) || "");
  try {
    if (action === "check") return res.status(200).json({ whatsapp_ready: !!(WATI_URL && WATI_TOKEN), template: TEMPLATE });
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
    if (!A.sameOrigin(req)) return res.status(403).json({ error: "Bad origin" });
    const b = A.body(req);
    await ensureOtp();
    const key = A.empKey(b.emp_no);
    if (!key) return res.status(400).json({ error: "Enter your Emp No." });
    const u = (await A.q("SELECT * FROM sales_users WHERE emp_key=$1", [key]))[0];

    if (action === "send") {
      if (!u) return res.status(404).json({ error: "This Emp No is not registered. Please check it, or ask an admin." });
      if (!u.active) return res.status(403).json({ error: "This login is deactivated. Please contact an admin." });
      const number = waNumber(u.mobile);
      if (!number) return res.status(400).json({ error: "No mobile number is saved for you. Please ask an admin to add it in Settings." });
      const prev = (await A.q("SELECT * FROM sales_pw_otp WHERE emp_no=$1", [u.emp_no]))[0];
      const now = Date.now();
      if (prev) {
        const wait = RESEND_SEC - Math.floor((now - new Date(prev.sent_at).getTime()) / 1000);
        if (wait > 0) return res.status(429).json({ error: `Please wait ${wait} seconds before asking for a new code.`, wait });
        const inHour = now - new Date(prev.hour_start).getTime() < 3600e3;
        if (inHour && prev.hour_count >= MAX_PER_HOUR) return res.status(429).json({ error: "Too many codes requested. Please try again after an hour, or ask an admin." });
      }
      const otp = String(crypto.randomInt(100000, 1000000));
      await sendWhatsApp(number, otp);
      await A.q(`INSERT INTO sales_pw_otp (emp_no, otp_hash, expires_at, tries, sent_at, hour_start, hour_count)
                 VALUES ($1, $2, now() + interval '${OTP_MIN} minutes', 0, now(), now(), 1)
                 ON CONFLICT (emp_no) DO UPDATE SET otp_hash=EXCLUDED.otp_hash, expires_at=EXCLUDED.expires_at, tries=0, sent_at=now(),
                   hour_start = CASE WHEN sales_pw_otp.hour_start < now() - interval '1 hour' THEN now() ELSE sales_pw_otp.hour_start END,
                   hour_count = CASE WHEN sales_pw_otp.hour_start < now() - interval '1 hour' THEN 1 ELSE sales_pw_otp.hour_count + 1 END`,
                [u.emp_no, A.hashPw(otp)]);
      return res.status(200).json({ ok: true, to: mask(number), minutes: OTP_MIN, name: u.name || "" });
    }

    if (action === "reset") {
      const otp = String(b.otp || "").replace(/\D/g, "");
      const np = String(b.new_password || "");
      const row = u && (await A.q("SELECT * FROM sales_pw_otp WHERE emp_no=$1", [u.emp_no]))[0];
      if (!u || !row || new Date(row.expires_at) < new Date()) return res.status(400).json({ error: "The code has expired. Please request a new one." });
      if (!u.active) return res.status(403).json({ error: "This login is deactivated. Please contact an admin." });
      if (row.tries >= MAX_TRIES) {
        await A.q("UPDATE sales_pw_otp SET expires_at=now() WHERE emp_no=$1", [u.emp_no]);
        return res.status(429).json({ error: "Too many wrong codes. Please request a new one." });
      }
      if (otp.length !== 6 || !A.checkPw(otp, row.otp_hash)) {
        await A.q("UPDATE sales_pw_otp SET tries=tries+1 WHERE emp_no=$1", [u.emp_no]);
        const left = MAX_TRIES - row.tries - 1;
        return res.status(400).json({ error: left > 0 ? `Wrong code. ${left} ${left === 1 ? "try" : "tries"} left.` : "Wrong code. Please request a new one." });
      }
      const bad = A.pwProblem(np);
      if (bad) return res.status(400).json({ error: bad });
      const r = await A.q(`UPDATE sales_users SET pw_hash=$2, pw_ver=pw_ver+1, must_change=FALSE, failed=0, locked_until=NULL,
                             last_login=now(), updated_at=now() WHERE emp_no=$1 RETURNING *`, [u.emp_no, A.hashPw(np)]);
      await A.q("DELETE FROM sales_pw_otp WHERE emp_no=$1", [u.emp_no]);
      A.setSession(req, res, r[0]);
      return res.status(200).json({ ok: true, user: A.pub(r[0]) });
    }
    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || String(e) });
  }
};
