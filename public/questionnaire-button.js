/* Adds a "Call Questionnaire" button above "Ask Insights" on the Customer Insights page (BSC view only). */
(function () {
  var b = document.createElement("a");
  b.href = "questionnaire.html";
  b.id = "qbtn";
  b.textContent = "Call Questionnaire";
  b.style.cssText = "position:fixed;right:18px;bottom:72px;z-index:50;background:#fff;color:#14325c;" +
    "border:1.5px solid #14325c;border-radius:999px;padding:10px 18px;font:600 14px/1.2 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
    "box-shadow:0 6px 18px rgba(20,50,92,.22);text-decoration:none;display:none";
  document.body.appendChild(b);
  function sync() {
    var ask = document.getElementById("askbtn");
    var on = document.querySelector(".seg button.on");
    var bsc = !on || /bsc/i.test(on.textContent);
    var chatOpen = ask && ask.style.display === "none";
    b.style.display = bsc && !chatOpen ? "inline-block" : "none";
  }
  sync();
  setInterval(sync, 400);
})();
