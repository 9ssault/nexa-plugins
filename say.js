const ACCOUNTS_KEY = "ec.accounts";
const TOKEN_KEY = "ec.token";
const IDB = "evilion-chat";
const ROOTS = "roots";
const BYUSER = "byUser";

const urlB64 = (s) => {
  try { return Uint8Array.from(atob(String(s)), (c) => c.charCodeAt(0)); } catch { return null; }
};
const utf8 = (s) => new TextEncoder().encode(s);
const b64 = (u) => {
  let bin = "";
  const c = 0x8000;
  for (let i = 0; i < u.length; i += c) bin += String.fromCharCode(...u.subarray(i, i + c));
  return btoa(bin);
};
const rand = (n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; };
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function readJSON(key, fb) {
  try { const raw = localStorage.getItem(key); return raw == null ? fb : JSON.parse(raw); }
  catch { return fb; }
}

function readAccounts() {
  let list = readJSON(ACCOUNTS_KEY, []);
  if (!Array.isArray(list) || !list.length) {
    const token = readLocal(TOKEN_KEY);
    if (token) list = [{ id: "self", token, username: "", display_name: "" }];
  }
  if (!Array.isArray(list)) list = [];
  const seen = new Set();
  return list
    .filter((a) => a && typeof a.id === "string" && a.id && typeof a.token === "string" && a.token)
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    .map((a) => ({
      id: a.id,
      token: a.token,
      username: typeof a.username === "string" ? a.username : "",
      display_name: (typeof a.display_name === "string" && a.display_name) || a.username || a.id,
    }));
}

function idbRoots(userId) {
  return new Promise((resolve) => {
    let db;
    try {
      const req = indexedDB.open(IDB, 1);
      req.onerror = () => resolve([]);
      req.onsuccess = () => {
        db = req.result;
        if (!db.objectStoreNames.contains(ROOTS)) { db.close(); resolve([]); return; }
        const tx = db.transaction(ROOTS, "readonly");
        const idx = tx.objectStore(ROOTS).index(BYUSER);
        const got = idx.getAll(IDBKeyRange.only(userId));
        got.onsuccess = () => { db.close(); resolve(got.result || []); };
        got.onerror = () => { db.close(); resolve([]); };
      };
    } catch { resolve([]); }
  });
}

async function deriveKey(ikmBytes, info) {
  const ikm = await crypto.subtle.importKey("raw", ikmBytes, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8(info) },
    ikm,
    256,
  );
  return new Uint8Array(bits);
}
async function channelKey(root, channelId) { return deriveKey(root, `chan:${channelId}`); }

function importChanKey(raw) {
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
}

async function sealWith(ck, conv, epoch, channelId, authorId, text) {
  const iv = rand(12);
  const payload = utf8(JSON.stringify({ t: text }));
  const aad = utf8(`${conv}|${epoch}|${channelId}|${authorId}`);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, ck, payload));
  return { v: 1, conv, epoch, iv: b64(iv), ct: b64(ct) };
}

const backoff = (i) => 250 * 2 ** i + Math.floor(Math.random() * 200);

async function apiFetch(fn, path, account, body, attempts = 3) {
  const headers = { Accept: "application/json", Authorization: `Bearer ${account.token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const base = typeof location !== "undefined" && location.origin ? location.origin : "https://nexa.pm";
  let last = { ok: false, code: "network", status: 0 };
  for (let attempt = 0; attempt < attempts; attempt++) {
    let res;
    try {
      res = await fetch(`${base}/api/v1${path}`, { method: fn, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      last = { ok: false, code: "network", status: 0 };
      if (attempt < attempts - 1) { await sleep(backoff(attempt)); continue; }
      return last;
    }
    if (res.status === 401) return { ok: false, code: "unauthorized", status: 401 };
    if (res.status === 429) {
      last = { ok: false, code: "rate_limited", status: 429 };
      if (attempt < attempts - 1) {
        const wait = Number(res.headers.get("Retry-After")) || 1.5;
        await sleep(Math.min(wait, 10) * 1000);
        continue;
      }
      return last;
    }
    if (!res.ok) {
      last = { ok: false, code: "http", status: res.status };
      if (res.status >= 500 && attempt < attempts - 1) { await sleep(backoff(attempt)); continue; }
      return last;
    }
    return { ok: true, status: res.status };
  }
  return last;
}

async function mapPool(items, limit, worker) {
  const n = Math.max(1, Math.min(Number(limit) || 1, items.length));
  let cursor = 0;
  const run = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: n }, run));
}

function convFor(channel) {
  if (!channel) return null;
  if (channel.key_conv_id && channel.key_conv_id !== "0") return String(channel.key_conv_id);
  if (channel.server_id && channel.type !== "dm" && channel.type !== "group_dm") return String(channel.server_id);
  return String(channel.id);
}

async function rootFor(conv, channelId, meId) {
  if (!conv) return null;
  const candidates = [];
  if (meId) {
    for (const r of await idbRoots(meId)) if (String(r.conv) === String(conv)) candidates.push(r);
  }
  if (!candidates.length) return null;
  const holder = candidates.slice().sort((a, b) => (b.epoch || 0) - (a.epoch || 0))[0];
  const raw = typeof holder.root === "string" ? urlB64(holder.root) : holder.root;
  if (!raw || !raw.length) return null;
  return { epoch: holder.epoch, key: await channelKey(raw, channelId) };
}

function codeLine(codes) {
  return Object.keys(codes).length ? ` · ${Object.entries(codes).map(([k, v]) => `${k}=${v}`).join(" ")}` : "";
}
function bump(obj, key) { obj[key] = (obj[key] || 0) + 1; }

export default {
  name: "Say",
  description: "/say sends one encrypted message from every saved account; /rename sets a display_name on all of them.",
  version: "4.0.0",
  author: "You",
  apiVersion: 2,
  permissions: ["commands.write", "ui.write", "stores"],

  settings: [
    { key: "concurrency", type: "number", label: "Parallel requests", description: "How many accounts are sent to at once. Raise for 300+ accounts; back off if the server rate-limits.", min: 1, max: 64, step: 1, default: 12 },
    { key: "delay", type: "number", label: "Gap per request (ms)", description: "Optional pause each worker takes between its own requests. 0 = as fast as the network allows.", min: 0, max: 5000, step: 25, default: 0 },
  ],

  start(api) {
    const refreshAccounts = () => readAccounts();
    const sget = (k, fb) => {
      try { const v = api.settings && api.settings.get(k); return v === undefined ? fb : v; }
      catch { return fb; }
    };
    const toast = (m, t) => { try { api.ui.toast(m, { type: t || "info", duration: 7000 }); } catch {} };
    const concurrency = () => Math.max(1, Math.min(64, Number(sget("concurrency", 12)) || 12));
    const delayMs = () => Math.max(0, Number(sget("delay", 0)) || 0);
    const senders = () => refreshAccounts();

    const say = async (channelId, text) => {
      const list = senders();
      if (!list.length) { toast("No accounts to send from.", "error"); return; }
      let ch = null;
      try { ch = api.stores && api.stores.channels && api.stores.channels.getState().byId[channelId]; } catch { ch = null; }
      const conv = convFor(ch);
      if (!conv) { toast("Cannot resolve this channel's conversation id.", "error"); return; }
      const meId = (() => { try { return api.stores && api.stores.auth && api.stores.auth.getState().me?.id; } catch { return null; } })();
      const root = await rootFor(conv, channelId, meId);
      if (!root) { toast("No conversation key for that channel.", "error"); return; }

      const epoch = root.epoch;
      let ck;
      try { ck = await importChanKey(root.key); }
      catch { toast("Could not load the channel key.", "error"); return; }

      const results = { ok: 0, fail: 0, codes: {} };
      const started = Date.now();
      const total = list.length;
      const gate = delayMs();
      toast(`/say: sending from ${total} accounts · ${concurrency()} at a time...`, "info");

      await mapPool(list, concurrency(), async (a) => {
        let ciphertext;
        try { ciphertext = await sealWith(ck, conv, epoch, channelId, a.id, text); }
        catch { results.fail++; bump(results.codes, "crypto"); return; }
        const body = { ciphertext, key_conv_id: conv, key_epoch: epoch, mentions: [], nonce: hex(rand(12)) };
        const r = await apiFetch("POST", `/channels/${channelId}/messages`, a, body);
        if (r.ok) results.ok++;
        else { results.fail++; bump(results.codes, r.code); }
        if (gate) await sleep(gate);
      });

      const secs = ((Date.now() - started) / 1000).toFixed(1);
      toast(`/say: ${results.ok}/${total} sent in ${secs}s${results.fail ? ` · ${results.fail} failed${codeLine(results.codes)}` : ""}`, results.fail ? "warning" : "success");
    };

    const rename = async (name) => {
      const list = senders();
      if (!list.length) { toast("No accounts to rename.", "error"); return; }
      const results = { ok: 0, fail: 0, codes: {} };
      const started = Date.now();
      const total = list.length;
      const gate = delayMs();
      toast(`/rename: setting ${total} accounts to "${name}" · ${concurrency()} at a time...`, "info");

      await mapPool(list, concurrency(), async (a) => {
        const r = await apiFetch("PATCH", "/users/@me", a, { display_name: name });
        if (r.ok) results.ok++;
        else { results.fail++; bump(results.codes, r.code); }
        if (gate) await sleep(gate);
      });

      const secs = ((Date.now() - started) / 1000).toFixed(1);
      toast(`/rename: ${results.ok}/${total} set to "${name}" in ${secs}s${results.fail ? ` · ${results.fail} failed${codeLine(results.codes)}` : ""}`, results.fail ? "warning" : "success");
    };

    api.commands.register("say", "Sends one encrypted message from every account: /say <text>", async (a, ctx) => {
      const text = String(a || "").trim();
      if (!text) { toast("/say <text> - nothing sent (no text).", "warning"); return; }
      const ch = ctx && ctx.channel;
      const chId = ch && ch.id ? String(ch.id) : null;
      if (!chId) { toast("Run it from a text channel, or use /sayto <channelId> <text>.", "warning"); return; }
      await say(chId, text);
    });
    api.commands.register("sayto", "Sends one encrypted message from every account to a channel id: /sayto <channelId> <text>", async (a) => {
      const m = String(a || "").trim().split(/\s+/);
      const chId = m.shift() || "";
      const text = m.join(" ").trim();
      if (!/^\d{10,}$/.test(chId) || !text) { toast("/sayto <channelId> <text>", "warning"); return; }
      await say(chId, text);
    });
    api.commands.register("rename", "Sets the same display_name on every account: /rename <name>", (a) => {
      const name = String(a || "").trim();
      if (!name) { toast("/rename <name>", "warning"); return; }
      return rename(name);
    });
  },
};
