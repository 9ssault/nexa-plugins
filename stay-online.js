const ACCT_KEY = "ec.accounts";
const ON_KEY = "ec.so.on";
const PACE_KEY = "ec.so.pace";
const MAX_KEY = "ec.so.max";
const HB_KEY = "ec.so.hb";
const PACE_DEF = 300;
const PACE_MIN = 100;
const PACE_MAX = 5000;
const MAX_DEF = 400;
const MAX_MIN = 10;
const MAX_MAX = 1000;
const HB_DEF = 25000;
const HB_MIN = 10000;
const HB_MAX = 60000;
const GRACE_DEF = 6000;
const GRACE_MIN = 500;
const GRACE_MAX = 30000;
const PING_TIMEOUT = 15000;

const S = {
  api: null,
  on: false,
  stop: false,
  timer: null,
  paintT: null,
  rows: new Map(),
  cur: null,
  hasCur: false,
  lastOpen: 0,
  pauseUntil: 0,
  loginAt: 0,
  panel: null,
  body: null,
  els: {},
  offs: [],
  css: null,
  dirty: false,
  lastSync: 0,
  lastPaint: 0,
  lastErr: "",
  hardLimit: false,
};

function ls(k, d) {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : v;
  } catch {
    return d;
  }
}

function sNum(key, fallback, lo, hi) {
  let v;
  try {
    v = S.api?.settings?.get?.(key);
  } catch {}
  if (typeof v !== "number" || !Number.isFinite(v)) v = Number(ls("ec.so." + key, ""));
  if (!Number.isFinite(v) || v <= 0) v = fallback;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function cfg() {
  return {
    pace: sNum("pace", PACE_DEF, PACE_MIN, PACE_MAX),
    max: sNum("max", MAX_DEF, MAX_MIN, MAX_MAX),
    hb: sNum("hb", HB_DEF, HB_MIN, HB_MAX),
    grace: sNum("grace", GRACE_DEF, GRACE_MIN, GRACE_MAX),
  };
}

function readOn() {
  try {
    const v = S.api?.settings?.get?.("on");
    if (typeof v === "boolean") return v;
  } catch {}
  return ls(ON_KEY, "1") !== "0";
}

function migrate() {
  if (!S.api?.settings?.set) return;
  const old = [
    [ON_KEY, "on", (x) => (x === "1" ? true : x === "0" ? false : null)],
    [PACE_KEY, "pace", Number],
    [MAX_KEY, "max", Number],
    [HB_KEY, "hb", Number],
  ];
  for (const [key, name, cast] of old) {
    let raw = null;
    try {
      raw = localStorage.getItem(key);
    } catch {}
    if (raw === null) continue;
    let value = null;
    try {
      value = cast(raw);
    } catch {}
    if (value !== null && (typeof value === "boolean" || (Number.isFinite(value) && value > 0))) {
      try {
        S.api.settings.set(name, value);
      } catch {}
    }
    try {
      localStorage.removeItem(key);
    } catch {}
  }
}

function readAccounts() {
  try {
    const raw = JSON.parse(localStorage.getItem(ACCT_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (const a of raw) {
      if (!a || typeof a.id !== "string" || typeof a.token !== "string") continue;
      if (!a.id || !a.token || seen.has(a.id)) continue;
      seen.add(a.id);
      out.push({
        id: a.id,
        token: a.token,
        username: typeof a.username === "string" ? a.username : "",
        display_name: typeof a.display_name === "string" && a.display_name ? a.display_name : a.username || a.id,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function tokenNow() {
  try {
    const t = S.api?.stores?.auth?.getState?.()?.token;
    if (t) return String(t);
  } catch {}
  return ls("ec.token", "");
}

function curId() {
  try {
    const m = S.api?.stores?.auth?.getState?.()?.me;
    if (m && m.id) return m.id;
  } catch {}
  const t = tokenNow();
  if (!t) return null;
  const hit = readAccounts().find((a) => a.token === t);
  return hit ? hit.id : null;
}

function mkRow(a) {
  return {
    id: a.id,
    name: a.display_name || a.username || a.id,
    token: a.token,
    ws: null,
    phase: "idle",
    tries: 0,
    at: 0,
    crowded: 0,
    lastPing: 0,
    pingAt: 0,
    ready: false,
    err: "",
    dead: false,
    closedByUs: false,
  };
}

function gatewayUrl() {
  return (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/gateway";
}

function backoff(r) {
  return Math.min(60000, 1500 * Math.pow(1.8, Math.min(r.tries, 8))) + Math.random() * 750;
}

function send(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

function openRow(r) {
  r.closedByUs = false;
  let ws;
  try {
    ws = new WebSocket(gatewayUrl());
  } catch {
    r.err = "could not open a socket";
    r.tries += 1;
    r.phase = "wait";
    r.at = Date.now() + backoff(r);
    S.dirty = true;
    return;
  }

  r.ws = ws;
  r.phase = "connecting";
  r.ready = false;
  r.pingAt = 0;
  r.lastPing = 0;
  r.err = "";

  const guard = setTimeout(() => {
    try {
      ws.close(4000, "handshake timeout");
    } catch {}
  }, PING_TIMEOUT);

  ws.addEventListener("open", () => {
    clearTimeout(guard);
    r.phase = "open";
    r.lastPing = Date.now();
    if (!send(ws, { op: "identify", d: { token: r.token } })) r.err = "identify failed";
    S.dirty = true;
  });

  ws.addEventListener("message", (ev) => {
    let m;
    try {
      m = JSON.parse(typeof ev.data === "string" ? ev.data : "");
    } catch {
      return;
    }
    if (!m || typeof m !== "object") return;
    if (m.t === "ready") {
      r.ready = true;
      r.phase = "ready";
      r.tries = 0;
      r.crowded = 0;
      r.at = 0;
      r.err = "";
      S.dirty = true;
    } else if (m.t === "heartbeat_ack") {
      r.pingAt = 0;
    } else if (m.t === "session_expired") {
      r.dead = true;
      r.err = "session expired, sign in again";
      try {
        ws.close(4001, "session expired");
      } catch {}
      S.dirty = true;
    }
  });

  ws.addEventListener("close", (ev) => {
    clearTimeout(guard);
    if (r.ws === ws) r.ws = null;
    r.ready = false;
    r.pingAt = 0;

    if (r.closedByUs) {
      r.closedByUs = false;
      r.phase = r.dead ? "dead" : "idle";
      S.dirty = true;
      return;
    }

    if (!S.on || S.stop || r.dead) {
      r.phase = r.dead ? "dead" : "idle";
      S.dirty = true;
      return;
    }

    const code = ev.code || 1006;
    const reason = String(ev.reason || "").toLowerCase();
    let wait;
    if (code === 4009) {
      r.crowded += 1;
      wait = Math.min(300000, 30000 * Math.pow(2, Math.min(r.crowded - 1, 4))) + Math.random() * 5000;
      if (reason.indexOf("network") >= 0) {
        r.err = "network limit, backing off";
        S.pauseUntil = Math.max(S.pauseUntil, Date.now() + 20000);
      } else {
        r.err = "already open in another tab or app";
      }
    } else if (code === 4008) {
      wait = Math.max(5000, backoff(r));
      S.pauseUntil = Math.max(S.pauseUntil, Date.now() + 5000);
      r.err = "server is full, waiting";
    } else if (code === 4001) {
      wait = backoff(r);
      r.err = "session expired";
    } else {
      wait = backoff(r);
      if (code === 1006) r.err = "connection lost";
    }

    r.tries += 1;
    r.at = Date.now() + wait;
    r.phase = "wait";
    S.dirty = true;
  });

  ws.addEventListener("error", () => {
    if (!r.err) r.err = "socket error";
    S.dirty = true;
  });

  S.dirty = true;
}

function syncRows(force) {
  const now = Date.now();
  if (!force && now - S.lastSync < 1500) return;
  S.lastSync = now;
  const list = readAccounts();
  const cur = curId();
  S.cur = cur;
  S.hasCur = !!(cur && list.some((a) => a.id === cur));

  const keep = new Set();
  for (const a of list) {
    if (a.id === cur) continue;
    keep.add(a.id);
    const r = S.rows.get(a.id);
    if (!r) S.rows.set(a.id, mkRow(a));
    else {
      r.name = a.display_name || a.username || a.id;
      r.token = a.token;
    }
  }

  for (const [id, r] of Array.from(S.rows.entries())) {
    if (keep.has(id)) continue;
    try {
      r.ws?.close(4000, "account gone");
    } catch {}
    S.rows.delete(id);
    S.dirty = true;
  }
}

function tick() {
  if (!S.on || S.stop) return;
  syncRows();

  const tok = tokenNow();
  if (!tok) {
    S.loginAt = 0;
    return;
  }
  const now = Date.now();
  if (!S.loginAt) S.loginAt = now + cfg().grace;
  if (now < S.loginAt) return;

  const c = cfg();

  for (const r of S.rows.values()) {
    const ws = r.ws;
    if (!ws || ws.readyState !== 1) continue;
    if (r.pingAt && now - r.pingAt > PING_TIMEOUT) {
      r.err = "no heartbeat reply";
      r.pingAt = 0;
      try {
        ws.close(4000, "heartbeat timeout");
      } catch {}
      continue;
    }
    if (now - r.lastPing >= c.hb) {
      if (!send(ws, { op: "heartbeat" })) continue;
      r.lastPing = now;
      r.pingAt = now;
    }
  }

  if (now < S.pauseUntil) return;

  let live = 0;
  for (const r of S.rows.values()) if (r.ws && (r.ws.readyState === 0 || r.ws.readyState === 1)) live++;
  if (live >= c.max) return;
  if (now - S.lastOpen < c.pace) return;

  for (const r of S.rows.values()) {
    if (r.dead || r.ws) continue;
    if (r.at && now < r.at) continue;
    openRow(r);
    S.lastOpen = now;
    return;
  }
}

function resetAll() {
  S.pauseUntil = 0;
  S.lastOpen = 0;
  S.lastSync = 0;
  for (const r of S.rows.values()) {
    r.at = 0;
    r.tries = 0;
    r.crowded = 0;
    r.err = r.dead ? r.err : "";
    if (!r.dead) r.phase = r.ws ? r.phase : "idle";
  }
  S.dirty = true;
  tick();
}

function stats() {
  let online = 0;
  let connecting = 0;
  let waiting = 0;
  let dead = 0;
  for (const r of S.rows.values()) {
    if (r.phase === "ready") online++;
    else if (r.ws) connecting++;
    else if (r.dead) dead++;
    else waiting++;
  }
  const me = S.hasCur ? 1 : 0;
  return { total: S.rows.size + me, online: online + me, connecting, waiting, dead };
}

function applyOn(on, announce) {
  on = !!on;
  if (S.on === on) {
    if (announce) toast(on ? "Stay online is already on." : "Stay online is already off.", "info");
    return;
  }
  S.on = on;
  if (on) {
    S.loginAt = 0;
    S.pauseUntil = 0;
    S.lastSync = 0;
    S.lastOpen = 0;
    if (announce) toast("Stay online is on. Accounts connect in the background.", "success");
    tick();
  } else {
    for (const r of S.rows.values()) {
      if (r.ws) {
        r.closedByUs = true;
        try {
          r.ws.close(4000, "stopped");
        } catch {}
      }
      r.ws = null;
      r.ready = false;
      r.phase = "idle";
      r.at = 0;
      r.pingAt = 0;
    }
    if (announce) toast("Stay online is off.", "info");
  }
  S.dirty = true;
  paint(true);
}

function setOn(v) {
  const on = !!v;
  let saved = false;
  try {
    if (S.api?.settings?.set) {
      S.api.settings.set("on", on);
      saved = true;
    }
  } catch {}
  if (!saved || S.on !== on) applyOn(on, true);
}

function toast(m, t) {
  if (S.stop) return;
  try {
    S.api.ui.toast(String(m), t ? { type: t } : undefined);
  } catch {}
}

const CSS = `.so-root{position:fixed;inset:0;z-index:96;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6);backdrop-filter:blur(6px)}.so-panel{width:min(620px,100%);max-height:min(84vh,720px);display:flex;flex-direction:column;overflow:hidden;background:var(--bg-floating,#2b2d31);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.45)}.so-head{display:flex;align-items:center;gap:12px;padding:18px 18px 12px}.so-head h2{margin:0;font-size:19px;font-weight:700;color:var(--text-strong,#f2f3f5);flex:1}.so-x{width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:6px;background:none;color:var(--text-muted,#b5bac1);cursor:pointer;font-size:20px;line-height:1}.so-x:hover{background:rgba(255,255,255,.06);color:var(--text-strong,#f2f3f5)}.so-body{padding:0 18px 18px;overflow-y:auto}.so-sub{margin:0 0 14px;font-size:13px;color:var(--text-muted,#b5bac1)}.so-acts{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.so-btn{display:inline-flex;align-items:center;gap:7px;border:0;border-radius:7px;padding:9px 14px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;background:var(--bg-input,#1e1f22);color:var(--text-strong,#f2f3f5)}.so-btn.primary{background:#3d9e60;color:#fff}.so-btn.danger{background:#da3e44;color:#fff}.so-field{display:flex;align-items:center;gap:10px;margin-bottom:10px}.so-field label{width:130px;font-size:13px;color:var(--text-muted,#b5bac1)}.so-in{width:96px;padding:7px 9px;border-radius:6px;border:1px solid rgba(255,255,255,.1);background:var(--bg-input,#1e1f22);color:var(--text-strong,#f2f3f5);font:inherit;font-size:13px}.so-h3{margin:18px 0 8px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted,#b5bac1)}.so-list{display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto}.so-item{display:flex;gap:10px;align-items:baseline;padding:7px 10px;border-radius:6px;background:rgba(255,255,255,.03);font-size:12.5px}.so-item b{color:var(--text-strong,#f2f3f5);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45%}.so-item span{color:var(--text-muted,#b5bac1)}.so-ok{color:#3d9e60}`;

function el(t, c, x) {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (x !== undefined) n.textContent = x;
  return n;
}

function openPanel() {
  if (S.panel) return;
  const root = el("div", "so-root");
  root.addEventListener("mousedown", (e) => {
    if (e.target === root) closePanel();
  });
  const panel = el("section", "so-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  const head = el("header", "so-head");
  head.append(el("h2", null, "stay online"));
  const x = el("button", "so-x", "\u00d7");
  x.type = "button";
  x.setAttribute("aria-label", "Close");
  x.addEventListener("click", closePanel);
  head.append(x);

  const body = el("div", "so-body");
  const sub = el("p", "so-sub", "");
  const acts = el("div", "so-acts");
  const toggle = el("button", "so-btn primary");
  toggle.type = "button";
  toggle.addEventListener("click", () => setOn(!S.on));
  const again = el("button", "so-btn");
  again.type = "button";
  again.textContent = "Reconnect all";
  again.addEventListener("click", resetAll);
  acts.append(toggle, again);

  const f1 = el("div", "so-field");
  const l1 = el("label", null, "Gap between accounts");
  const i1 = el("input", "so-in");
  i1.type = "number";
  i1.min = "100";
  i1.max = "5000";
  i1.step = "50";
  i1.addEventListener("change", () => {
    const n = Math.max(PACE_MIN, Math.min(PACE_MAX, Number(i1.value) || PACE_DEF));
    i1.value = String(n);
    try {
      S.api.settings.set("pace", n);
    } catch {}
  });
  f1.append(l1, i1, el("span", "so-sub", "ms"));

  const f2 = el("div", "so-field");
  const l2 = el("label", null, "Most sockets open");
  const i2 = el("input", "so-in");
  i2.type = "number";
  i2.min = "10";
  i2.max = "1000";
  i2.step = "10";
  i2.addEventListener("change", () => {
    const n = Math.max(MAX_MIN, Math.min(MAX_MAX, Number(i2.value) || MAX_DEF));
    i2.value = String(n);
    try {
      S.api.settings.set("max", n);
    } catch {}
  });
  f2.append(l2, i2);

  const h3 = el("h3", "so-h3", "needs attention");
  const list = el("div", "so-list");

  body.append(sub, acts, f1, f2, h3, list);
  panel.append(head, body);
  root.append(panel);
  document.body.append(root);

  S.panel = root;
  S.body = body;
  S.els = { sub, toggle, i1, i2, list };
  paint(true);
}

function closePanel() {
  S.panel?.remove();
  S.panel = null;
  S.body = null;
  S.els = {};
}

function paint(force) {
  if (!S.panel) return;
  const now = Date.now();
  if (!force && now - S.lastPaint < 700) {
    S.dirty = true;
    return;
  }
  S.lastPaint = now;
  S.dirty = false;

  const st = stats();
  const c = cfg();
  S.els.sub.textContent =
    st.total + " saved · " + st.online + " online · " + st.connecting + " connecting · " + st.waiting + " waiting" +
    (st.dead ? " · " + st.dead + " need sign in" : "") +
    (st.total > c.max ? " · capped at " + c.max : "");
  S.els.toggle.textContent = S.on ? "Stop" : "Start";
  S.els.toggle.className = "so-btn " + (S.on ? "danger" : "primary");
  if (document.activeElement !== S.els.i1) S.els.i1.value = String(c.pace);
  if (document.activeElement !== S.els.i2) S.els.i2.value = String(c.max);

  const bad = [];
  for (const r of S.rows.values()) {
    if (r.dead) bad.push(r);
    else if (r.err && r.phase !== "ready") bad.push(r);
    else if (r.phase === "wait" && r.tries >= 3) bad.push(r);
  }
  bad.sort((a, b) => Number(b.dead) - Number(a.dead) || b.tries - a.tries);

  const frag = document.createDocumentFragment();
  for (const r of bad.slice(0, 40)) {
    const it = el("div", "so-item");
    const nm = el("b", null, r.name);
    const tx = el("span", null, r.dead ? r.err : r.err + " · retry " + Math.max(0, Math.ceil((r.at - now) / 1000)) + "s");
    it.append(nm, tx);
    frag.append(it);
  }
  if (!bad.length) frag.append(el("div", "so-item so-ok", "all good"));
  S.els.list.replaceChildren(frag);
}

const api = {
  name: "stay online",
  description: "Keeps every saved account online, paced so a few hundred accounts do not flood the gateway at login.",
  version: "1.1.0",
  author: "jesus",
  apiVersion: 2,
  permissions: ["stores", "commands.write", "ui.write", "styles.write"],
  settings: [
    {
      key: "on",
      label: "Keep every account online",
      type: "toggle",
      default: true,
      description: "Connects every account saved by mass accs in the background. The account you are using stays as it is.",
    },
    {
      key: "pace",
      label: "Gap between accounts",
      type: "number",
      default: 300,
      min: 100,
      max: 5000,
      step: 50,
      description: "Milliseconds between two accounts starting. Raise it if the gateway complains.",
    },
    {
      key: "max",
      label: "Most accounts online",
      type: "number",
      default: 400,
      min: 10,
      max: 1000,
      step: 10,
      description: "A hard stop so a very large list cannot lock up the browser.",
    },
    {
      key: "hb",
      label: "Heartbeat",
      type: "number",
      default: 25000,
      min: 10000,
      max: 60000,
      step: 1000,
      description: "Milliseconds between keep alive messages on each account.",
    },
    {
      key: "grace",
      label: "Wait after login",
      type: "number",
      default: 6000,
      min: 500,
      max: 30000,
      step: 500,
      description: "Milliseconds to wait after you sign in before the other accounts start connecting.",
    },
  ],

  start(a) {
    S.api = a;
    S.stop = false;

    try {
      S.css = (a.styles && a.styles.add && a.styles.add(CSS)) || null;
    } catch {}

    try {
      if (localStorage.getItem("ec.ma.online") === "1") {
        localStorage.removeItem("ec.ma.online");
        toast("Moved always-on out of mass accs. It lives here now.", "info");
      }
    } catch {}

    migrate();
    S.on = readOn();
    S.lastOpen = 0;

    if (a.settings && typeof a.settings.onChange === "function") {
      const offOn = a.settings.onChange("on", (v) => {
        if (typeof v === "boolean") applyOn(v, true);
      });
      if (typeof offOn === "function") S.offs.push(offOn);
    }

    a.commands.register("stayonline", "Keeps every saved account online", (arg) => {
      const v = String(arg || "").trim().toLowerCase();
      if (v === "on" || v === "off") setOn(v === "on");
      else openPanel();
    });

    a.commands.register("onlinecount", "How many saved accounts are online", () => {
      const st = stats();
      toast(st.online + " online, " + st.connecting + " connecting, " + st.waiting + " waiting" + (st.dead ? ", " + st.dead + " need sign in" : "") + ".", st.dead ? "warning" : "info");
    });

    const onOnline = () => resetAll();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        resetAll();
      }
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVis);
    S.offs.push(() => window.removeEventListener("online", onOnline));
    S.offs.push(() => document.removeEventListener("visibilitychange", onVis));

    S.timer = setInterval(tick, 250);
    S.paintT = setInterval(() => paint(false), 1000);

    if (S.on) {
      toast("Stay online is on.", "info");
      tick();
    }
  },

  stop() {
    S.stop = true;
    S.on = false;
    if (S.timer) clearInterval(S.timer);
    if (S.paintT) clearInterval(S.paintT);
    S.timer = null;
    S.paintT = null;
    for (const r of S.rows.values()) {
      if (r.ws) {
        r.closedByUs = true;
        try {
          r.ws.close(4000, "plugin stopped");
        } catch {}
      }
      r.ws = null;
    }
    S.rows.clear();
    for (const f of S.offs) {
      try {
        f();
      } catch {}
    }
    S.offs = [];
    closePanel();
    try {
      S.css?.();
    } catch {}
    S.css = null;
  },
};

export default api;
