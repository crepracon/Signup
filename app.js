(function () {
  "use strict";

  // Keep in sync with netlify/lib/game.mjs
  var CLASSES = {
    Warrior: "#C69B6D", Paladin: "#F48CBA", Hunter: "#AAD372", Rogue: "#FFF468", Priest: "#F7F4EC",
    Shaman: "#0070DD", Mage: "#3FC7EB", Warlock: "#8788EE", Druid: "#FF7C0A"
  };
  var RACES = {
    Horde: {
      "Orc": ["Warrior", "Hunter", "Mage", "Rogue", "Warlock", "Shaman"],
      "Tauren": ["Warrior", "Hunter", "Druid", "Shaman"],
      "Troll": ["Warrior", "Hunter", "Mage", "Rogue", "Priest", "Warlock", "Shaman"],
      "Undead": ["Warrior", "Mage", "Rogue", "Priest", "Warlock", "Paladin"],
      "Skyborne": ["Warrior", "Hunter", "Rogue", "Druid", "Shaman"]
    },
    Alliance: {
      "Human": ["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Mage", "Warlock"],
      "Dwarf": ["Warrior", "Hunter", "Rogue", "Priest", "Paladin", "Shaman"],
      "Gnome": ["Warrior", "Rogue", "Mage", "Warlock", "Priest"],
      "Night Elf": ["Warrior", "Hunter", "Rogue", "Priest", "Druid"],
      "Skyborne": ["Warrior", "Hunter", "Mage", "Rogue", "Druid"]
    }
  };
  var SERVERS = ["Normal", "PvP", "Roleplaying", "Hardcore", "Undecided"];
  var LAUNCH = Date.UTC(2026, 10, 4, 23, 0, 0); // Nov 4, 3 p.m. PST
  var API = "/api/roster";
  var POLL_MS = 5000;
  var EXAMPLE = [
    { name: "Grunthar", faction: "Horde", race: "Orc", cls: "Mage", role: "DPS", server: "PvP", note: "" },
    { name: "Mossback", faction: "Horde", race: "Tauren", cls: "Druid", role: "Healer", server: "PvP", note: "" },
    { name: "Vessa", faction: "Horde", race: "Undead", cls: "Paladin", role: "Tank", server: "PvP", note: "new combo" },
    { name: "Brannoc", faction: "Alliance", race: "Dwarf", cls: "Shaman", role: "Healer", server: "Normal", note: "" }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var players = EXAMPLE, isExample = true, loaded = false;
  var editingId = null, confirmDel = null, saving = false;
  var lastSync = 0, lastSig = "", pollTimer = null;

  // ---- per-device storage (edit keys, officer key) ----
  function readStore(k, fallback) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
  function writeStore(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var myKeys = readStore("forever-roster-keys", {});
  var adminKey = readStore("forever-roster-admin", "");
  var isAdmin = false;
  function canChange(p) { return !!p.id && (isAdmin || !!myKeys[p.id]); }
  function authHeaders(id) {
    var h = { "content-type": "application/json" };
    if (myKeys[id]) h["x-edit-key"] = myKeys[id];
    if (isAdmin && adminKey) h["x-admin-key"] = adminKey;
    return h;
  }

  // ---- countdown ----
  (function () {
    var d = Math.ceil((LAUNCH - Date.now()) / 86400000);
    if (d > 0) $("countdown").textContent = d;
    else { $("countdown").textContent = "Live"; $("countdownLbl").innerHTML = "since<br>Nov 4"; }
  })();

  SERVERS.forEach(function (r) { var o = document.createElement("option"); o.textContent = r; $("filterRuleset").appendChild(o); });

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function banner(f) { var b = el("span", "banner " + (f === "Horde" ? "h" : "a")); b.appendChild(el("span", "sigil")); b.appendChild(document.createTextNode(f)); return b; }
  function fillSelect(sel, items, ph) {
    sel.innerHTML = ""; var o = el("option", null, ph); o.value = ""; sel.appendChild(o);
    items.forEach(function (v) { var x = el("option", null, v); x.value = v; sel.appendChild(x); });
    sel.disabled = !items.length;
  }
  function faction() { var r = document.querySelector('input[name="faction"]:checked'); return r ? r.value : ""; }
  var UNDECIDED = "Undecided";
  function factionClasses(f) {
    var all = {}; Object.keys(RACES[f]).forEach(function (r) { RACES[f][r].forEach(function (c) { all[c] = true; }); });
    return Object.keys(CLASSES).filter(function (c) { return all[c]; });
  }
  function classOptions(f, r) {
    if (!f || !r) return [];
    return (r === UNDECIDED ? factionClasses(f) : RACES[f][r]).concat([UNDECIDED]);
  }
  function onFaction() { var f = faction(); fillSelect($("fRace"), f ? Object.keys(RACES[f]).concat([UNDECIDED]) : [], f ? "Choose race" : "Pick faction"); fillSelect($("fClass"), [], "Pick race"); }
  function onRace() { var f = faction(), r = $("fRace").value; fillSelect($("fClass"), classOptions(f, r), r ? "Choose class" : "Pick race"); }
  function charLabel(p) {
    var r = p.race === UNDECIDED ? "" : p.race, c = p.cls === UNDECIDED ? "" : p.cls;
    if (!r && !c) return "Race & class undecided";
    if (!r) return c + " (race undecided)";
    if (!c) return r + " (class undecided)";
    return r + " " + c;
  }
  $("fHorde").addEventListener("change", onFaction);
  $("fAlliance").addEventListener("change", onFaction);
  $("fRace").addEventListener("change", onRace);

  function key(p) { return p.server + "|" + p.faction; }
  function grouped(list) { var g = {}; list.forEach(function (p) { (g[key(p)] = g[key(p)] || []).push(p); }); return g; }

  // ---- render ----
  function render() {
    var list = players;
    $("exampleNote").hidden = !isExample;

    var groups = grouped(list);
    var keys = Object.keys(groups).sort(function (a, b) { return groups[b].length - groups[a].length; });
    var mainKey = keys.filter(function (k) { return k.indexOf("Undecided|") !== 0; })[0] || keys[0];
    var g = $("groups"); g.innerHTML = "";
    if (!keys.length) g.appendChild(el("p", "hint", "No one has signed yet."));
    keys.forEach(function (k) {
      var parts = k.split("|"), ps = groups[k];
      var c = el("div", "gcell" + (k === mainKey && keys.length > 1 ? " main" : ""));
      var top = el("div", "top"); top.appendChild(el("span", "count tab", String(ps.length))); top.appendChild(banner(parts[1])); c.appendChild(top);
      c.appendChild(el("div", "srv", parts[0] + " server"));
      c.appendChild(el("div", "who", ps.map(function (p) { return p.name; }).join(", ")));
      if (keys.length > 1) c.appendChild(el("span", "note-tag " + (k === mainKey ? "main" : "split"), k === mainKey ? "The main host" : "Can't group with the main host"));
      g.appendChild(c);
    });

    var cb = $("classBars"); cb.innerHTML = ""; cb.appendChild(el("div", "lbl", "Classes"));
    var cc = {}; list.forEach(function (p) { cc[p.cls] = (cc[p.cls] || 0) + 1; });
    var max = Math.max.apply(null, [1].concat(Object.keys(cc).map(function (k) { return cc[k]; })));
    Object.keys(CLASSES).forEach(function (c) {
      var r = el("div", "bar"); r.appendChild(el("span", null, c));
      var t = el("div", "track"), f = el("div", "fill"); f.style.width = ((cc[c] || 0) / max * 100) + "%"; f.style.background = CLASSES[c]; t.appendChild(f);
      r.appendChild(t); r.appendChild(el("span", "n tab", String(cc[c] || 0))); cb.appendChild(r);
    });
    if (cc[UNDECIDED]) {
      var ur = el("div", "bar"); ur.appendChild(el("span", null, UNDECIDED));
      var ut = el("div", "track"), uf = el("div", "fill"); uf.style.width = (cc[UNDECIDED] / max * 100) + "%"; uf.style.background = "rgba(52,36,15,.35)"; ut.appendChild(uf);
      ur.appendChild(ut); ur.appendChild(el("span", "n tab", String(cc[UNDECIDED]))); cb.appendChild(ur);
    }

    var rr = $("roles"); rr.innerHTML = "";
    [["Tank", "Tanks"], ["Healer", "Healers"], ["DPS", "DPS"]].forEach(function (x) {
      var n = list.filter(function (p) { return p.role === x[0]; }).length;
      var b = el("div", "role"); b.appendChild(el("span", "num tab", String(n))); b.appendChild(el("span", "lbl", x[1])); rr.appendChild(b);
    });

    var rb = $("raceBars"); rb.innerHTML = ""; rb.appendChild(el("div", "lbl", "Races"));
    var rc = {}; list.forEach(function (p) { rc[p.race] = (rc[p.race] || 0) + 1; });
    var rk = Object.keys(rc).sort(function (a, b) { return (a === UNDECIDED) - (b === UNDECIDED) || rc[b] - rc[a]; });
    var rmax = Math.max.apply(null, [1].concat(rk.map(function (k) { return rc[k]; })));
    if (!rk.length) rb.appendChild(el("p", "hint", "None yet."));
    rk.forEach(function (r) {
      var row = el("div", "bar"); row.appendChild(el("span", null, r));
      var t = el("div", "track"), f = el("div", "fill"); f.style.width = (rc[r] / rmax * 100) + "%"; f.style.background = r === UNDECIDED ? "rgba(52,36,15,.35)" : "#9C7A34"; t.appendChild(f);
      row.appendChild(t); row.appendChild(el("span", "n tab", String(rc[r]))); rb.appendChild(row);
    });

    var fr = $("filterRuleset").value, ff = $("filterFaction").value;
    var shown = list.filter(function (p) { return (!fr || p.server === fr) && (!ff || p.faction === ff); })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    $("rosterCount").textContent = "· " + shown.length + (shown.length === list.length ? "" : " of " + list.length);
    var ro = $("roster"); ro.innerHTML = "";
    if (!shown.length) ro.appendChild(el("p", "hint", "No one matches these filters."));
    shown.forEach(function (p, i) {
      var row = el("div", "row");
      row.appendChild(el("span", "idx tab", String(i + 1) + "."));
      var nm = el("div", "name", p.name);
      if (!isExample && myKeys[p.id]) nm.appendChild(el("span", "mine", "you"));
      row.appendChild(nm);
      var ch = el("div", "char"); var gem = el("span", "gem"); gem.style.background = CLASSES[p.cls] || "transparent"; ch.appendChild(gem);
      var tx = el("div"); tx.appendChild(el("div", null, charLabel(p) + " · " + p.role)); if (p.note) tx.appendChild(el("div", "sub", p.note));
      ch.appendChild(tx); row.appendChild(ch);
      var wh = el("div", "where"); wh.appendChild(banner(p.faction)); wh.appendChild(el("span", "srvname", p.server)); row.appendChild(wh);
      var acts = el("div", "acts");
      if (!isExample && canChange(p)) {
        if (confirmDel === p.id) {
          var y = el("button", "small", "Strike?"); y.type = "button"; y.addEventListener("click", function () { remove(p.id); }); acts.appendChild(y);
          var n = el("button", "small plain", "Keep"); n.type = "button"; n.addEventListener("click", function () { confirmDel = null; render(); }); acts.appendChild(n);
        } else {
          var e = el("button", "small plain", "Edit"); e.type = "button"; e.addEventListener("click", function () { startEdit(p); }); acts.appendChild(e);
          var x = el("button", "small plain", "Remove"); x.type = "button"; x.addEventListener("click", function () { confirmDel = p.id; render(); }); acts.appendChild(x);
        }
      }
      row.appendChild(acts); ro.appendChild(row);
    });
  }
  $("filterRuleset").addEventListener("change", render);
  $("filterFaction").addEventListener("change", render);

  // ---- live sync ----
  function setLive(ok, text) { $("live").classList.toggle("off", !ok); $("liveText").textContent = text; }
  function liveLabel() {
    if (!lastSync) return;
    var s = Math.round((Date.now() - lastSync) / 1000);
    setLive(true, "Live · updated " + (s < 5 ? "just now" : s + "s ago"));
  }
  setInterval(liveLabel, 1000);

  function applyPlayers(list) {
    var sig = JSON.stringify(list);
    lastSync = Date.now(); loaded = true; liveLabel();
    if (sig === lastSig) return;
    lastSig = sig;
    if (list.length) { players = list; isExample = false; } else { players = EXAMPLE; isExample = true; }
    if (confirmDel && !list.some(function (p) { return p.id === confirmDel; })) confirmDel = null;
    render();
  }

  function refresh() {
    return fetch(API, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { applyPlayers(d.players || []); })
      .catch(function () { setLive(false, loaded ? "Connection lost · retrying" : "Can't reach the roster · retrying"); });
  }
  function schedule() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(function () { refresh().then(schedule); }, document.hidden ? POLL_MS * 6 : POLL_MS);
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { refresh().then(schedule); } });

  // ---- form ----
  function setMsg(t, k) { var m = $("formMsg"); m.textContent = t; m.className = "msg" + (k ? " " + k : ""); }
  function startEdit(p) {
    editingId = p.id; $("fName").value = p.name;
    (p.faction === "Horde" ? $("fHorde") : $("fAlliance")).checked = true; onFaction();
    $("fRace").value = p.race; onRace(); $("fClass").value = p.cls;
    $("fRole").value = p.role || "DPS"; $("fRuleset").value = p.server; $("fNote").value = p.note || "";
    $("formTitle").textContent = "Amend " + p.name; $("saveBtn").textContent = "Save changes"; $("cancelBtn").hidden = false; setMsg("");
    $("fName").focus();
  }
  function resetForm() {
    editingId = null; $("planForm").reset(); onFaction();
    $("formTitle").textContent = "Enlist"; $("saveBtn").textContent = "Sign the roll"; $("cancelBtn").hidden = true;
  }
  $("cancelBtn").addEventListener("click", function () { resetForm(); setMsg(""); });

  function readError(r) {
    return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.error || "Couldn't save just now. Try again in a moment."); });
  }

  $("planForm").addEventListener("submit", function (ev) {
    ev.preventDefault(); if (saving) return;
    var data = {
      name: $("fName").value.trim(), faction: faction(), race: $("fRace").value, cls: $("fClass").value,
      role: $("fRole").value, server: $("fRuleset").value, note: $("fNote").value.trim()
    };
    if (!data.name) return setMsg("Add your Discord name.", "err");
    if (!data.faction) return setMsg("Choose Horde or Alliance.", "err");
    if (!data.race) return setMsg("Choose a race.", "err");
    if (!data.cls) return setMsg("Choose a class.", "err");
    saving = true; $("saveBtn").disabled = true;
    var wasEdit = !!editingId;
    var req = wasEdit
      ? fetch(API + "?id=" + encodeURIComponent(editingId), { method: "PUT", headers: authHeaders(editingId), body: JSON.stringify(data) })
      : fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    req.then(function (r) { return r.ok ? r.json() : readError(r); })
      .then(function (d) {
        if (!wasEdit && d.editKey && d.player) { myKeys[d.player.id] = d.editKey; writeStore("forever-roster-keys", myKeys); }
        setMsg(wasEdit ? "Changes saved." : data.name + " has signed the roll.", "ok");
        resetForm(); return refresh();
      })
      .catch(function (e) { setMsg(e.message, "err"); })
      .then(function () { saving = false; $("saveBtn").disabled = false; });
  });

  function remove(id) {
    confirmDel = null;
    fetch(API + "?id=" + encodeURIComponent(id), { method: "DELETE", headers: authHeaders(id) })
      .then(function (r) { return r.ok ? r.json() : readError(r); })
      .then(function () {
        if (myKeys[id]) { delete myKeys[id]; writeStore("forever-roster-keys", myKeys); }
        if (editingId === id) resetForm();
        return refresh();
      })
      .catch(function (e) { setMsg(e.message, "err"); render(); });
    render();
  }

  // ---- officer (admin) mode: open the page with #admin ----
  function checkAdmin(k) {
    return fetch(API + "?checkAdmin=1", { headers: { "x-admin-key": k }, cache: "no-store" })
      .then(function (r) { return r.json(); }).then(function (d) { return !!d.ok; }).catch(function () { return false; });
  }
  function setupAdmin() {
    var want = location.hash === "#admin" || !!adminKey;
    $("adminBox").hidden = !want;
    if (adminKey) {
      checkAdmin(adminKey).then(function (ok) {
        isAdmin = ok;
        $("adminMsg").className = "msg" + (ok ? " ok" : "");
        $("adminMsg").textContent = ok ? "Officer mode: you can edit or remove any entry." : "";
        if (!ok) { adminKey = ""; writeStore("forever-roster-admin", ""); $("adminBox").hidden = location.hash !== "#admin"; }
        render();
      });
    }
  }
  $("adminBtn").addEventListener("click", function () {
    var k = $("adminKey").value.trim(); if (!k) return;
    checkAdmin(k).then(function (ok) {
      isAdmin = ok;
      if (ok) { adminKey = k; writeStore("forever-roster-admin", k); $("adminKey").value = ""; }
      $("adminMsg").className = "msg " + (ok ? "ok" : "err");
      $("adminMsg").textContent = ok ? "Officer mode: you can edit or remove any entry." : "That key doesn't match.";
      render();
    });
  });
  window.addEventListener("hashchange", setupAdmin);

  // ---- Discord copy ----
  function discordText() {
    var list = isExample ? [] : players, d = Math.ceil((LAUNCH - Date.now()) / 86400000);
    var lines = ["**⚔️ WoW Forever Roster**" + (d > 0 ? " — " + d + " days to launch" : "")];
    var g = grouped(list);
    Object.keys(g).sort(function (a, b) { return g[b].length - g[a].length; }).forEach(function (k) {
      var parts = k.split("|"); lines.push(""); lines.push("__" + parts[0] + " · " + parts[1] + "__ — " + g[k].length);
      g[k].sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (p) { lines.push("• " + p.name + ": " + charLabel(p) + " · " + p.role); });
    });
    if (!list.length) lines.push("No one has signed yet.");
    lines.push(""); lines.push("Sign up: " + location.origin);
    return lines.join("\n");
  }
  $("copyBtn").addEventListener("click", function () {
    var t = discordText(), m = $("copyMsg"), fb = $("copyFallback");
    function fallback() { fb.value = t; fb.hidden = false; fb.focus(); fb.select(); m.className = "msg"; m.textContent = "Select all and copy the text below, then paste it in Discord."; }
    try { navigator.clipboard.writeText(t).then(function () { fb.hidden = true; m.className = "msg ok"; m.textContent = "Copied. Paste it into your Discord channel."; }, fallback); }
    catch (e) { fallback(); }
  });

  render();
  setupAdmin();
  refresh().then(schedule);
})();
