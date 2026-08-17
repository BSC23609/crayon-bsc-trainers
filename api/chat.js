// Crayon / BSC Sales Guru — secure, company-aware chat proxy (Vercel serverless).
// Knowledge bases live in ../kb/*.json and are refreshed weekly by the automation
// (see WEEKLY_AUTOMATION_SETUP.md) — this file does not need editing when they update.

const KB = {
  bsc: require("../kb/bsc.json").kb,
  crayon: require("../kb/crayon.json").kb,
};
const COMPANY_NAME = {
  bsc: "BSC (Bharat Steel Group)",
  crayon: "Crayon Roofing & Structures",
};

function systemPrompt(name) {
  return `You are ${name} Sales Guru, an internal sales-training assistant for ${name}, which sells steel roofing sheets and accessories in Tamil Nadu.

You train new sales joinees to sell over the phone to Tamil-speaking customers. Your knowledge comes ONLY from the KNOWLEDGE BASE below, distilled from real sales calls. Ground every answer in it. If something is not covered, say so honestly instead of inventing products, prices, or policies. If the knowledge base notes that this company's own calls are still pending, tell the trainee that specifics should be confirmed with their manager, and coach on general best practice.

Language: reply in the language the trainee uses. Most use Tamil or Tamil-English mix — match them, keep Tamil natural and colloquial like the real reps (technical terms can stay in English).

What you do:
- Answer "how do I handle this?" questions using how the best reps actually did it; quote a real example line.
- Roleplay a realistic customer (fabricator, dealer, builder, end-user) when asked. Stay in character until the trainee finishes, THEN break character and give specific feedback: what they did well, what they missed, the stronger line.
- Quiz and drill on products, the brand ladder, rates, and objections.
- Be warm, practical, encouraging — a senior colleague who wants them to win. One idea at a time. Keep replies fairly short and conversational, not lectures.

Never invent specifics. If a trainee needs an exact current price or policy not in the knowledge base, tell them to confirm with their manager/MD.`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  const key = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
  if (!key) {
    res.status(500).json({ error: "Server is missing GEMINI_API_KEY. Add it in Vercel > Settings > Environment Variables, then redeploy." });
    return;
  }
  const baseUrl = process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
  const models = process.env.CHAT_MODEL
    ? [process.env.CHAT_MODEL]
    : ["gemini-flash-latest", "gemini-3.6-flash", "gemini-3-flash-preview", "gemini-3.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body || "{}");
    const company = String(body?.company || "crayon").toLowerCase();
    if (!KB[company]) {
      res.status(400).json({ error: "Unknown company '" + company + "'. Use bsc or crayon." });
      return;
    }
    const history = Array.isArray(body?.messages) ? body.messages.slice(-16) : [];
    const chatMessages = [
      { role: "system", content: systemPrompt(COMPANY_NAME[company]) + "\n\n===== KNOWLEDGE BASE =====\n" + KB[company] },
      ...history,
    ];

    let lastError = "AI service error";
    for (const model of models) {
      const r = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({ model, messages: chatMessages, temperature: 0.3, max_tokens: 700 }),
      });
      const data = await r.json();
      if (r.ok) {
        const reply = data?.choices?.[0]?.message?.content?.trim() || "(no reply)";
        res.status(200).json({ reply, model, company });
        return;
      }
      const providerMsg = data?.error?.message || JSON.stringify(data).slice(0, 300);
      lastError = "AI service error (" + r.status + ") [" + model + "]: " + providerMsg;
      if (!(r.status === 404 || /model/i.test(providerMsg))) break;
    }
    res.status(502).json({ error: lastError });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};
