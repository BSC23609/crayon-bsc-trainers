// "Ask Insights" chat for the Customer Insights dashboard (Vercel serverless).
// Answers management / sales questions from the analysed call data using Claude.
// Data files are rewritten daily by automation/build_analytics.py:
//   ../data/analytics_<company>.json  (aggregates + action plan)
//   ../data/calls_<company>.json      (compact per-call digest, no phone numbers)
// Needs Vercel env var ANTHROPIC_API_KEY (optional CHAT_MODEL, default claude-sonnet-5).

const AGG = {
  bsc: require("../data/analytics_bsc.json"),
  crayon: require("../data/analytics_crayon.json"),
};
const CALLS = {
  bsc: require("../data/calls_bsc.json"),
  crayon: require("../data/calls_crayon.json"),
};
const NAME = {
  bsc: "Bharat Steel Chennai (BSC), a steel products stockist and processor",
  crayon: "Crayon Roofings & Structures, a roofing sheets and structures dealer",
};
const MAX_ROWS = 80;

// Pick the call rows most relevant to the question (simple keyword overlap),
// falling back to the most recent calls.
function relevantRows(rows, question) {
  const words = String(question || "").toLowerCase().match(/[a-z\u0B80-\u0BFF0-9]{3,}/g) || [];
  const stop = new Set(["what","which","where","when","how","the","and","for","are","our","with","from","that","this","customers","customer","calls","call","they","them","why","most","more","much","many","does","did","can","give","show","tell"]);
  const keys = words.filter((w) => !stop.has(w));
  if (!keys.length) return rows.slice(0, MAX_ROWS);
  const scored = rows.map((r, i) => {
    const hay = JSON.stringify(r).toLowerCase().replace(/_/g, " ");
    let s = 0;
    for (const k of keys) if (hay.includes(k)) s++;
    return { r, s, i };
  });
  const hits = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.r);
  const out = hits.slice(0, MAX_ROWS);
  if (out.length < 40) for (const r of rows) { if (out.length >= 60) break; if (!out.includes(r)) out.push(r); }
  return out;
}

// Per-rep view (BSC: Varsha / Venkatesh). Returns the rep's name if the company has that rep's data.
function repOf(company, rep) {
  const r = String(rep || "").trim().toLowerCase();
  const reps = (AGG[company] && AGG[company].reps) || {};
  return Object.keys(reps).find((k) => k.toLowerCase() === r) || "";
}

function systemText(company, rep) {
  const src = rep ? AGG[company].reps[rep] : AGG[company];
  const agg = Object.assign({}, src);
  delete agg.sentiment_by_week;
  delete agg.reps;
  const scope = rep
    ? `\n\nSCOPE: this data covers ONLY the calls handled by sales rep ${rep}. Answer about ${rep}'s calls and give ${rep} specific, constructive coaching. If asked about the whole team or the other rep, say this view is limited to ${rep} and suggest the Overall tab.`
    : (AGG[company].rep_counts ? `\n\nThis is the OVERALL view (all reps). Calls per rep: ${JSON.stringify(AGG[company].rep_counts)}.` : "");
  return `You are "Ask Insights", an analyst for ${NAME[company]} in Tamil Nadu. You answer questions from the sales team and management using ONLY the call-analytics data below, which was extracted by AI from real recorded sales calls.${scope}

How to answer:
- Lead with the direct answer, then the numbers behind it (counts and %). Say how many calls a figure is based on. v2 fields (satisfaction, price reaction, behaviour, needs, rep_missed) cover "v2_calls" calls, not all calls.
- When asked for ideas (conversion, offers, loyalty, non-price benefits), use the ACTION PLAN and the data, and say which ideas the company may not offer yet and should evaluate.
- If the data cannot answer the question, say so plainly and suggest what to track. Never invent numbers, customer names, phone numbers or prices.
- Reply in the user's language (English, Tamil or Tamil-English). Keep it short and practical: a few sentences or a short list.

===== AGGREGATED DATA + ACTION PLAN (JSON) =====
${JSON.stringify(agg)}

Field key for call rows: d=date, seg=customer type, reg=region, out=outcome, sen=sentiment, sat=satisfied with the call, pr=reaction to price, p=products, ob=objections, need=non-price needs, beh=behaviour, miss=what the rep could have done better, q=customer questions, s=summary, rep=sales rep who handled the call (empty = not yet matched).`;
}

async function callClaude(key, body) {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY. Add it in Vercel > Settings > Environment Variables, then redeploy." });

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body || "{}");
    const company = String(body?.company || "crayon").toLowerCase();
    if (!AGG[company]) return res.status(400).json({ error: "Unknown company. Use bsc or crayon." });

    const history = (Array.isArray(body?.messages) ? body.messages : [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!history.length || history[history.length - 1].role !== "user")
      return res.status(400).json({ error: "Send a question." });

    const question = history[history.length - 1].content;
    const rep = repOf(company, body?.rep);
    const pool = (CALLS[company] || []).filter((r) => !rep || r.rep === rep);
    const rows = relevantRows(pool, question);
    const msgs = history.slice(0, -1).concat([{
      role: "user",
      content: "RELEVANT CALL ROWS (JSON):\n" + JSON.stringify(rows) + "\n\nQUESTION: " + question,
    }]);
    // Merge any accidental consecutive same-role turns (API needs alternation).
    const merged = [];
    for (const m of msgs) {
      if (merged.length && merged[merged.length - 1].role === m.role) merged[merged.length - 1].content += "\n\n" + m.content;
      else merged.push({ ...m });
    }
    while (merged.length && merged[0].role !== "user") merged.shift();

    const model = process.env.CHAT_MODEL || "claude-sonnet-5";
    const sys = systemText(company, rep);
    let r = await callClaude(key, {
      model, max_tokens: 1200, messages: merged,
      system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
    });
    let data = await r.json().catch(() => ({}));
    if (!r.ok && /cache/i.test(JSON.stringify(data))) {           // model without prompt caching
      r = await callClaude(key, { model, max_tokens: 1200, messages: merged, system: sys });
      data = await r.json().catch(() => ({}));
    }
    if (!r.ok) {
      const msg = data?.error?.message || ("HTTP " + r.status);
      return res.status(502).json({ error: "AI service error: " + msg });
    }
    const reply = (data.content || []).filter((p) => p.type === "text").map((p) => p.text).join("").trim();
    res.status(200).json({ reply: reply || "No answer came back. Please try rephrasing.", company, rep, rows_used: rows.length });
  } catch (e) {
    res.status(500).json({ error: "Server error: " + (e && e.message ? e.message : String(e)) });
  }
};
