// User management for admins (Settings page).
//   GET  /api/users?company=bsc|crayon|all
//   POST /api/users?action=save    {emp_no, name, designation, dept, mobile, company, is_admin, can_insights, is_new}
//   POST /api/users?action=reset   {emp_no}               -> new temporary password
//   POST /api/users?action=active  {emp_no, active}
//   POST /api/users?action=import  {rows:[{emp_no,name,designation,dept,mobile,company,admin,insights}]}
const A = require("../lib/auth");

const yes = (v) => /^(1|y|yes|true|admin)$/i.test(String(v == null ? "" : v).trim());

async function activeAdminsExcept(emp) {
  const r = await A.q("SELECT count(*)::int AS n FROM sales_users WHERE is_admin AND active AND emp_no<>$1", [emp]);
  return r[0].n;
}

function clean(b) {
  const company = String(b.company || "bsc").toLowerCase().trim();
  return {
    emp_no: A.normEmp(b.emp_no),
    name: String(b.name || "").trim().slice(0, 80),
    designation: String(b.designation || "").trim().slice(0, 80),
    dept: String(b.dept || "").trim().slice(0, 40),
    mobile: A.cleanMobile(b.mobile),
    company: A.COMPANIES.includes(company) ? company : "",
    is_admin: typeof b.is_admin === "boolean" ? b.is_admin : yes(b.admin),
    can_insights: typeof b.can_insights === "boolean" ? b.can_insights : yes(b.insights),
  };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "POST" && !A.sameOrigin(req)) return res.status(403).json({ error: "Bad origin" });
    const me = await A.requireUser(req, res, { admin: true });
    if (!me) return;
    const action = String((req.query && req.query.action) || "list");

    if (req.method === "GET") {
      const c = String((req.query && req.query.company) || "all").toLowerCase();
      const rows = A.COMPANIES.includes(c)
        ? await A.q("SELECT * FROM sales_users WHERE company=$1 ORDER BY emp_key", [c])
        : await A.q("SELECT * FROM sales_users ORDER BY company, emp_key");
      const counts = await A.q("SELECT company, count(*)::int AS n FROM sales_users GROUP BY company");
      return res.status(200).json({ users: rows.map(A.pub), counts: Object.fromEntries(counts.map((r) => [r.company, r.n])), me: me.emp_no });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST" });
    const b = A.body(req);

    if (action === "save") {
      const u = clean(b);
      if (!u.emp_no || !A.empKey(u.emp_no)) return res.status(400).json({ error: "Emp No is required." });
      if (!u.name) return res.status(400).json({ error: "Name is required." });
      if (!u.company) return res.status(400).json({ error: "Company must be BSC or Crayon." });
      const existing = (await A.q("SELECT * FROM sales_users WHERE emp_key=$1", [A.empKey(u.emp_no)]))[0];
      if (b.is_new) {
        if (existing) return res.status(409).json({ error: `Emp No ${existing.emp_no} already exists (${existing.name}).` });
        const temp = A.tempPassword();
        await A.q(`INSERT INTO sales_users (emp_no, emp_key, name, designation, dept, mobile, company, is_admin, can_insights, pw_hash, must_change)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE)`,
                  [u.emp_no, A.empKey(u.emp_no), u.name, u.designation, u.dept, u.mobile, u.company, u.is_admin, u.can_insights, A.hashPw(temp)]);
        return res.status(200).json({ ok: true, created: true, emp_no: u.emp_no, temp_password: temp });
      }
      if (!existing) return res.status(404).json({ error: "User not found." });
      if (existing.emp_no === me.emp_no && !u.is_admin) return res.status(400).json({ error: "You can't remove your own admin rights." });
      if (existing.is_admin && !u.is_admin && (await activeAdminsExcept(existing.emp_no)) === 0)
        return res.status(400).json({ error: "At least one active admin is needed." });
      await A.q(`UPDATE sales_users SET name=$2, designation=$3, dept=$4, mobile=$5, company=$6, is_admin=$7, can_insights=$8, updated_at=now()
                 WHERE emp_no=$1`,
                [existing.emp_no, u.name, u.designation, u.dept, u.mobile, u.company, u.is_admin, u.can_insights]);
      return res.status(200).json({ ok: true, updated: true });
    }

    if (action === "reset") {
      const u = (await A.q("SELECT * FROM sales_users WHERE emp_key=$1", [A.empKey(b.emp_no)]))[0];
      if (!u) return res.status(404).json({ error: "User not found." });
      const temp = A.tempPassword();
      await A.q(`UPDATE sales_users SET pw_hash=$2, pw_ver=pw_ver+1, must_change=TRUE, failed=0, locked_until=NULL, updated_at=now()
                 WHERE emp_no=$1`, [u.emp_no, A.hashPw(temp)]);
      return res.status(200).json({ ok: true, emp_no: u.emp_no, name: u.name, mobile: u.mobile, temp_password: temp });
    }

    if (action === "active") {
      const u = (await A.q("SELECT * FROM sales_users WHERE emp_key=$1", [A.empKey(b.emp_no)]))[0];
      if (!u) return res.status(404).json({ error: "User not found." });
      const on = !!b.active;
      if (!on && u.emp_no === me.emp_no) return res.status(400).json({ error: "You can't deactivate yourself." });
      if (!on && u.is_admin && (await activeAdminsExcept(u.emp_no)) === 0) return res.status(400).json({ error: "At least one active admin is needed." });
      await A.q("UPDATE sales_users SET active=$2, pw_ver=pw_ver+CASE WHEN $2::boolean THEN 0 ELSE 1 END, updated_at=now() WHERE emp_no=$1",
                [u.emp_no, on]);
      return res.status(200).json({ ok: true });
    }

    if (action === "import") {
      const rows = Array.isArray(b.rows) ? b.rows.slice(0, 1000) : [];
      if (!rows.length) return res.status(400).json({ error: "No rows found. The first line must be the header row." });
      const created = [], updated = [], skipped = [];
      for (const raw of rows) {
        const u = clean(raw);
        if (!u.company) u.company = "bsc";
        if (!A.empKey(u.emp_no) || !u.name) { skipped.push({ emp_no: u.emp_no || "(blank)", reason: "Emp No and Name are required" }); continue; }
        const ex = (await A.q("SELECT emp_no FROM sales_users WHERE emp_key=$1", [A.empKey(u.emp_no)]))[0];
        if (ex) {
          // keep the current admin's own rights so an import can't lock them out
          const isAdmin = ex.emp_no === me.emp_no ? true : u.is_admin;
          await A.q(`UPDATE sales_users SET name=$2, designation=$3, dept=$4, mobile=$5, company=$6, is_admin=$7, can_insights=$8, updated_at=now()
                     WHERE emp_no=$1`, [ex.emp_no, u.name, u.designation, u.dept, u.mobile, u.company, isAdmin, u.can_insights]);
          updated.push(ex.emp_no);
        } else {
          const temp = A.tempPassword();
          await A.q(`INSERT INTO sales_users (emp_no, emp_key, name, designation, dept, mobile, company, is_admin, can_insights, pw_hash, must_change)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE)`,
                    [u.emp_no, A.empKey(u.emp_no), u.name, u.designation, u.dept, u.mobile, u.company, u.is_admin, u.can_insights, A.hashPw(temp)]);
          created.push({ emp_no: u.emp_no, name: u.name, mobile: u.mobile, temp_password: temp });
        }
      }
      return res.status(200).json({ ok: true, created, updated, skipped });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || String(e) });
  }
};
