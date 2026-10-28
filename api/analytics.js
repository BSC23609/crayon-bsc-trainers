// Serves the Customer Insights dataset for the dashboard.
// The weekly job (build_analytics.py) overwrites ../data/analytics_<company>.json.
const A = require("../lib/auth");

const DATA = {
  bsc: require("../data/analytics_bsc.json"),
  crayon: require("../data/analytics_crayon.json"),
};
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const user = await A.requireUser(req, res, { insights: true });   // login + Customer Insights access
  if (!user) return;
  const company = String((req.query && req.query.company) || "crayon").toLowerCase();
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(DATA[company] || DATA.crayon);
};
