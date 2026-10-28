// Login / logout / who-am-I / change password.
//   GET  /api/auth?action=me
//   POST /api/auth?action=login     {emp_no, password}
//   POST /api/auth?action=logout
//   POST /api/auth?action=change    {old_password, new_password}
const A = require("../lib/auth");

const MAX_FAILS = 8, LOCK_MIN = 10;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const action = String((req.query && req.query.action) || "me");
  try {
    if (action === "me") {
      const u = await A.currentUser(req);
      if (!u) return res.status(401).json({ error: "Please log in.", login: true });
      return res.status(200).json({ user: A.pub(u) });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
    if (!A.sameOrigin(req)) return res.status(403).json({ error: "Bad origin" });
    const b = A.body(req);

    if (action === "logout") { A.clearSession(req, res); return res.status(200).json({ ok: true }); }

    if (action === "login") {
      await A.ensureTables();
      const key = A.empKey(b.emp_no);
      const pw = String(b.password || "");
      if (!key || !pw) return res.status(400).json({ error: "Enter your Emp No and password." });
      const cnt = await A.q("SELECT count(*)::int AS n FROM sales_users");
      if (cnt[0].n === 0) return res.status(500).json({ error: "No users yet. Set DEFAULT_PASSWORD in Vercel and redeploy, then log in with the admin Emp No." });
      const u = (await A.q("SELECT * FROM sales_users WHERE emp_key=$1", [key]))[0];
      if (u && u.locked_until && new Date(u.locked_until) > new Date()) {
        const mins = Math.ceil((new Date(u.locked_until) - new Date()) / 60000);
        return res.status(429).json({ error: `Too many wrong attempts. Try again in ${mins} min, or ask an admin to reset your password.` });
      }
      if (!u || !u.active || !A.checkPw(pw, u.pw_hash)) {
        if (u) {
          const fails = u.failed + 1;
          const lock = fails >= MAX_FAILS;
          await A.q(`UPDATE sales_users SET failed=$2::int,
                       locked_until=CASE WHEN $3::boolean THEN now() + interval '${LOCK_MIN} minutes' ELSE NULL END
                     WHERE emp_no=$1`, [u.emp_no, lock ? 0 : fails, lock]);
        }
        if (u && !u.active) return res.status(403).json({ error: "This login is deactivated. Please contact an admin." });
        return res.status(401).json({ error: "Wrong Emp No or password." });
      }
      await A.q("UPDATE sales_users SET failed=0, locked_until=NULL, last_login=now() WHERE emp_no=$1", [u.emp_no]);
      A.setSession(req, res, u);
      return res.status(200).json({ user: A.pub(u) });
    }

    if (action === "change") {
      const u = await A.requireUser(req, res, { allowMustChange: true });
      if (!u) return;
      if (!A.checkPw(String(b.old_password || ""), u.pw_hash)) return res.status(400).json({ error: "Your current password is not correct." });
      const np = String(b.new_password || "");
      const bad = A.pwProblem(np);
      if (bad) return res.status(400).json({ error: bad });
      if (np === String(b.old_password)) return res.status(400).json({ error: "Choose a password different from the old one." });
      const r = await A.q(`UPDATE sales_users SET pw_hash=$2, pw_ver=pw_ver+1, must_change=FALSE, updated_at=now()
                           WHERE emp_no=$1 RETURNING *`, [u.emp_no, A.hashPw(np)]);
      A.setSession(req, res, r[0]);                // stay logged in on this device; other devices are signed out
      return res.status(200).json({ ok: true, user: A.pub(r[0]) });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || String(e) });
  }
};
