// Group single sign-on: receive a hand-off from the Bharat Steel Group portal (bsg-hub).
//   GET /api/sso?token=...&next=/...
// The portal signs the person in once, then redirects here with a one-minute token signed with
// GROUP_SSO_SECRET (shared only by the portal and this app; set it in Vercel > crayon-web >
// Environment Variables). We check it, find the user by Emp No and start the normal session.
// The Emp No / password login keeps working alongside this.
const crypto = require("crypto");
const A = require("../lib/auth");

function page(res, status, msg) {
  res.status(status).setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<body style="font-family:system-ui,sans-serif;max-width:440px;margin:15vh auto;padding:0 16px;text-align:center;color:#1e2b3a">
<div style="font-size:40px">🔒</div><h2 style="margin:8px 0">Could not sign you in</h2>
<p style="color:#5b6b7b">${msg}</p><p><a href="/login.html" style="color:#1f4e79;font-weight:600">Sign in with your Emp No</a></p></body>`);
}

function b64json(part) { return JSON.parse(Buffer.from(part, "base64url").toString("utf8")); }

// HS256 JWT check without extra packages.
function verify(token, secret, audience) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("bad token");
  const header = b64json(parts[0]);
  if (header.alg !== "HS256") throw new Error("bad alg");
  const want = crypto.createHmac("sha256", secret).update(parts[0] + "." + parts[1]).digest();
  const got = Buffer.from(parts[2], "base64url");
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) throw new Error("bad signature");
  const c = b64json(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (typeof c.exp !== "number" || c.exp + 10 < now) { const e = new Error("expired"); e.expired = true; throw e; }
  if (c.iss !== "bsg-hub") throw new Error("bad issuer");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(audience)) throw new Error("bad audience");
  return c;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  const secret = String(process.env.GROUP_SSO_SECRET || "").trim();
  if (!secret) return page(res, 401, "Group sign-in is not set up on Sales AI Suite yet.");
  let claims;
  try {
    claims = verify(req.query && req.query.token, secret, process.env.GROUP_SSO_APP_KEY || "sales-trainer");
  } catch (e) {
    return page(res, 401, e.expired ? "That sign-in link expired. Open the app again from the group portal."
                                    : "Group sign-in could not be verified.");
  }
  try {
    await A.ensureTables();
    const ident = String(claims.emp_no || claims.sub || "").trim();
    const key = ident.includes("@") ? "" : A.empKey(ident);
    const u = key ? (await A.q("SELECT * FROM sales_users WHERE emp_key=$1", [key]))[0] : null;
    if (!u || !u.active)
      return page(res, 403, "Your group account is not linked to a Sales AI Suite user. Ask an admin to add your Emp No here, or set it in the group portal.");
    let user = u;
    if (u.must_change) {
      // People who come through the portal never used their one-time password: retire it.
      user = (await A.q(`UPDATE sales_users SET pw_hash=$2, must_change=FALSE, updated_at=now()
                         WHERE emp_no=$1 RETURNING *`, [u.emp_no, A.hashPw(crypto.randomBytes(24).toString("hex"))]))[0];
    }
    await A.q("UPDATE sales_users SET failed=0, locked_until=NULL, last_login=now() WHERE emp_no=$1", [user.emp_no]);
    A.setSession(req, res, user);
    const next = String((req.query && req.query.next) || "");
    res.statusCode = 303;
    res.setHeader("Location", next.startsWith("/") && !next.startsWith("//") ? next : "/");
    return res.end();
  } catch (e) {
    console.error("group sso", e);
    return page(res, 500, "Something went wrong. Try again in a minute.");
  }
};
