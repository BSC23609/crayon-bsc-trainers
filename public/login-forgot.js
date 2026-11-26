/* Adds "Forgot password? Reset on WhatsApp" to the login page. */
(function () {
  var f = document.getElementById("loginForm") || document.querySelector("form");
  if (!f) return;
  var links = f.querySelector(".links");
  if (!links) { links = document.createElement("div"); links.className = "links"; f.appendChild(links); }
  links.innerHTML = '<a id="forgotLink" href="forgot.html">Forgot password? Reset on WhatsApp</a>';
  var a = links.querySelector("a"), emp = document.getElementById("emp");
  a.addEventListener("click", function () {
    if (emp && emp.value.trim()) a.href = "forgot.html?emp=" + encodeURIComponent(emp.value.trim());
  });
})();
