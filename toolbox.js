let restoreSendTyping = null;
let rotateTimer = null;
let displayTimer = null;
let snipeTimer = null;
let lastChannelId = null;

export default {
  name: "Nexa Toolbox",
  description: "Self-react, auto-react to others, edit/delete logger, send helpers, profile tools, mod helpers, emoji selector, and silent sending in one plugin.",
  version: "2.10.7",
  author: "jesus",
  apiVersion: 2,
  permissions: ["events.read", "users.self.read", "users.self.write", "users.read", "servers.messages.read", "servers.messages.write", "directmessages.read", "directmessages.write", "servers.members.read", "servers.members.write", "servers.read", "commands.write", "storage.read", "storage.write", "ui.write", "composer.write", "stores"],
  settings: [
    { key: "selfEmojiPick", type: "select", label: "Self-react emoji picker", description: "Pick a preset - syncs to the text field below. For server emoji, use the text field or /emoji.", options: [{ value: "✨", label: "✨", value: "🔥", label: "🔥", value: "💀", label: "💀", value: "😂", label: "😂", value: "❤️", label: "❤️", value: "👍", label: "👍", value: "👎", label: "👎", value: "😮", label: "😮", value: "😢", label: "😢", value: "😡", label: "😡", value: "🥳", label: "🥳", value: "😎", label: "😎", value: "🤔", label: "🤔", value: "🙏", label: "🙏", value: "💯", label: "💯", value: "🎉", label: "🎉", value: "🚀", label: "🚀", value: "👀", label: "👀", value: "🫡", label: "🫡", value: "🤝", label: "🤝", value: "💪", label: "💪", value: "🏆", label: "🏆", value: "🎯", label: "🎯", value: "⚡", label: "⚡", value: "🌟", label: "🌟", value: "🍕", label: "🍕", value: "☕", label: "☕", value: "🎮", label: "🎮", value: "🎧", label: "🎧", value: "💤", label: "💤", value: "🫠", label: "🫠", value: "😏", label: "😏", value: "🤣", label: "🤣", value: "🥹", label: "🥹", value: "😴", label: "😴", value: "🤯", label: "🤯", value: "👏", label: "👏", value: "🙌", label: "🙌", value: "💅", label: "💅", value: "🧠", label: "🧠", value: "👑", label: "👑", value: "💎", label: "💎", value: "🌈", label: "🌈", value: "⭐", label: "⭐", value: "🎈", label: "🎈", value: "🍀", label: "🍀", value: "🔔", label: "🔔", value: "📌", label: "📌" }], default: "✨" },
    { key: "selfEmoji", type: "text", label: "Self-react emoji (custom)", description: "One or more emoji for your own messages, comma/space separated - reacts with ALL of them. Unicode or <:name:id>. Overrides the picker when changed.", default: "✨", placeholder: "✨, 🔥, :3", maxLength: 500 },
    { key: "selfEnabled", type: "toggle", label: "Self-react enabled", default: true },
    { key: "otherEmojiPick", type: "select", label: "Others-react emoji picker", description: "Pick a preset - syncs to the text field below.", options: [{ value: "✨", label: "✨", value: "🔥", label: "🔥", value: "💀", label: "💀", value: "😂", label: "😂", value: "❤️", label: "❤️", value: "👍", label: "👍", value: "👎", label: "👎", value: "😮", label: "😮", value: "😢", label: "😢", value: "😡", label: "😡", value: "🥳", label: "🥳", value: "😎", label: "😎", value: "🤔", label: "🤔", value: "🙏", label: "🙏", value: "💯", label: "💯", value: "🎉", label: "🎉", value: "🚀", label: "🚀", value: "👀", label: "👀", value: "🫡", label: "🫡", value: "🤝", label: "🤝", value: "💪", label: "💪", value: "🏆", label: "🏆", value: "🎯", label: "🎯", value: "⚡", label: "⚡", value: "🌟", label: "🌟", value: "🍕", label: "🍕", value: "☕", label: "☕", value: "🎮", label: "🎮", value: "🎧", label: "🎧", value: "💤", label: "💤", value: "🫠", label: "🫠", value: "😏", label: "😏", value: "🤣", label: "🤣", value: "🥹", label: "🥹", value: "😴", label: "😴", value: "🤯", label: "🤯", value: "👏", label: "👏", value: "🙌", label: "🙌", value: "💅", label: "💅", value: "🧠", label: "🧠", value: "👑", label: "👑", value: "💎", label: "💎", value: "🌈", label: "🌈", value: "⭐", label: "⭐", value: "🎈", label: "🎈", value: "🍀", label: "🍀", value: "🔔", label: "🔔", value: "📌", label: "📌" }], default: "🔥" },
    { key: "otherEmoji", type: "text", label: "Others-react emoji (custom)", description: "Emoji used for people in the list below.", default: "🔥", placeholder: "🔥", maxLength: 100 },
    { key: "otherTargets", type: "text", label: "Auto-react user IDs", description: "Comma/space-separated user IDs to auto-react to - as many as you want. Use Profile tools > Copy user ID to get one.", default: "", placeholder: "123456, 789012, 345678", maxLength: 10000 },
    { key: "otherEnabled", type: "toggle", label: "Auto-react others enabled", default: false },
    { key: "logEnabled", type: "toggle", label: "Edit/delete logger enabled", description: "Local-only, stored on this device.", default: true },
    { key: "logLimit", type: "number", label: "Log entries kept", min: 10, max: 500, step: 10, default: 100 },
    { key: "emojiTarget", type: "select", label: "Emoji selector target", description: "Where /emoji puts the picked emoji.", options: [{ value: "self", label: "Self-react" }, { value: "other", label: "Others-react" }, { value: "composer", label: "Message box (insert)" }], default: "self" },
    { key: "silentTyping", type: "toggle", label: "Silent typing (real)", description: "Patches Nexa's own sendTyping setting off via stores, so Composer never broadcasts typing - including manual typing. Restored when the plugin stops.", default: true },
    { key: "countEnabled", type: "toggle", label: "Message stats counting", description: "Counts your messages, top channels, and most-used emoji locally on this device.", default: true },
    { key: "rotatorEnabled", type: "toggle", label: "Status rotator enabled", default: false },
    { key: "rotatorInterval", type: "number", label: "Status rotate every (seconds)", min: 2, max: 3600, step: 2, default: 2 },
    { key: "rotatorItems", type: "text", label: "Status entries", description: "Comma-separated text, emoji pairs, e.g. :3, :P, :c, :D", default: ":3, :P, :c, :D", placeholder: ":3, :P, :c, :D", maxLength: 2000 },
    { key: "displayRotatorEnabled", type: "toggle", label: "Display rotator enabled", description: "Rotates display name only (NOT username/handle - handles can't change via API).", default: false },
    { key: "displayRotatorInterval", type: "number", label: "Display rotate every (seconds)", min: 2, max: 3600, step: 2, default: 2 },
    { key: "displayRotatorItems", type: "text", label: "Display names", description: "Comma-separated display names, e.g. :3, :P, :c, :D (same format/defaults as status rotator)", default: ":3, :P, :c, :D", placeholder: ":3, :P, :c, :D", maxLength: 2000 },
    { key: "allAccounts", type: "toggle", label: "Rotate ALL accounts (multi-account)", description: "Applies status + display rotation to every account in ec.accounts via direct PATCH /users/@me with each account's own token. Active account goes through the plugin API; the rest go straight to the API.", default: true },
    { key: "allReact", type: "toggle", label: "All accounts self-react (multi-account)", description: "Every account in ec.accounts adds the self-react emoji to your messages, not just the active one. Each fires with that account's own token; accounts not in the channel just fail silently.", default: true }
  ],
  start(api) {
    const txt = (k, d) => {
      const v = api.settings.get(k);
      return typeof v === "string" && v.trim() ? v.trim() : d;
    };
    const on = (k) => api.settings.get(k) !== false;
    const meId = () => api.users.me?.id ?? "";
    const parseIds = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

    const parseEmojis = (raw) => {
      const s = String(raw || "").trim();
      if (!s) return [];
      const out = [];
      const push = (e) => { const t = String(e || "").trim(); if (t && !out.includes(t)) out.push(t); };

      const server = s.match(/<a?:[A-Za-z0-9_]+:\d+>/g) || [];
      for (const e of server) push(e);
      const rest = s.replace(/<a?:[A-Za-z0-9_]+:\d+>/g, " ");
      for (const chunk of rest.split(/[,\s]+/).filter(Boolean)) {
        if (/^:[A-Za-z0-9_]+:$/.test(chunk)) { push(chunk); continue; }
        let graphemes = [];
        try { graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(chunk)].map((x) => x.segment); }
        catch { graphemes = Array.from(chunk); }
        for (const g of graphemes) if (/\p{Extended_Pictographic}/u.test(g)) push(g);
        if (!graphemes.some((g) => /\p{Extended_Pictographic}/u.test(g)) && chunk) push(chunk);
      }
      return out;
    };
    const selfEmojis = () => parseEmojis(txt("selfEmoji", "✨")).length ? parseEmojis(txt("selfEmoji", "✨")) : ["✨"];

    const ls = () => {
      try { if (typeof localStorage !== "undefined" && localStorage) return localStorage; } catch {}
      try { if (typeof window !== "undefined" && window.localStorage) return window.localStorage; } catch {}
      return null;
    };
    const hasFetch = typeof fetch === "function";
    let accCache = { at: 0, list: [] };
    const readAccounts = () => {

      const now = Date.now();
      if (accCache.list.length && now - accCache.at < 5000) return accCache.list;
      let list = [];
      try {
        const store = ls();
        const raw = store?.getItem("ec.accounts");
        const parsed = JSON.parse(raw || "[]");
        list = Array.isArray(parsed) ? parsed.filter((a) => a && typeof a.id === "string" && typeof a.token === "string") : [];
      } catch (e) { console.warn("[Toolbox] readAccounts:", e?.message ?? e); list = []; }
      accCache = { at: now, list };
      return list;
    };
    const BASE = "/api/v1";
    const patchAccount = async (token, body) => {
      const res = await fetch(BASE + "/users/@me", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json().catch(() => null);
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const applyToAll = async (body, viaApi) => {
      const accounts = (on("allAccounts") && hasFetch) ? readAccounts() : [];
      let ok = 0, failed = 0;
      if (!accounts.length) { await viaApi(); return { ok: 1, failed: 0, total: 1 }; }
      for (const acc of accounts) {
        try {
          if (String(acc.id) === String(meId())) await viaApi();
          else await patchAccount(acc.token, body);
          ok += 1;
        } catch (e) { failed += 1; console.warn("[Toolbox] account", acc.username, e?.message ?? e); }
        if (accounts.length > 1) await sleep(150);
      }
      return { ok, failed, total: accounts.length };
    };

    const reactAll = async (channelId, id, emojiList, existing) => {
      const settled = await Promise.allSettled(emojiList.map((e) => reactOnce(channelId, id, e, existing)));
      let ok = 0, failed = 0, lastErr = null;
      for (const r of settled) {
        if (r.status === "fulfilled") ok += 1;
        else { failed += 1; lastErr = r.reason; console.warn("[Toolbox] react", r.reason?.message ?? r.reason); }
      }
      if (failed && !ok) throw lastErr;
      return { ok, failed };
    };

    const reactAsAccount = async (token, channelId, id, emoji) => {
      if (typeof fetch !== "function") throw new Error("fetch unavailable in plugin sandbox");
      const res = await fetch(`${BASE}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(id)}/reactions/${encodeURIComponent(emoji)}/@me`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    };

    const reactEverywhere = async (channelId, id, emojiList, existing) => {
      if (!emojiList.length) return { ok: 0, failed: 0 };
      const accounts = (on("allReact") && hasFetch) ? readAccounts() : [];
      const jobs = [];
      if (accounts.length) {
        for (const acc of accounts) {
          for (const emoji of emojiList) {
            jobs.push(String(acc.id) === String(meId())
              ? reactOnce(channelId, id, emoji, existing)
              : reactAsAccount(acc.token, channelId, id, emoji));
          }
        }
      } else {
        for (const emoji of emojiList) jobs.push(reactOnce(channelId, id, emoji, existing));
      }
      const settled = await Promise.allSettled(jobs);
      let ok = 0, failed = 0;
      for (const r of settled) r.status === "fulfilled" ? ok++ : (failed++, console.warn("[Toolbox] multi-react", r.reason?.message ?? r.reason));
      return { ok, failed };
    };

    const seenMsgs = new Set();
    const seenOnce = (key) => { if (seenMsgs.has(key)) return false; seenMsgs.add(key); if (seenMsgs.size > 500) seenMsgs.delete(seenMsgs.values().next().value); return true; };
    const seenSnipeSet = new Set();
    const seenSnipe = (key) => { if (seenSnipeSet.has(key)) return false; seenSnipeSet.add(key); if (seenSnipeSet.size > 500) seenSnipeSet.delete(seenSnipeSet.values().next().value); return true; };
    let lastLogToast = 0;
    const logToast = (msg) => { const now = Date.now(); if (now - lastLogToast < 2000) return; lastLogToast = now; api.ui.toast(msg, { type: "info", duration: 2000 }); };
    const safe = async (fn) => { try { await fn(); } catch (e) { console.warn("[Toolbox]", e?.message ?? e); } };

    try {
      if (typeof window !== "undefined") {
        if (window.__nexaToolboxRunning) {
          console.warn("[Toolbox] another instance is already running - stop it first (or reload the page). Not starting a second one.");
          return;
        }
        window.__nexaToolboxRunning = true;
      }
    } catch {}
    try {
      const OLD = "base status, :3, :P, :c, :D";
      if (txt("rotatorItems", "") === OLD) api.settings.set("rotatorItems", ":3, :P, :c, :D");
      if (txt("displayRotatorItems", "") === OLD) api.settings.set("displayRotatorItems", ":3, :P, :c, :D");
    } catch {}

    try {
      api.settings.onChange("selfEmojiPick", (v) => { if (v) api.settings.set("selfEmoji", v); });
      api.settings.onChange("otherEmojiPick", (v) => { if (v) api.settings.set("otherEmoji", v); });
    } catch (e) { console.warn("[Toolbox] settings sync", e?.message ?? e); }

    const setSendTyping = (send) => {
      try {
        const store = api.stores?.settings;
        if (!store?.getState) throw new Error("stores permission not granted");
        store.getState().patch({ sendTyping: send });
        api.settings.set("silentTyping", !send);
        return true;
      } catch (e) {
        console.warn("[Toolbox] sendTyping patch failed (need `stores` permission):", e?.message ?? e);
        api.ui.toast("Silent typing needs the `stores` permission - grant it under Permissions.", { type: "error" });
        return false;
      }
    };
    if (on("silentTyping")) setSendTyping(false);
    restoreSendTyping = () => { try { api.stores?.settings?.getState?.().patch({ sendTyping: true }); } catch {} };

    const loadLog = () => { try { const v = api.storage.get("editlog"); return Array.isArray(v) ? v : []; } catch { return []; } };
    const saveLog = (entries) => {
      try {
        const limit = Math.max(10, Math.min(500, Number(api.settings.get("logLimit")) || 100));
        api.storage.set("editlog", entries.slice(-limit));
      } catch (e) { console.warn("[Toolbox] saveLog:", e?.message ?? e); }
    };
    const loadCache = () => { try { const v = api.storage.get("msgcache"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; } };
    const saveCache = (c) => {
      try {
        const keys = Object.keys(c);
        if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete c[k];
        api.storage.set("msgcache", c);
      } catch (e) { console.warn("[Toolbox] saveCache:", e?.message ?? e); }
    };
    const pushLog = (entry) => {
      try { const l = loadLog(); l.push(entry); saveLog(l); }
      catch (e) { console.warn("[Toolbox] pushLog:", e?.message ?? e); }
    };

    const cacheMessage = (m) => {
      try {
        if (!m?.id || !m.channelId || m.content == null) return;
        const c = loadCache();
        c[`${m.channelId}:${m.id}`] = { authorId: m.authorId, content: String(m.content), at: Date.now() };
        saveCache(c);
      } catch (e) { console.warn("[Toolbox] cacheMessage:", e?.message ?? e); }
    };

    const backfillChannel = async (channelId) => {
      try {
        if (!channelId) return;
        const msgs = await api.messages.list(channelId, { limit: 50 });
        for (const m of msgs) cacheMessage(m);
      } catch (e) { console.warn("[Toolbox] backfill:", e?.message ?? e); }
    };

    const reactOnce = async (channelId, id, emoji, existing) => {
      if (!channelId || !id || !emoji) return;
      if (Array.isArray(existing) && existing.some((r) => r.emoji === emoji && r.me)) return;
      await api.messages.react(channelId, id, emoji);
    };

    const loadStats = () => api.storage.get("stats") || { total: 0, byChannel: {}, emojis: {}, firstAt: null, lastAt: null };
    const countEmojis = (content, into) => {
      if (!content) return;
      const uni = content.match(/\p{Extended_Pictographic}/gu) || [];
      for (const e of uni) into[e] = (into[e] || 0) + 1;
      const srv = content.match(/<a?:([A-Za-z0-9_]+):\d+>/g) || [];
      for (const e of srv) into[e] = (into[e] || 0) + 1;
    };
    const bumpStats = (message) => {
      if (!on("countEnabled")) return;
      const s = loadStats();
      s.total += 1;
      s.byChannel[message.channelId] = (s.byChannel[message.channelId] || 0) + 1;
      countEmojis(message.content, s.emojis);
      if (!s.firstAt) s.firstAt = Date.now();
      s.lastAt = Date.now();
      try { api.storage.set("stats", s); } catch (e) { console.warn("[Toolbox] stats", e?.message ?? e); }
    };    api.events.on("messageCreated", (message) => {
      try {
      if (!message?.id || !message.channelId) return;
      lastChannelId = message.channelId;
      if (!seenOnce(`${message.channelId}:${message.id}`)) return;
      const mine = String(message.authorId) === String(meId());
      if (mine && on("selfEnabled")) {
        safe(() => reactEverywhere(message.channelId, message.id, selfEmojis(), message.reactions));
      } else if (on("otherEnabled") && !mine) {
        const targets = parseIds(txt("otherTargets", ""));
        if (targets.includes(String(message.authorId))) {

          safe(() => reactEverywhere(message.channelId, message.id, [txt("otherEmoji", "🔥")], message.reactions));
        }
      }
      cacheMessage(message);
      if (mine) bumpStats(message);
      } catch (e) { console.warn("[Toolbox] messageCreated", e?.message ?? e); }
    });

    const t1 = (v, n = 200) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

    const handleEdit = async (channelId, id, authorId, oldContent, newContent) => {
      pushLog({ kind: "edit", channelId, messageId: id, authorId, oldContent: String(oldContent ?? "(not cached)"), newContent: String(newContent ?? ""), at: Date.now() });
      console.log(`[Toolbox] logged edit ${channelId}:${id}`);
      logToast(`✎ edit logged in ${channelId}`);
    };
    const handleDelete = async (channelId, id, authorId, content) => {
      pushLog({ kind: "delete", channelId, messageId: id, authorId, oldContent: String(content ?? "(not cached)"), newContent: "", at: Date.now() });
      console.log(`[Toolbox] logged delete ${channelId}:${id}`);
      logToast(`✕ delete logged in ${channelId}`);
    };
    const purgeCacheKey = (channelId, id) => {
      const c = loadCache();
      if (c[`${channelId}:${id}`]) { delete c[`${channelId}:${id}`]; saveCache(c); }
    };
    api.events.on("messageEdited", async (message) => {
      try {
        if (!on("logEnabled") || !message?.id) return;
        lastChannelId = message.channelId;
        const cached = loadCache()[`${message.channelId}:${message.id}`];
        if (cached && cached.content === String(message.content ?? "")) return;
        if (!seenSnipe(`snipe:${message.channelId}:${message.id}:${message.content?.length ?? 0}`)) return;
        await handleEdit(message.channelId, message.id, message.authorId, cached?.content, message.content);
        cacheMessage(message);
      } catch (e) { console.warn("[Toolbox] messageEdited:", e?.message ?? e); }
    });
    api.events.on("messageDeleted", async (data) => {
      try {
        if (!on("logEnabled") || !data?.id) return;
        lastChannelId = data.channelId;
        if (!seenSnipe(`snipe:${data.channelId}:${data.id}`)) return;
        const cached = loadCache()[`${data.channelId}:${data.id}`];
        await handleDelete(data.channelId, data.id, data.message?.authorId ?? cached?.authorId ?? null, data.message?.content ?? cached?.content);
        purgeCacheKey(data.channelId, data.id);
      } catch (e) { console.warn("[Toolbox] messageDeleted:", e?.message ?? e); }
    });
    const idCmp = (a, b) => { const A = String(a), B = String(b); return A.length !== B.length ? A.length - B.length : (A < B ? -1 : A > B ? 1 : 0); };
    let snipePollBusy = false;
    const snipePoll = async () => {
      if (snipePollBusy || !lastChannelId || !on("logEnabled")) return;
      snipePollBusy = true;
      try {
        const msgs = await api.messages.list(lastChannelId, { limit: 30 });
        if (!msgs?.length) return;
        const ids = new Set(msgs.map((m) => String(m.id)));
        const sorted = msgs.map((m) => String(m.id)).sort(idCmp);
        const minId = sorted[0], maxId = sorted[sorted.length - 1];
        const cache = loadCache();
        const chKeys = Object.keys(cache).filter((k) => k.startsWith(`${lastChannelId}:`));
        for (const key of chKeys) {
          const id = key.split(":")[1];
          if (!ids.has(id)) {
            if (idCmp(id, minId) >= 0 && idCmp(id, maxId) <= 0 && Date.now() - (cache[key]?.at || 0) < 30 * 60 * 1000 && seenSnipe(`snipe:${lastChannelId}:${id}`)) {
              await handleDelete(lastChannelId, id, cache[key]?.authorId ?? null, cache[key]?.content);
              purgeCacheKey(lastChannelId, id);
            }
          } else {
            const fresh = msgs.find((m) => String(m.id) === id);
            if (fresh && cache[key] && cache[key].content !== String(fresh.content ?? "") && seenSnipe(`snipe:${lastChannelId}:${id}:${String(fresh.content ?? "").length}`)) {
              await handleEdit(lastChannelId, id, cache[key].authorId, cache[key].content, fresh.content);
            }
          }
        }
        for (const m of msgs) if (m?.id && m.channelId && m.content != null) cache[m.channelId + ":" + m.id] = { authorId: m.authorId, content: String(m.content), at: Date.now() };
        saveCache(cache);
      } catch (e) { console.warn("[Toolbox] snipe poll", e?.message ?? e); }
      finally { snipePollBusy = false; }
    };
    const startSnipePoll = () => {
      if (snipeTimer) { clearTimeout(snipeTimer); snipeTimer = null; }
      if (!on("logEnabled")) return;
      const tick = async () => {
        try { await snipePoll(); } catch {}
        snipeTimer = setTimeout(tick, 8000);
      };
      snipeTimer = setTimeout(tick, 8000);
    };
    startSnipePoll();
    try { api.settings.onChange("logEnabled", startSnipePoll); } catch {}

    const sendOrInsert = async (ctx, text) => {
      if (ctx?.channel?.id) await api.messages.send(ctx.channel.id, { content: text });
      else if (api.composer?.insert) await api.composer.insert(text);
      else api.ui.toast(text.slice(0, 200), { type: "info" });
    };
    const register = (name, desc, cb) => { try { api.commands.register(name, desc, cb); } catch (e) { console.warn("[Toolbox] command skipped:", name, e?.message ?? e); } };

    register("selfreact", "Set self-react emoji (multiple ok), on/off, or show current - /selfreact on|off or /selfreact ✨, 🔥", async (args) => {
      const e = (args || "").trim();
      if (!e) return api.ui.toast(`Self-react ${on("selfEnabled") ? "ON" : "OFF"}: ${selfEmojis().join(" ")}`, { type: "info" });
      const low = e.toLowerCase();
      if (low === "on" || low === "enable" || low === "enabled") { api.settings.set("selfEnabled", true); return api.ui.toast("Self-react ON.", { type: "success" }); }
      if (low === "off" || low === "disable" || low === "disabled") { api.settings.set("selfEnabled", false); return api.ui.toast("Self-react OFF - no more self reactions.", { type: "info" }); }
      api.settings.set("selfEmoji", e);
      api.ui.toast(`Self-react set to ${selfEmojis().join(" ")} (all will fire)`, { type: "success" });
    });

    register("reactto", "Set others-react emoji + target IDs (comma/space separated, many ok) - every account reacts", async (args) => {
      const raw = (args || "").trim();
      if (!raw) {
        const current = parseIds(txt("otherTargets", ""));
        return api.ui.toast(current.length ? `${current.length} targets: ${current.join(", ")}` : "No targets. Usage: /reactto <emoji> <id1,id2,...> (many IDs ok)", { type: "info", duration: 8000 });
      }
      const parts = raw.split(/\s+/).filter(Boolean);
      if (parts.length < 2) return api.ui.toast("Usage: /reactto <emoji> <id1,id2,...> - many IDs ok, comma or space separated", { type: "warning" });
      api.settings.set("otherEmoji", parts[0]);
      api.settings.set("otherTargets", parts.slice(1).join(","));
      api.settings.set("otherEnabled", true);
      api.ui.toast(`Auto-reacting ${parts[0]} to ${parseIds(parts.slice(1).join(",")).length} target(s) - every account reacts`, { type: "success" });
    });
    register("reacttoadd", "Add user ID(s) to auto-react targets - /reacttoadd <id1,id2,...>", async (args) => {
      const ids = parseIds((args || "").replace(/\s+/g, ","));
      if (!ids.length) return api.ui.toast("Usage: /reacttoadd <id1,id2,...> - many IDs ok", { type: "warning" });
      const current = parseIds(txt("otherTargets", ""));
      const merged = [...current];
      for (const id of ids) if (!merged.includes(id)) merged.push(id);
      api.settings.set("otherTargets", merged.join(","));
      api.settings.set("otherEnabled", true);
      api.ui.toast(`Added ${merged.length - current.length} - ${merged.length} target(s) total`, { type: "success" });
    });
    register("reacttoclear", "Clear all auto-react targets", async () => {
      api.settings.set("otherTargets", "");
      api.ui.toast("Auto-react targets cleared.", { type: "info" });
    });

    register("history", "Show recent edits/deletes (optionally: <channelId>)", async (args, ctx) => {
      const channelId = (args || "").trim() || ctx?.channel?.id;
      if (channelId) await backfillChannel(channelId).catch(() => {});
      const rows = loadLog().filter((e) => !channelId || e.channelId === channelId).slice(-10).reverse();
      if (!rows.length) return api.ui.toast(`No logged edits/deletes yet${channelId ? ` in ${channelId}` : ""}. (Gateway catches edits/deletes in open channels; the 8s poller covers your own too.)`, { type: "info", duration: 8000 });
      const text = rows.map((e) => `${e.kind === "edit" ? "✎" : "✕"} ${e.authorId ?? "?"}: ${String(e.oldContent ?? "").slice(0, 80)}${e.kind === "edit" ? " → " + String(e.newContent ?? "").slice(0, 80) : ""}`).join("\n");
      await sendOrInsert(ctx, text);
    });

    register("snipe", "Show the newest deleted message (toast only, never posts)", async () => {
      const del = loadLog().filter((e) => e.kind === "delete").slice(-1)[0];
      if (!del) return api.ui.toast("No snipes yet.", { type: "info", duration: 8000 });
      api.ui.toast(`Last snipe: ${t1(del.oldContent, 200)}`, { type: "info", duration: 8000 });
    });
    register("snipes", "List recent deleted messages - /snipes [count 1-20]", async (args, ctx) => {
      const n = Math.max(1, Math.min(20, parseInt((args || "").trim(), 10) || 10));
      const rows = loadLog().filter((e) => e.kind === "delete").slice(-n).reverse();
      if (!rows.length) return api.ui.toast("No snipes logged yet.", { type: "info" });
      await sendOrInsert(ctx, rows.map((e) => `${e.authorId ?? "?"}: ${t1(e.oldContent, 120)}`).join("\n"));
    });
    register("logdiag", "Diagnose the edit/delete logger (storage + cache counts)", async (_args, ctx) => {
      const log = loadLog(), cache = loadCache();
      const info = `logEnabled=${on("logEnabled")}, entries=${log.length}, cached=${Object.keys(cache).length}, storage keys=${(api.storage.keys?.() ?? []).join(",")}`;
      console.log("[Toolbox logdiag]", info);
      const channels = [...new Set(log.map((e) => e.channelId))];
      api.ui.toast(`${info} | channels logged: ${channels.join(",") || "none"}`, { type: "info", duration: 8000 });
      if (ctx?.channel?.id) await backfillChannel(ctx.channel.id);
    });

    register("upper", "Send text in UPPERCASE", async (args, ctx) => sendOrInsert(ctx, (args || "").toUpperCase()));
    register("lower", "Send text in lowercase", async (args, ctx) => sendOrInsert(ctx, (args || "").toLowerCase()));
    register("reverse", "Send text reversed", async (args, ctx) => sendOrInsert(ctx, [...(args || "")].reverse().join("")));
    register("spoily", "Send text as spoiler", async (args, ctx) => sendOrInsert(ctx, `||${args || ""}||`));
    register("shout", "Send text with extra emphasis", async (args, ctx) => sendOrInsert(ctx, `**${args || ""}**`));
    register("quote", "Quote text", async (args, ctx) => sendOrInsert(ctx, `> ${args || ""}`));

    const PRESETS = ["✨","🔥","💀","😂","❤️","👍","👎","😮","😢","😡","🥳","😎","🤔","🙏","💯","🎉","🚀","👀","🫡","🤝","💪","🏆","🎯","⚡","🌟","🍕","☕","🎮","🎧","💤","🫠","😏","🤣","🥹","😴","🤯","👏","🙌","💅","🧠","👑","💎","🌈","⭐","🎈","🍀","🔔","📌","🧲","🛎️"];
    const resolveEmoji = (input) => {
      const v = (input || "").trim();
      if (!v) return null;

      const found = (() => { try { return api.servers.emojis.find(v.replace(/^:+|:+$/g, "")); } catch { return null; } })();
      if (found) return found.markdown;
      if (/^<a?:[^>]+>$/.test(v)) return v;
      return v;
    };
    const applyEmoji = async (target, emoji, ctx) => {
      if (target === "self") { api.settings.set("selfEmoji", emoji); return api.ui.toast(`Self-react emoji: ${emoji}`, { type: "success" }); }
      if (target === "other") { api.settings.set("otherEmoji", emoji); return api.ui.toast(`Others-react emoji: ${emoji}`, { type: "success" }); }
      if (target === "composer") {
        if (api.composer?.insert) await api.composer.insert(emoji + " ");
        else if (ctx?.channel?.id) await sendOrInsert(ctx, emoji);
        else await api.ui.copy(emoji);
        return;
      }
      api.ui.toast(`Unknown target: ${target} (self|other|composer)`, { type: "warning" });
    };

    register("emoji", "Emoji selector - /emoji [self|other|composer] [emoji-or-name]", async (args, ctx) => {
      const parts = (args || "").trim().split(/\s+/).filter(Boolean);
      let target = ["self", "other", "composer"].includes(parts[0]) ? parts.shift() : (api.settings.get("emojiTarget") || "self");
      let raw = parts.join(" ");
      if (!raw) {
        raw = await api.ui.prompt({ title: "Pick an emoji", label: "Unicode emoji, server emoji name (e.g. party), or <:name:id>", placeholder: "✨ or party", maxLength: 100 });
        if (raw === null) return;
      }
      const emoji = resolveEmoji(raw);
      if (!emoji) return api.ui.toast("No emoji given.", { type: "warning" });
      await applyEmoji(target, emoji, ctx);
    });

    register("emojis", "List server emoji - /emojis [search]", async (args, ctx) => {
      const q = (args || "").trim().toLowerCase();
      let all = [];
      try { all = api.servers.emojis.list() || []; } catch (e) { console.warn("[Toolbox] emojis.list", e?.message ?? e); }
      const hits = all.filter((e) => !q || e.name.toLowerCase().includes(q)).slice(0, 25);
      if (!hits.length) return api.ui.toast(q ? `No server emoji matching "${q}".` : "No server emoji found on this device.", { type: "info" });
      const text = hits.map((e) => `${e.markdown} :${e.name}:`).join("  ");
      await sendOrInsert(ctx, text);
    });

    register("pickemoji", "Quick-pick from preset emoji grid (number) - /pickemoji [self|other|composer] [1-48]", async (args, ctx) => {
      const parts = (args || "").trim().split(/\s+/).filter(Boolean);
      let target = ["self", "other", "composer"].includes(parts[0]) ? parts.shift() : (api.settings.get("emojiTarget") || "self");
      const num = parseInt(parts[0], 10);
      if (Number.isNaN(num)) {
        const grid = PRESETS.map((e, i) => `${i + 1}. ${e}`).join(" ");
        await sendOrInsert(ctx, grid);
        return api.ui.toast("Reply /pickemoji <target> <number> to choose.", { type: "info", duration: 8000 });
      }
      const emoji = PRESETS[num - 1];
      if (!emoji) return api.ui.toast(`Pick 1-${PRESETS.length}.`, { type: "warning" });
      await applyEmoji(target, emoji, ctx);
    });

    const sendSilent = async (ctx, text) => {
      if (!ctx?.channel?.id) return api.ui.toast("Silent send needs a channel context.", { type: "warning" });
      await api.messages.send(ctx.channel.id, { content: text });
    };
    register("silent", "Send text silently (no typing indicator) - /silent <text>", async (args, ctx) => {
      const text = (args || "").trim();
      if (!text) return api.ui.toast("Usage: /silent <text>", { type: "warning" });
      await sendSilent(ctx, text);
    });
    register("silenton", "Turn silent typing on (hides typing indicator, incl. manual typing)", async () => { if (setSendTyping(false)) api.ui.toast("Silent typing on - nobody sees you typing.", { type: "success" }); });
    register("silentoff", "Turn silent typing off (typing indicator back)", async () => { if (setSendTyping(true)) api.ui.toast("Typing indicator back on.", { type: "info" }); });

    register("testreact", "React to your newest message here (diagnostic) - /testreact all", async (args, ctx) => {
      if (!ctx?.channel?.id) return api.ui.toast("Open a channel first.", { type: "warning" });
      const msgs = await api.messages.list(ctx.channel.id, { limit: 20 });
      const mine = [...msgs].reverse().find((m) => String(m.authorId) === String(meId()));
      if (!mine) return api.ui.toast("No own message found in recent history.", { type: "warning" });
      const list = selfEmojis();
      const all = (args || "").trim() === "all";
      try {
        const { ok, failed } = all
          ? await reactEverywhere(ctx.channel.id, mine.id, list, mine.reactions)
          : await reactAll(ctx.channel.id, mine.id, list, mine.reactions);
        api.ui.toast(`Reacted ${list.join(" ")} (${ok} ok${failed ? `, ${failed} failed` : ""}${all ? ` across ${readAccounts().length || 1} accounts` : ""}) - react path works.`, { type: failed ? "warning" : "success", duration: 8000 });
      } catch (e) {
        api.ui.toast(`React failed (${list.join(" ")}): ${e?.name ?? "Error"} ${e?.permission ?? e?.message ?? e} - check servers.messages.write permission.`, { type: "error", duration: 8000 });
      }
    });

    register("unreactall", "Remove your reactions from recent messages here - /unreactall [limit 1-100]", async (args, ctx) => {
      if (!ctx?.channel?.id) return api.ui.toast("Open a channel first.", { type: "warning" });
      const limit = Math.max(1, Math.min(100, parseInt((args || "").trim(), 10) || 50));
      const msgs = await api.messages.list(ctx.channel.id, { limit });
      let removed = 0, failed = 0;
      for (const m of msgs) {
        const mine = (m.reactions || []).filter((r) => r.me);
        for (const r of mine) {
          try { await api.messages.unreact(ctx.channel.id, m.id, r.emoji); removed += 1; }
          catch (e) { failed += 1; console.warn("[Toolbox] unreact", e?.message ?? e); }
        }
      }
      api.ui.toast(`Removed ${removed} reaction${removed === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`, { type: removed ? "success" : "info" });
    });

    const topEntries = (obj, n) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, n);
    register("stats", "Your message stats (local)", async (_args, ctx) => {
      const s = loadStats();
      if (!s.total) return api.ui.toast("No messages counted yet.", { type: "info" });
      const days = s.firstAt ? Math.max(1, Math.round((Date.now() - s.firstAt) / 86400000)) : 1;
      const lines = [`📊 ${s.total} messages in ${days} day${days === 1 ? "" : "s"} (~${(s.total / days).toFixed(1)}/day)`];
      const ch = topEntries(s.byChannel, 5);
      if (ch.length) lines.push("Top channels: " + ch.map(([id, n]) => `${id} ×${n}`).join(", "));
      const em = topEntries(s.emojis, 8);
      if (em.length) lines.push("Top emoji: " + em.map(([e, n]) => `${e} ×${n}`).join("  "));
      await sendOrInsert(ctx, lines.join("\n"));
    });
    register("resetstats", "Clear your message stats", async () => {
      if (!(await api.ui.confirm({ title: "Reset stats?", message: "Clears all counted messages, channels, and emoji usage on this device.", confirmText: "Reset" }))) return;
      api.storage.remove("stats");
      api.ui.toast("Stats cleared.", { type: "success" });
    });

    const looksLikeEmoji = (t) => /^(<:?(?:[A-Za-z0-9_]+):\d+>|:[A-Za-z0-9_]+:|\p{Extended_Pictographic})/u.test(t);
    const parseRotator = () => {
      const tokens = txt("rotatorItems", "").split(",").map((x) => x.trim()).filter(Boolean);
      const items = [];
      for (const tok of tokens) {
        if (tok.includes("|")) { const [text, emoji] = tok.split("|").map((x) => x.trim()); items.push({ text: text || "", emoji: emoji || "" }); continue; }
        if (looksLikeEmoji(tok) && items.length && !items[items.length - 1].emoji) { items[items.length - 1].emoji = tok; continue; }
        items.push({ text: looksLikeEmoji(tok) ? "" : tok, emoji: looksLikeEmoji(tok) ? tok : "" });
      }
      return items.filter((e) => e.text || e.emoji);
    };
    const parseCommaPair = (raw) => {
      const parts = raw.split(",").map((x) => x.trim()).filter((x) => x.length);
      if (parts.length >= 2) return { text: parts[0], emoji: parts.slice(1).join(", ") };
      if (parts.length === 1 && parts[0].includes("|")) { const [text, emoji] = parts[0].split("|").map((x) => x.trim()); return { text: text || "", emoji: emoji || "" }; }
      return { text: parts[0] || "", emoji: "" };
    };
    const applyStatus = async (entry) => {
      const body = { status_text: entry.text, status_emoji: entry.emoji, status_expires_at: null };
      await applyToAll(body, () => api.users.update({ status: { text: entry.text, emoji: entry.emoji, expiresAt: null } }));
    };
    let rotBusy = false;
    const rotateOnce = async () => {
      if (rotBusy || !on("rotatorEnabled")) return;
      rotBusy = true;
      const items = parseRotator();
      try {
        if (items.length) {
          const idx = Number(api.storage.get("rotIdx") || 0) % items.length;
          api.storage.set("rotIdx", idx + 1);
          await applyStatus(items[idx]);
        }
      } catch (e) { console.warn("[Toolbox] status rotate", e?.message ?? e); }
      finally { rotBusy = false; }
    };

    const startRotator = () => {
      if (rotateTimer) { clearTimeout(rotateTimer); rotateTimer = null; }
      if (!on("rotatorEnabled")) return;
      const secs = Math.max(2, Math.min(3600, Number(api.settings.get("rotatorInterval")) || 2));
      const tick = () => { rotateOnce(); rotateTimer = setTimeout(tick, secs * 1000); };
      rotateOnce();
      rotateTimer = setTimeout(tick, secs * 1000);
    };
    startRotator();
    try {
      api.settings.onChange("rotatorEnabled", startRotator);
      api.settings.onChange("rotatorInterval", startRotator);
      api.settings.onChange("rotatorItems", startRotator);
    } catch {}
    register("rotate", "Advance status rotator now (or /rotate <text>,<emoji> to set once)", async (args) => {
      const raw = (args || "").trim();
      if (raw) {

        try { await applyStatus(parseCommaPair(raw)); api.ui.toast("Status set.", { type: "success" }); }
        catch (e) { api.ui.toast(`Status failed: ${e?.permission ?? e?.message ?? e}`, { type: "error" }); }
        return;
      }
      await rotateOnce();
      api.ui.toast("Status rotated.", { type: "success" });
    });
    register("status", "Set your status once - /status <text> or /status <text>,<emoji>", async (args) => {
      const raw = (args || "").trim();
      if (!raw) return api.ui.toast("Usage: /status <text> or /status <text>,<emoji>", { type: "warning" });
      try { await applyStatus(parseCommaPair(raw)); api.ui.toast("Status set.", { type: "success" }); }
      catch (e) { api.ui.toast(`Status failed: ${e?.permission ?? e?.message ?? e}`, { type: "error" }); }
    });

    const parseDisplayRotator = () => txt("displayRotatorItems", "").split(",").map((x) => x.trim()).filter(Boolean);
    const applyDisplay = async (name) => {
      await applyToAll({ display_name: name }, () => api.users.update({ displayName: name }));
    };
    let dispBusy = false;
    const rotateDisplayOnce = async () => {
      if (dispBusy || !on("displayRotatorEnabled")) return;
      dispBusy = true;
      const items = parseDisplayRotator();
      try {
        if (items.length) {
          const idx = Number(api.storage.get("dispIdx") || 0) % items.length;
          api.storage.set("dispIdx", idx + 1);
          await applyDisplay(items[idx]);
          console.log(`[Toolbox] display → [${idx}/${items.length}] ${items[idx]}`);
        }
      } catch (e) { console.warn("[Toolbox] display rotate", e?.message ?? e); }
      finally { dispBusy = false; }
    };

    const startDisplayRotator = () => {
      if (displayTimer) { clearTimeout(displayTimer); displayTimer = null; }
      if (!on("displayRotatorEnabled")) return;
      const secs = Math.max(2, Math.min(3600, Number(api.settings.get("displayRotatorInterval")) || 2));
      const tick = () => { rotateDisplayOnce(); displayTimer = setTimeout(tick, secs * 1000); };
      rotateDisplayOnce();
      displayTimer = setTimeout(tick, secs * 1000);
      console.log(`[Toolbox] display rotator ON - every ${secs}s, ${parseDisplayRotator().length} entries`);
    };
    startDisplayRotator();
    try {
      api.settings.onChange("displayRotatorEnabled", startDisplayRotator);
      api.settings.onChange("displayRotatorInterval", startDisplayRotator);
      api.settings.onChange("displayRotatorItems", startDisplayRotator);
      api.settings.onChange("selfEnabled", (v) => console.log(`[Toolbox] selfEnabled -> ${v}`));
    } catch {}
    register("displaystatus", "Show display rotator state (enabled, interval, items, next index)", async () => {
      const items = parseDisplayRotator();
      const idx = items.length ? Number(api.storage.get("dispIdx") || 0) % items.length : 0;
      const info = `display rotator ${on("displayRotatorEnabled") ? "ON" : "OFF"} - every ${Number(api.settings.get("displayRotatorInterval")) || 2}s, ${items.length} entries, next: ${items[idx] ?? "(none)"} | status rotator ${on("rotatorEnabled") ? "ON" : "OFF"} every ${Number(api.settings.get("rotatorInterval")) || 2}s`;
      console.log("[Toolbox displaystatus]", info);
      api.ui.toast(info, { type: "info", duration: 8000 });
    });
    register("display", "Set display name once (NOT username/handle) - /display <name>", async (args) => {
      const name = (args || "").trim();
      if (!name) return api.ui.toast("Usage: /display <name> - rotates display name only, handle unchanged.", { type: "warning" });
      try { await applyDisplay(name); api.ui.toast(`Display set to ${name} (handle unchanged).`, { type: "success" }); }
      catch (e) { api.ui.toast(`Display failed: ${e?.permission ?? e?.message ?? e}`, { type: "error" }); }
    });
    register("displayrotate", "Advance display rotator now", async () => { await rotateDisplayOnce(); api.ui.toast("Display rotated.", { type: "success" }); });
    register("accounts", "List accounts found in ec.accounts (multi-account rotation + react)", async () => {
      accCache.at = 0;
      const accs = readAccounts();
      if (!accs.length) return api.ui.toast(`No ec.accounts found - sign in to another account once. localStorage reachable: ${!!ls()}, fetch: ${hasFetch}. If both true, ec.accounts is just empty.`, { type: "warning", duration: 8000 });
      api.ui.toast(accs.map((a) => `${String(a.id) === String(meId()) ? "●" : "○"} ${a.username || a.display_name || a.id}`).join("  "), { type: "info", duration: 8000 });
    });
    register("rotateall", "Rotate status + display on ALL accounts now", async () => {
      await rotateOnce(); await rotateDisplayOnce();
      const n = readAccounts().length;
      api.ui.toast(`Rotated all ${n || 1} account(s).`, { type: "success" });
    });

    register("whois", "Show profile info for a user ID", async (args) => {
      const id = (args || "").trim();
      if (!id) return api.ui.toast("Usage: /whois <userId>", { type: "warning" });
      const u = await safe(() => api.users.fetch(id)) ?? api.users.get(id);
      if (!u) return api.ui.toast("User not found.", { type: "error" });
      api.ui.toast(`${u.displayName} (@${u.username}) - ${id}`, { type: "info", duration: 8000 });
    });
    register("copyid", "Copy a user ID", async (args) => {
      const id = (args || "").trim();
      if (!id) return api.ui.toast("Usage: /copyid <userId>", { type: "warning" });
      await api.ui.copy(id);
    });

    const addMenu = (menu, button) => { try { api.ui.contextMenu.add(menu, button); } catch (e) { console.warn("[Toolbox] menu skipped:", menu, button.id, e?.message ?? e); } };

    for (const menu of ["message", "member", "user"]) {
      addMenu(menu, {
        id: "toolbox-open-profile", label: "View profile", icon: "user",
        visible: (ctx) => Boolean(ctx?.user?.id),
        onClick: (ctx) => api.ui.openProfile(ctx.user.id)
      });
      addMenu(menu, {
        id: "toolbox-copy-userid", label: "Copy user ID", icon: "copy",
        visible: (ctx) => Boolean(ctx?.user?.id),
        onClick: async (ctx) => { await api.ui.copy(ctx.user.id); }
      });
      addMenu(menu, {
        id: "toolbox-mention", label: "Mention", icon: "at-sign",
        visible: (ctx) => Boolean(ctx?.user?.id && ctx?.channel?.id),
        onClick: async (ctx) => { if (api.composer?.insert) await api.composer.insert(`<@${ctx.user.id}> `); else await api.ui.copy(`<@${ctx.user.id}>`); }
      });
    }

    addMenu("message", {
      id: "toolbox-copy-message", label: "Copy message text", icon: "copy",
      visible: (ctx) => Boolean(ctx?.message?.content),
      onClick: async (ctx) => { await api.ui.copy(ctx.message.content); }
    });
    addMenu("message", {
      id: "toolbox-copy-messageid", label: "Copy message ID", icon: "hash",
      visible: (ctx) => Boolean(ctx?.message?.id),
      onClick: async (ctx) => { await api.ui.copy(ctx.message.id); }
    });

    addMenu("message", {
      id: "toolbox-set-selfreact", label: "Use reaction as self-react emoji", icon: "smile",
      visible: (ctx) => Boolean(ctx?.message?.reactions?.length),
      onClick: async (ctx) => { await applyEmoji("self", ctx.message.reactions[0].emoji, ctx); }
    });
    addMenu("message", {
      id: "toolbox-silent-reply", label: "Silent reply...", icon: "message-square",
      visible: (ctx) => Boolean(ctx?.channel?.id),
      onClick: async (ctx) => {
        const text = await api.ui.prompt({ title: "Silent reply", label: "Sent with no typing indicator", maxLength: 2000 });
        if (text === null || !text.trim()) return;
        await sendSilent(ctx, text.trim());
      }
    });

    const memberOf = (ctx) => (ctx?.server?.id && ctx?.user?.id ? { serverId: ctx.server.id, userId: ctx.user.id } : null);

    addMenu("member", {
      id: "toolbox-mod-timeout", label: "Timeout 10 min", icon: "clock", danger: true,
      visible: (ctx) => Boolean(memberOf(ctx)),
      onClick: async (ctx) => {
        const m = memberOf(ctx);
        if (!(await api.ui.confirm({ title: "Timeout member?", message: "Timeout for 10 minutes?", confirmText: "Timeout" }))) return;
        await safe(() => api.servers.members.mute(m.serverId, m.userId, new Date(Date.now() + 10 * 60 * 1000)));
        api.ui.toast("Timed out for 10 minutes.", { type: "success" });
      }
    });
    addMenu("member", {
      id: "toolbox-mod-untimeout", label: "Remove timeout", icon: "clock",
      visible: (ctx) => Boolean(memberOf(ctx)),
      onClick: async (ctx) => { const m = memberOf(ctx); await safe(() => api.servers.members.unmute(m.serverId, m.userId)); api.ui.toast("Timeout removed.", { type: "success" }); }
    });
    addMenu("member", {
      id: "toolbox-mod-nick", label: "Set nickname...", icon: "pencil",
      visible: (ctx) => Boolean(memberOf(ctx)),
      onClick: async (ctx) => {
        const m = memberOf(ctx);
        const nick = await api.ui.prompt({ title: "Set nickname", label: "New nickname (empty clears)", maxLength: 32 });
        if (nick === null) return;
        await safe(() => api.servers.members.update(m.serverId, m.userId, { nickname: nick }));
        api.ui.toast("Nickname updated.", { type: "success" });
      }
    });
    addMenu("member", {
      id: "toolbox-mod-kick", label: "Kick member", icon: "user-x", danger: true,
      visible: (ctx) => Boolean(memberOf(ctx)),
      onClick: async (ctx) => {
        const m = memberOf(ctx);
        if (!(await api.ui.confirm({ title: "Kick member?", message: "This removes them from the server. They can rejoin with an invite.", confirmText: "Kick", danger: true }))) return;
        await safe(() => api.servers.members.kick(m.serverId, m.userId, { reason: "Kicked via Nexa Toolbox" }));
        api.ui.toast("Kicked.", { type: "success" });
      }
    });
    addMenu("member", {
      id: "toolbox-mod-ban", label: "Ban member", icon: "ban", danger: true,
      visible: (ctx) => Boolean(memberOf(ctx)),
      onClick: async (ctx) => {
        const m = memberOf(ctx);
        if (!(await api.ui.confirm({ title: "Ban member?", message: "This bans them and removes them. This is serious.", confirmText: "Ban", danger: true }))) return;
        await safe(() => api.servers.members.ban(m.serverId, m.userId, { reason: "Banned via Nexa Toolbox" }));
        api.ui.toast("Banned.", { type: "success" });
      }
    });

    const __accN = readAccounts().length;
    api.ui.toast(`Nexa Toolbox on - ${__accN > 1 ? `multi-account: ${__accN} accounts, rotation applies to all` : "self-react, logger, helpers, profile & mod tools ready"}.`, { type: "success" });
  },
  stop() {

    if (restoreSendTyping) { restoreSendTyping(); restoreSendTyping = null; }
    if (rotateTimer) { clearTimeout(rotateTimer); rotateTimer = null; }
    if (displayTimer) { clearTimeout(displayTimer); displayTimer = null; }    if (snipeTimer) { clearTimeout(snipeTimer); snipeTimer = null; }
    try { if (typeof window !== "undefined") window.__nexaToolboxRunning = false; } catch {}
  }
};
