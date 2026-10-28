/* Login guard for the Sales AI Suite pages.
   Include in <head>:  <script src="guard.js" data-need="home|trainer|insights|admin"></script>
   Hides the page until the login is confirmed, then sets window.BSG_USER and fires "bsg:user". */
(function () {
  var me = document.currentScript;
  var need = (me && me.getAttribute("data-need")) || "home";
  var root = document.documentElement;
  root.style.visibility = "hidden";

  function go(url) { location.replace(url); }
  var here = location.pathname.replace(/^\//, "") + location.search;

  fetch("/api/auth?action=me", { credentials: "same-origin", cache: "no-store" })
    .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
    .then(function (x) {
      if (x.s === 401 || !x.j.user) return go("login.html?next=" + encodeURIComponent(here));
      var u = x.j.user;
      if (u.must_change) return go("login.html?change=1&next=" + encodeURIComponent(here));

      if (need === "admin" && !u.is_admin) return go("index.html?denied=settings");
      if (need === "insights" && !u.can_insights) return go("index.html?denied=insights");
      if (need === "trainer") {
        var c = (new URLSearchParams(location.search).get("c") || "").toLowerCase();
        if (c !== "bsc" && c !== "crayon") c = u.company;
        if (!u.is_admin && c !== u.company) return go("index.html?denied=" + c);
      }
      window.BSG_USER = u;
      root.style.visibility = "";
      document.dispatchEvent(new CustomEvent("bsg:user", { detail: u }));
    })
    .catch(function () {
      root.style.visibility = "";
      document.body && document.body.insertAdjacentHTML("afterbegin",
        '<div style="background:#fdecea;color:#8a2c20;padding:10px;text-align:center;font:14px system-ui">Could not check your login. Check the internet connection and refresh.</div>');
    });

  // Any API call that says "please log in" sends the user to the login page.
  var _f = window.fetch;
  window.fetch = function (input) {
    var url = String((input && input.url) || input || "");
    return _f.apply(this, arguments).then(function (r) {
      if (r.status === 401 && url.indexOf("/api/auth") === -1) {
        go("login.html?next=" + encodeURIComponent(here));
      }
      return r;
    });
  };

  window.BSG_logout = function () {
    _f("/api/auth?action=logout", { method: "POST", credentials: "same-origin" })
      .then(function () { go("login.html"); }, function () { go("login.html"); });
  };
})();
