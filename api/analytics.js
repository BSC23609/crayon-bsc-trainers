// Serves the Customer Insights dataset for the dashboard.
// The weekly job (build_analytics.py) overwrites ../data/analytics_<company>.json.
const DATA = {
  bsc: require("../data/analytics_bsc.json"),
  crayon: require("../data/analytics_crayon.json"),
};
module.exports = async (req, res) => {
  const company = String((req.query && req.query.company) || "crayon").toLowerCase();
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(DATA[company] || DATA.crayon);
};
