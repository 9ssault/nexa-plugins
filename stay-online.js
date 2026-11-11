const ACCT_KEY = "ec.accounts";
const ON_KEY = "ec.so.on";
const PACE_KEY = "ec.so.pace";
const MAX_KEY = "ec.so.max";
const HB_KEY = "ec.so.hb";
const PACE_DEF = 300;
const PACE_MIN = 100;
const PACE_MAX = 5000;
const MAX_DEF = 220;
const MAX_MIN = 10;
const MAX_MAX = 240;
const PARTS_MAX = 8;
const HB_DEF = 25000;
const HB_MIN = 10000;
const HB_MAX = 60000;
const GRACE_DEF = 6000;
const GRACE_MIN = 500;
const GRACE_MAX = 30000;
const PING_TIMEOUT = 90000;
const CONNECT_TIMEOUT = 15000;
const HUB_PORT_DEF = 8787;
const HUB_PORT_MIN = 1024;
const HUB_PORT_MAX = 65535;
const HUB_PING = 20000;
const HUB_PONG = 9000;
const HUB_RESYNC = 3000;
const HUB_RETRY_MIN = 3000;
const HUB_RETRY_MAX = 30000;

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
  misses: 0,
  parts: 1,
  part: 1,
  total: 0,
  start: 0,
  end: 0,
  next: null,
  known: false,
  hubOn: true,
  hub: {
    ws: null,
    state: "idle",
    status: null,
    tries: 0,
    at: 0,
    pingAt: 0,
    pongAt: 0,
    syncSig: "",
    syncAt: 0,
    ready: false,
  },
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
    port: sNum("hubport", HUB_PORT_DEF, HUB_PORT_MIN, HUB_PORT_MAX),
  };
}

function readHub() {
  try {
    const v = S.api?.settings?.get?.("hub");
    if (typeof v === "boolean") return v;
  } catch {}
  return ls("ec.so.hub", "1") !== "0";
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
    everOpen: false,
    startedAt: 0,
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

// --- the local hub ---------------------------------------------------------
// the hub is a small process on this machine that holds every account socket
// outside the browser. when it is running the plugin only keeps this control
// socket open. when it is not, the plugin falls back to the old behaviour and
// keeps the accounts online inside the browser.

function hubActive() {
  return S.on && !S.stop && S.hubOn && S.hub.ready && S.hub.state === "open";
}

function hubUrl() {
  return "wss://localhost:" + cfg().port + "/";
}

function hubSend(obj) {
  const ws = S.hub.ws;
  if (!ws || ws.readyState !== 1) return false;
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

function hubSig(cur, list) {
  let h = 2166136261;
  const mix = (s) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  mix(cur || "");
  for (const a of list) {
    mix(a.id);
    mix(a.token);
  }
  return (h >>> 0).toString(36) + ":" + list.length;
}

function hubSync(force) {
  if (!hubActive()) return;
  const now = Date.now();
  if (!force && now - S.hub.syncAt < HUB_RESYNC) return;
  S.hub.syncAt = now;
  const list = readAccounts();
  const cur = curId();
  const sig = hubSig(cur, list);
  if (!force && sig === S.hub.syncSig) return;
  S.hub.syncSig = sig;
  const rows = list.map((a) => ({ id: a.id, token: a.token, name: a.display_name || a.username || a.id }));
  hubSend({ op: "sync", on: true, current: cur || null, accounts: rows });
}

function hubRetry() {
  const h = S.hub;
  h.tries += 1;
  const wait = Math.min(HUB_RETRY_MAX, HUB_RETRY_MIN * Math.pow(1.5, Math.min(h.tries, 6))) + Math.floor(Math.random() * 1000);
  h.at = Date.now() + wait;
  h.state = "absent";
  h.ready = false;
  h.status = null;
  h.ws = null;
  h.syncSig = "";
  h.pingAt = 0;
  h.pongAt = 0;
  S.dirty = true;
}

function hubConnect() {
  const h = S.hub;
  if (!S.on || S.stop || !S.hubOn || h.ws) return;
  if (h.at && Date.now() < h.at) return;
  let ws;
  try {
    ws = new WebSocket(hubUrl());
  } catch {
    hubRetry();
    return;
  }
  h.ws = ws;
  h.state = "connecting";
  h.syncSig = "";
  S.dirty = true;

  ws.addEventListener("open", () => {
    if (h.ws !== ws) return;
    h.state = "connecting";
    h.ready = false;
    h.pongAt = Date.now();
    h.pingAt = Date.now();
    S.dirty = true;
  });

  ws.addEventListener("message", (ev) => {
    if (h.ws !== ws) return;
    const raw = ev && ev.data;
    if (typeof raw !== "string" || raw.length > 65536) return;
    let msg = null;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.op !== "string") return;
    h.pongAt = Date.now();
    if (msg.op === "hello") {
      h.ready = true;
      h.state = "open";
      h.tries = 0;
      h.at = 0;
      hubSync(true);
      S.dirty = true;
      paint(true);
      return;
    }
    if (msg.op === "pong") return;
    if (msg.op === "status") {
      h.status = msg;
      h.ready = true;
      S.dirty = true;
      paint(false);
    }
  });

  ws.addEventListener("close", () => {
    if (h.ws !== ws) return;
    hubRetry();
  });

  ws.addEventListener("error", () => {});
}

function hubStop() {
  const h = S.hub;
  if (h.ws) {
    try {
      h.ws.send(JSON.stringify({ op: "off" }));
    } catch {}
    try {
      h.ws.close(1000, "plugin off");
    } catch {}
  }
  h.ws = null;
  h.state = "idle";
  h.ready = false;
  h.status = null;
  h.syncSig = "";
  h.pingAt = 0;
  h.pongAt = 0;
  h.at = 0;
}

function hubTick() {
  const h = S.hub;
  if (h.ws && h.pongAt && Date.now() - h.pongAt > HUB_PONG) {
    try {
      h.ws.close(4000, "hub not answering");
    } catch {}
  }
  if (!h.ws && Date.now() >= h.at) hubConnect();
  if (h.ws && h.ws.readyState === 1 && Date.now() - h.pingAt >= HUB_PING) {
    if (hubSend({ op: "ping" })) h.pingAt = Date.now();
  }
}

function openRow(r) {
  r.closedByUs = false;
  r.everOpen = false;
  r.startedAt = Date.now();
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
  }, CONNECT_TIMEOUT);

  ws.addEventListener("open", () => {
    clearTimeout(guard);
    r.everOpen = true;
    r.phase = "ready";
    r.tries = 0;
    r.crowded = 0;
    r.at = 0;
    r.err = "";
    r.lastPing = Date.now();
    r.pingAt = 0;
    S.misses = 0;
    if (!send(ws, { op: "identify", d: { token: r.token } })) r.err = "identify failed";
    S.dirty = true;
  });

  ws.addEventListener("message", (ev) => {
    const d = typeof ev.data === "string" ? ev.data : "";
    if (!d || d.length > 4096) return;
    if (d.indexOf("heartbeat_ack") >= 0) {
      r.pingAt = 0;
    } else if (d.indexOf("session_expired") >= 0) {
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

    if (code === 4001) {
      r.dead = true;
      r.err = "session expired, sign in again";
      r.phase = "dead";
      r.at = 0;
      S.dirty = true;
      return;
    }

    if (!r.everOpen && code === 1006 && Date.now() - r.startedAt < 3000) S.misses += 1;

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
  const c = cfg();
  S.cur = cur;

  const total = list.length;
  const parts = Math.max(1, Math.min(PARTS_MAX, Math.ceil(total / c.max)));
  const curIdx = cur ? list.findIndex((a) => a.id === cur) : -1;
  const part = curIdx >= 0 ? Math.min(parts, Math.floor(curIdx / c.max) + 1) : 1;
  const start = (part - 1) * c.max;
  const mine = list.slice(start, start + c.max);

  S.parts = parts;
  S.part = part;
  S.total = total;
  S.start = start;
  S.end = start + mine.length;
  S.next = part < parts && list[start + c.max] ? list[start + c.max] : null;
  S.known = curIdx >= 0;

  S.hasCur = !!(cur && mine.some((a) => a.id === cur));

  const keep = new Set();
  for (const a of mine) {
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

  S.hubOn = readHub();
  if (S.hubOn) {
    hubTick();
    if (hubActive()) {
      hubSync(false);
      // the hub owns every account socket now, so the browser keeps none
      if (S.rows.size) {
        for (const r of S.rows.values()) {
          if (r.ws) {
            r.closedByUs = true;
            try {
              r.ws.close(4000, "hub took over");
            } catch {}
          }
        }
        S.rows.clear();
      }
      S.dirty = true;
      return;
    }
  } else if (S.hub.ws || S.hub.status) {
    hubStop();
  }

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
    if (!r.pingAt && now - r.lastPing >= c.hb) {
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
  S.misses = 0;
  for (const r of S.rows.values()) {
    r.at = 0;
    r.tries = 0;
    r.crowded = 0;
    r.dead = false;
    r.err = "";
    r.phase = r.ws ? r.phase : "idle";
  }
  const h = S.hub;
  if (h.ws) {
    try {
      h.ws.close(4000, "reconnect all");
    } catch {}
  }
  h.at = 0;
  h.tries = 0;
  h.syncSig = "";
  S.dirty = true;
  tick();
}

function stats() {
  if (hubActive()) {
    const h = S.hub.status;
    const me = h && h.signedIn ? 1 : 0;
    return {
      total: (h ? h.total : 0) + me,
      online: (h ? h.online : 0) + me,
      connecting: h ? h.connecting : 0,
      waiting: h ? h.waiting : 0,
      dead: h ? h.dead : 0,
      hub: true,
    };
  }
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
  return { total: S.rows.size + me, online: online + me, connecting, waiting, dead, hub: false };
}

function applyOn(on, announce) {
  on = !!on;
  if (S.on === on) return;
  S.on = on;
  if (on) {
    S.loginAt = 0;
    S.pauseUntil = 0;
    S.lastSync = 0;
    S.lastOpen = 0;
    S.misses = 0;
    S.hub.at = 0;
    S.hub.tries = 0;
    S.hub.syncSig = "";
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
    hubStop();
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

const CSS = `.so-root{position:fixed;inset:0;z-index:96;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6);backdrop-filter:blur(6px)}.so-panel{width:min(620px,100%);max-height:min(84vh,720px);display:flex;flex-direction:column;overflow:hidden;background:var(--bg-floating,#2b2d31);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.45)}.so-head{display:flex;align-items:center;gap:12px;padding:18px 18px 12px}.so-head h2{margin:0;font-size:19px;font-weight:700;color:var(--text-strong,#f2f3f5);flex:1}.so-x{width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:6px;background:none;color:var(--text-muted,#b5bac1);cursor:pointer;font-size:20px;line-height:1}.so-x:hover{background:rgba(255,255,255,.06);color:var(--text-strong,#f2f3f5)}.so-body{padding:0 18px 18px;overflow-y:auto}.so-sub{margin:0 0 14px;font-size:13px;color:var(--text-muted,#b5bac1)}.so-acts{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.so-btn{display:inline-flex;align-items:center;gap:7px;border:0;border-radius:7px;padding:9px 14px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;background:var(--bg-input,#1e1f22);color:var(--text-strong,#f2f3f5)}.so-btn.primary{background:#3d9e60;color:#fff}.so-btn.danger{background:#da3e44;color:#fff}.so-field{display:flex;align-items:center;gap:10px;margin-bottom:10px}.so-field label{width:130px;font-size:13px;color:var(--text-muted,#b5bac1)}.so-in{width:96px;padding:7px 9px;border-radius:6px;border:1px solid rgba(255,255,255,.1);background:var(--bg-input,#1e1f22);color:var(--text-strong,#f2f3f5);font:inherit;font-size:13px}.so-h3{margin:18px 0 8px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted,#b5bac1)}.so-list{display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto}.so-item{display:flex;gap:10px;align-items:baseline;padding:7px 10px;border-radius:6px;background:rgba(255,255,255,.03);font-size:12.5px}.so-item b{color:var(--text-strong,#f2f3f5);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45%}.so-item span{color:var(--text-muted,#b5bac1)}.so-ok{color:#3d9e60}.so-warn{color:#f0b232}`;

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
  const hint = el("p", "so-sub so-warn", "");
  hint.hidden = true;
  const acts = el("div", "so-acts");
  const toggle = el("button", "so-btn primary");
  toggle.type = "button";
  toggle.addEventListener("click", () => setOn(!S.on));
  const again = el("button", "so-btn");
  again.type = "button";
  again.textContent = "Reconnect all";
  again.addEventListener("click", resetAll);
  const hubBtn = el("button", "so-btn");
  hubBtn.type = "button";
  hubBtn.addEventListener("click", () => {
    const v = !readHub();
    try {
      S.api.settings.set("hub", v);
    } catch {}
    S.hubOn = v;
    if (!v) hubStop();
    else {
      S.hub.at = 0;
      S.hub.tries = 0;
      S.hub.syncSig = "";
    }
    S.dirty = true;
    tick();
    paint(true);
  });
  acts.append(toggle, again, hubBtn);

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
  i2.min = String(MAX_MIN);
  i2.max = String(MAX_MAX);
  i2.step = "10";
  i2.addEventListener("change", () => {
    const n = Math.max(MAX_MIN, Math.min(MAX_MAX, Number(i2.value) || MAX_DEF));
    i2.value = String(n);
    try {
      S.api.settings.set("max", n);
    } catch {}
  });
  f2.append(l2, i2);

  const f3 = el("div", "so-field");
  const l3 = el("label", null, "Hub port");
  const i3 = el("input", "so-in");
  i3.type = "number";
  i3.min = String(HUB_PORT_MIN);
  i3.max = String(HUB_PORT_MAX);
  i3.step = "1";
  i3.addEventListener("change", () => {
    const n = Math.max(HUB_PORT_MIN, Math.min(HUB_PORT_MAX, Number(i3.value) || HUB_PORT_DEF));
    i3.value = String(n);
    try {
      S.api.settings.set("hubport", n);
    } catch {}
    if (S.hub.ws) {
      try {
        S.hub.ws.close(4000, "port changed");
      } catch {}
    }
    S.hub.at = 0;
    S.hub.syncSig = "";
    tick();
  });
  f3.append(l3, i3);

  const h3 = el("h3", "so-h3", "needs attention");
  const list = el("div", "so-list");

  body.append(sub, hint, acts, f1, f2, f3, h3, list);
  panel.append(head, body);
  root.append(panel);
  document.body.append(root);

  S.panel = root;
  S.body = body;
  S.els = { sub, hint, toggle, hubBtn, i1, i2, i3, list };
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
  if (st.hub) {
    S.els.sub.textContent =
      st.total + " saved · " + st.online + " online · " + st.connecting + " connecting · " + st.waiting + " waiting" +
      (st.dead ? " · " + st.dead + " need sign in" : "") + " · via hub";
  } else {
    const head = S.parts > 1 ? "part " + S.part + " of " + S.parts + " · " : "";
    S.els.sub.textContent =
      head + st.total + " saved · " + st.online + " online · " + st.connecting + " connecting · " + st.waiting + " waiting" +
      (st.dead ? " · " + st.dead + " need sign in" : "") +
      (st.total > c.max ? " · capped at " + c.max : "");
  }
  S.els.toggle.textContent = S.on ? "Stop" : "Start";
  S.els.toggle.className = "so-btn " + (S.on ? "danger" : "primary");
  if (S.els.hubBtn) S.els.hubBtn.textContent = S.hubOn ? "Hub: on" : "Hub: off";
  if (document.activeElement !== S.els.i1) S.els.i1.value = String(c.pace);
  if (document.activeElement !== S.els.i2) S.els.i2.value = String(c.max);
  if (S.els.i3 && document.activeElement !== S.els.i3) S.els.i3.value = String(c.port);

  let hintText = "";
  let warn = false;
  if (st.hub) {
    hintText = "the nexa hub on this machine holds every account, so this browser only keeps the one you are signed in to.";
    if (st.dead) {
      warn = true;
      hintText = st.dead + " accounts need signing in again. open the hub with your browser to see which.";
    }
  } else if (!S.total) {
    warn = true;
    hintText = "no saved accounts in this profile. mass accs keeps the list per browser profile, so copy ec.accounts from the profile that has them.";
  } else if (!S.known) {
    warn = true;
    hintText = "this profile is not signed in to a saved account, so it takes the first " + c.max + ". sign in to one of the saved accounts so it knows which part of the list to take.";
  } else if (S.hubOn && S.hub.state === "absent") {
    hintText = "the nexa hub is not running, so the accounts are kept online in this browser for now. start the hub and they move over on their own.";
  } else if (S.misses >= 5) {
    warn = true;
    hintText = "this browser could not open " + S.misses + " sockets in a row. close other nexa tabs and apps, or lower accounts per browser.";
  } else if (S.parts > 1) {
    hintText = "this profile holds accounts " + (S.start + 1) + " to " + S.end + " of " + S.total + ".";
    if (S.part > 1) hintText += " the earlier part starts at account 1.";
    if (S.next) {
      const nm = S.next.display_name || S.next.username || S.next.id;
      hintText += " open nexa in another browser profile signed into " + nm + " (number " + (S.end + 1) + ") to bring the rest online.";
    }
  }
  S.els.hint.className = "so-sub" + (warn ? " so-warn" : "");
  S.els.hint.hidden = !hintText;
  S.els.hint.textContent = hintText;

  const bad = [];
  for (const r of S.rows.values()) {
    if (r.dead) bad.push(r);
    else if (r.err && r.phase !== "ready") bad.push(r);
    else if (r.phase === "wait" && r.tries >= 3) bad.push(r);
  }
  bad.sort((a, b) => Number(b.dead) - Number(a.dead) || b.tries - a.tries);

  const frag = document.createDocumentFragment();
  if (st.hub) {
    const last = S.hub.status && S.hub.status.last;
    if (st.dead) {
      const it = el("div", "so-item");
      it.append(el("b", null, st.dead + (st.dead === 1 ? " account" : " accounts")), el("span", null, "need signing in again"));
      frag.append(it);
      if (last && last.kind === "dead") {
        const it2 = el("div", "so-item");
        it2.append(el("b", null, last.id), el("span", null, last.detail));
        frag.append(it2);
      }
    } else if (S.hub.status && S.hub.status.total) {
      frag.append(el("div", "so-item so-ok", "all good · " + S.hub.status.total + " handled by the hub"));
    } else {
      frag.append(el("div", "so-item so-ok", "all good"));
    }
    S.els.list.replaceChildren(frag);
    return;
  }

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
  description: "Keeps every saved account online. Uses the local nexa hub when it is running, and keeps them in the browser when it is not.",
  version: "1.3.0",
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
      key: "hub",
      label: "Use the local hub",
      type: "toggle",
      default: true,
      description: "When the nexa hub is running on this machine it holds every account socket, so the browser only keeps the account you are signed in to. If it is not running the plugin keeps the accounts online in the browser instead, and moves them over when the hub starts.",
    },
    {
      key: "hubport",
      label: "Hub port",
      type: "number",
      default: 8787,
      min: 1024,
      max: 65535,
      step: 1,
      description: "The port the local nexa hub listens on. Only change it if you started the hub on another port.",
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
      label: "Accounts per browser",
      type: "number",
      default: 220,
      min: 10,
      max: 240,
      step: 10,
      description: "How many accounts one browser profile keeps online. When the list is longer, the plugin splits it into chunks of this size, one chunk per profile.",
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
    S.misses = 0;

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
    S.hubOn = readHub();
    S.lastOpen = 0;

    if (a.settings && typeof a.settings.onChange === "function") {
      const offOn = a.settings.onChange("on", (v) => {
        if (typeof v === "boolean") applyOn(v, true);
      });
      if (typeof offOn === "function") S.offs.push(offOn);

      const offHub = a.settings.onChange("hub", (v) => {
        S.hubOn = !!v;
        if (!S.hubOn) hubStop();
        else {
          S.hub.at = 0;
          S.hub.tries = 0;
          S.hub.syncSig = "";
        }
        S.dirty = true;
        tick();
        paint(true);
      });
      if (typeof offHub === "function") S.offs.push(offHub);

      const offPort = a.settings.onChange("hubport", () => {
        if (S.hub.ws) {
          try {
            S.hub.ws.close(4000, "port changed");
          } catch {}
        }
        S.hub.at = 0;
        S.hub.syncSig = "";
        tick();
      });
      if (typeof offPort === "function") S.offs.push(offPort);
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
    hubStop();
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
