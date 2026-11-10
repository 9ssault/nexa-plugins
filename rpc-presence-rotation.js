export default {
  name: "RPC Presence Rotation",
  description: "Rotating rich presence and Last.fm now playing for Nexa",
  version: "2.2.0",
  apiVersion: 2,
  author: "jesus",
  permissions: ["ui.write"],

  settings: [
    { key: "presenceType", type: "number", label: "Presence Type (0 playing, 1 streaming, 2 listening, 3 watching, 5 competing)", default: 0 },
    { key: "presenceName", type: "text", label: "Presence Name", default: "Nexa" },
    { key: "presenceDetails", type: "text", label: "Presence Details", default: "" },
    { key: "presenceState", type: "text", label: "Presence State", default: "" },
    { key: "presenceImage", type: "text", label: "Large Image (mp: key or URL)", default: "" },
    { key: "rotationSpeed", type: "number", label: "Rotation Speed (1=10m, 2=5m, 3=2m)", default: 1 },
    { key: "enableAutoRotate", type: "toggle", label: "Enable Auto-Rotation", default: true },
    { key: "rotationInterval", type: "number", label: "Custom Interval (ms, 0 = use speed)", default: 0 },
    { key: "lastfmEnabled", type: "toggle", label: "Enable Last.fm Now Playing", default: false },
    { key: "lastfmUsername", type: "text", label: "Last.fm Username", default: "" },
    { key: "lastfmApiKey", type: "text", label: "Last.fm API Key", default: "" },
    { key: "lastfmInterval", type: "number", label: "Last.fm Poll Interval (ms)", default: 15000 },
    { key: "lastfmFallbackRotation", type: "toggle", label: "Fall back to rotation when Last.fm not playing", default: true },
  ],

  start(api) {
    try {
      if (window.__rpcPresenceActive && window.__rpcPresenceActive.stop) {
        window.__rpcPresenceActive.stop();
      }
    } catch (e) {}

    const rpcTypes = [0, 1, 2, 3, 5];
    const rpcTypeNames = ["playing", "streaming", "listening", "watching", "competing"];
    const speedIntervals = { 1: 600000, 2: 300000, 3: 120000 };
    let idx = rpcTypes.indexOf(Number(api.settings.get("presenceType")));
    if (idx < 0) idx = 0;
    let lastRotate = 0;
    let lastLastfm = 0;
    let intervalId = null;
    let gatewayWs = null;
    let stopped = false;
    let lastGatewayToast = 0;
    let lastFmErrorToast = 0;
    let fmTrackKey = "";
    let fmTrackStart = 0;
    let fmActive = false;
    let tickBusy = false;
    let lastSentSig = "";
    let lastFmActivity = null;
    let lastFmSent = 0;
    const imageCache = new Map();

    const toast = (msg, type) => {
      try {
        api.ui.toast(msg, { type: type || "info", duration: 3500 });
      } catch (e) {}
    };

    const toastGatewayError = () => {
      const now = Date.now();
      if (now - lastGatewayToast < 30000) return;
      lastGatewayToast = now;
      toast("Gateway not ready", "error");
    };

    const toastLastfmError = (msg) => {
      const now = Date.now();
      if (now - lastFmErrorToast < 30000) return;
      lastFmErrorToast = now;
      toast(msg, "error");
    };

    const getToken = () => {
      try {
        if (typeof localStorage !== "undefined") {
          const t = localStorage.getItem("ec.token") || localStorage.getItem("token") || localStorage.getItem("nexa.token") || "";
          if (t) return t;
        }
      } catch (e) {}
      try {
        const w = window;
        const paths = [
          w.ec && w.ec.token,
          w.ec && w.ec.auth && w.ec.auth.token,
          w.__EC__ && w.__EC__.token,
          w.nexa && w.nexa.token,
          w.store && w.store.token,
        ];
        for (const p of paths) {
          if (typeof p === "string" && p) return p;
        }
      } catch (e) {}
      return "";
    };

    const looksLikeGateway = (ws, url, outgoingData) => {
      try {
        if (!ws) return false;
        const u = String(url || ws.url || "");
        if (u.indexOf("/gateway") !== -1) return true;
        if (typeof outgoingData === "string") {
          if (outgoingData.indexOf('"op":"identify"') !== -1) return true;
          if (outgoingData.indexOf('"op":"heartbeat"') !== -1) return true;
          if (outgoingData.indexOf('"op":"activities"') !== -1) return true;
          if (outgoingData.indexOf('"op":"resume"') !== -1) return true;
          if (outgoingData.indexOf('"op":"voice_state"') !== -1) return true;
        }
      } catch (e) {}
      return false;
    };

    const captureGateway = (ws, url, outgoingData) => {
      try {
        if (!ws || stopped) return;
        if (looksLikeGateway(ws, url, outgoingData)) {
          gatewayWs = ws;
        }
      } catch (e) {}
    };

    const hookGateway = () => {
      try {
        if (window.__NEXA_GATEWAY__ && window.__NEXA_GATEWAY__.readyState === 1) gatewayWs = window.__NEXA_GATEWAY__;
        if (window.ec && window.ec.gateway && window.ec.gateway.ws && window.ec.gateway.ws.readyState === 1) gatewayWs = window.ec.gateway.ws;
        if (window.ec && window.ec.ws && window.ec.ws.readyState === 1) gatewayWs = window.ec.ws;
      } catch (e) {}

      if (!window.__rpcPresenceSendHookedV4) {
        window.__rpcPresenceSendHookedV4 = true;
        const origSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function (...args) {
          try {
            captureGateway(this, this.url, args[0]);
            if ((!gatewayWs || gatewayWs.readyState !== 1) && this.readyState === 1 && looksLikeGateway(this, this.url, args[0])) {
              gatewayWs = this;
            }
          } catch (e) {}
          return origSend.apply(this, args);
        };
      }

      if (!window.__rpcPresenceCtorHookedV4) {
        window.__rpcPresenceCtorHookedV4 = true;
        const OrigWebSocket = window.WebSocket;
        const Wrapped = function (url, protocols) {
          const ws = protocols ? new OrigWebSocket(url, protocols) : new OrigWebSocket(url);
          try {
            captureGateway(ws, url, null);
            ws.addEventListener("open", () => captureGateway(ws, url, null));
          } catch (e) {}
          return ws;
        };
        Wrapped.prototype = OrigWebSocket.prototype;
        try { Object.setPrototypeOf(Wrapped, OrigWebSocket); } catch (e) {}
        try { window.WebSocket = Wrapped; } catch (e) {}
      }
    };

    const sendActivities = (activities) => {
      const ws = gatewayWs;
      if (!ws || ws.readyState !== 1) return false;
      try {
        ws.send(JSON.stringify({ op: "activities", d: { activities: Array.isArray(activities) ? activities : [] } }));
        return true;
      } catch (e) {
        return false;
      }
    };

    const setPresenceRest = async (activity) => {
      const token = getToken();
      const makeHeaders = (auth) => {
        const h = { "Content-Type": "application/json" };
        if (auth && token) h.Authorization = auth + token;
        return h;
      };
      const bodies = [
        { url: "/api/v1/users/@me", method: "PATCH", body: { activities: [activity] }, auth: "Bearer " },
        { url: "/api/v1/users/@me", method: "PATCH", body: { activities: [activity] }, auth: "" },
        { url: "/api/v1/users/@me/presence", method: "PUT", body: { activities: [activity] }, auth: "Bearer " },
        { url: "/api/v1/users/@me/presence", method: "PUT", body: { activities: [activity] }, auth: "" },
        { url: "/api/v1/users/@me/settings", method: "PATCH", body: { activities: [activity] }, auth: "Bearer " },
        { url: "/api/v1/users/@me", method: "PATCH", body: { activity: activity }, auth: "Bearer " },
      ];
      for (const attempt of bodies) {
        try {
          const res = await fetch(attempt.url, {
            method: attempt.method,
            headers: makeHeaders(attempt.auth),
            credentials: "include",
            body: JSON.stringify(attempt.body),
          });
          if (res.ok) return true;
        } catch (e) {}
      }
      return false;
    };

    const getSettings = () => ({
      presenceType: Number(api.settings.get("presenceType")) || 0,
      presenceName: String(api.settings.get("presenceName") || ""),
      presenceDetails: String(api.settings.get("presenceDetails") || "").trim(),
      presenceState: String(api.settings.get("presenceState") || "").trim(),
      presenceImage: String(api.settings.get("presenceImage") || "").trim(),
      rotationSpeed: Number(api.settings.get("rotationSpeed")) || 1,
      enableAutoRotate: api.settings.get("enableAutoRotate") !== false,
      rotationInterval: Number(api.settings.get("rotationInterval")) || 0,
      lastfmEnabled: api.settings.get("lastfmEnabled") === true,
      lastfmUsername: String(api.settings.get("lastfmUsername") || "").trim(),
      lastfmApiKey: String(api.settings.get("lastfmApiKey") || "").trim(),
      lastfmInterval: Math.max(5000, Number(api.settings.get("lastfmInterval")) || 15000),
      lastfmFallbackRotation: api.settings.get("lastfmFallbackRotation") !== false,
    });

    const getIntervalMs = (s) => {
      if (s.rotationInterval > 0) return s.rotationInterval;
      return speedIntervals[s.rotationSpeed] || 300000;
    };

    const tryResolveExternalAsset = async (raw) => {
      const token = getToken();
      if (!token) return "";
      const headers = { "Content-Type": "application/json", Authorization: "Bearer " + token };
      const attempts = [
        { url: "/api/v1/users/@me/external-assets", body: { urls: [raw] } },
        { url: "/api/v1/external-assets", body: { urls: [raw] } },
        { url: "/api/v1/media/proxy", body: { url: raw } },
        { url: "/api/v1/proxy", body: { url: raw } },
      ];
      for (const attempt of attempts) {
        try {
          const res = await fetch(attempt.url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(attempt.body),
          });
          if (!res.ok) continue;
          const data = await res.json().catch(() => null);
          if (!data) continue;
          const candidates = [];
          if (Array.isArray(data)) candidates.push(...data);
          if (data && Array.isArray(data.assets)) candidates.push(...data.assets);
          if (data && data.external_asset_path) candidates.push(data.external_asset_path);
          if (data && data.external_asset) candidates.push(data.external_asset);
          if (data && data.asset) candidates.push(data.asset);
          if (data && data.path) candidates.push(data.path);
          if (data && data.key) candidates.push(data.key);
          for (const c of candidates) {
            let v = "";
            if (typeof c === "string") v = c;
            else if (c && typeof c.external_asset_path === "string") v = c.external_asset_path;
            else if (c && typeof c.asset === "string") v = c.asset;
            else if (c && typeof c.path === "string") v = c.path;
            else if (c && typeof c.key === "string") v = c.key;
            v = String(v || "").trim();
            if (v.indexOf("mp:") === 0) return v;
          }
        } catch (e) {}
      }
      return "";
    };

    const normalizeImage = async (img) => {
      const value = String(img || "").trim();
      if (!value) return "";
      if (value.indexOf("mp:") === 0) return value;
      if (value.indexOf("https://cdn.discordapp.com/") === 0) return value;
      if (/^https?:\/\//i.test(value)) {
        if (imageCache.has(value)) return imageCache.get(value);
        const resolved = await tryResolveExternalAsset(value);
        if (resolved && resolved.indexOf("mp:") === 0) {
          imageCache.set(value, resolved);
          return resolved;
        }
        imageCache.set(value, value);
        return value;
      }
      return value;
    };

    const applyImage = async (activity, img) => {
      const value = await normalizeImage(img);
      if (!value) return;
      if (!activity.assets) activity.assets = {};
      activity.assets.large_image = value;
    };

    const buildRotationActivity = async () => {
      const s = getSettings();
      const i = ((idx % rpcTypes.length) + rpcTypes.length) % rpcTypes.length;
      const type = rpcTypes[i];
      const name = s.presenceName.trim() || rpcTypeNames[i];
      const activity = { name: name, type: type };
      if (s.presenceDetails) activity.details = s.presenceDetails;
      if (s.presenceState) activity.state = s.presenceState;
      await applyImage(activity, s.presenceImage);
      return activity;
    };

    const pickLastfmImage = (track) => {
      try {
        const images = Array.isArray(track && track.image) ? track.image : [];
        const isPlaceholder = (url) => !url || url.indexOf("2a96cbd8b46e442fc41c2b86b821562f") !== -1 || /\/noimage\//i.test(url) || /default_album/i.test(url);
        const textOf = (img) => (img && typeof img["#text"] === "string" ? img["#text"].trim() : (img && typeof img.url === "string" ? img.url.trim() : ""));
        const order = ["mega", "extralarge", "large", "medium", "small"];
        for (const size of order) {
          for (const img of images) {
            if (String((img && img.size) || "").trim() !== size) continue;
            const url = textOf(img);
            if (url && !isPlaceholder(url)) return url;
          }
        }
        for (const img of images) {
          const url = textOf(img);
          if (url && !isPlaceholder(url)) return url;
        }
      } catch (e) {}
      return "";
    };

    const parseText = (v) => {
      if (typeof v === "string") return v;
      if (v && typeof v === "object") {
        if (typeof v["#text"] === "string") return v["#text"];
        if (typeof v.name === "string") return v.name;
        if (typeof v.title === "string") return v.title;
      }
      return "";
    };

    const cleanField = (v) => {
      let x = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
      if (x.length > 2 && x.length % 2 === 0) {
        const a = x.slice(0, x.length / 2).trim();
        const b = x.slice(x.length / 2).trim();
        if (a && a.toLowerCase() === b.toLowerCase()) x = a;
      }
      if (x.length > 3 && x.length % 2 === 1) {
        const mid = Math.floor(x.length / 2);
        if (x[mid] === " " || x[mid] === "-") {
          const a = x.slice(0, mid).trim();
          const b = x.slice(mid + 1).trim();
          if (a && a.toLowerCase() === b.toLowerCase()) x = a;
        }
      }
      return x;
    };

    const fetchLastfmTrack = async (s) => {
      const url = "https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=" +
        encodeURIComponent(s.lastfmUsername) +
        "&api_key=" + encodeURIComponent(s.lastfmApiKey) +
        "&format=json&limit=1&extended=0&_=" + Date.now();
      const res = await fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data && data.error) throw new Error(String(data.message || data.error));
      const recent = data && data.recenttracks ? data.recenttracks.track : null;
      return Array.isArray(recent) ? (recent[0] || null) : (recent || null);
    };

    const buildLastfmActivity = async (s) => {
      if (!s.lastfmEnabled || !s.lastfmUsername || !s.lastfmApiKey) return { kind: "disabled" };
      const track = await fetchLastfmTrack(s);
      if (!track) return { kind: "none" };
      const attr = (track["@attr"] && typeof track["@attr"] === "object") ? track["@attr"] : null;
      const nowRaw = attr ? (attr.nowplaying != null ? attr.nowplaying : attr.nowPlaying) : null;
      const nowPlaying = nowRaw === true || nowRaw === "true" || String(nowRaw || "").toLowerCase() === "true" || nowRaw === 1 || nowRaw === "1";
      const trackName = cleanField(parseText(track.name));
      const artistName = cleanField(parseText(track.artist));
      const albumName = cleanField(parseText(track.album));
      if (!trackName) return { kind: "none" };
      if (!nowPlaying) {
        return { kind: "not_playing", trackName, artistName, albumName, track };
      }
      const sameAsTrack = !!(albumName && trackName && albumName.toLowerCase() === trackName.toLowerCase());
      const artistClean = artistName.replace(/^(by\s+)+/i, "").trim();
      let stateText = "";
      if (artistClean && albumName && !sameAsTrack) stateText = "by " + artistClean + " on " + albumName;
      else if (artistClean) stateText = "by " + artistClean;
      else if (albumName && !sameAsTrack) stateText = "on " + albumName;
      const activity = {
        name: "Last.fm",
        type: 2,
        details: trackName,
        state: stateText,
      };
      const key = artistClean.toLowerCase() + "\u0000" + trackName.toLowerCase();
      if (key !== fmTrackKey || !fmTrackStart) {
        fmTrackKey = key;
        fmTrackStart = Date.now();
      }
      activity.timestamps = { start: Math.floor(fmTrackStart / 1000) };
      const cover = pickLastfmImage(track) || s.presenceImage || "";
      if (cover) {
        await applyImage(activity, cover);
        if (albumName && !sameAsTrack) {
          if (!activity.assets) activity.assets = {};
          activity.assets.large_text = albumName;
        }
      }
      return { kind: "playing", activity, trackName, artistName: artistClean, albumName };
    };

    const setPresenceViaApi = async (activity) => {
      try {
        if (api && api.users && typeof api.users.setActivity === "function") {
          await api.users.setActivity(activity);
          return true;
        }
      } catch (e) {}
      try {
        if (api && api.users && typeof api.users.setActivities === "function") {
          await api.users.setActivities([activity]);
          return true;
        }
      } catch (e) {}
      try {
        if (api && api.presence && typeof api.presence.set === "function") {
          await api.presence.set({ activities: [activity] });
          return true;
        }
      } catch (e) {}
      try {
        if (api && api.gateway && typeof api.gateway.send === "function") {
          api.gateway.send({ op: "activities", d: { activities: [activity] } });
          return true;
        }
      } catch (e) {}
      return false;
    };

    const activitySig = (activity) => {
      try {
        const li = activity && activity.assets && activity.assets.large_image ? activity.assets.large_image : "";
        const ts = activity && activity.timestamps && activity.timestamps.start ? activity.timestamps.start : "";
        return [activity && activity.name, activity && activity.type, activity && activity.details, activity && activity.state, li, ts].join("\u0001");
      } catch (e) {
        return "";
      }
    };

    const setPresence = async (activity, force) => {
      if (stopped) return false;
      hookGateway();
      const sig = activitySig(activity);
      if (!force && sig && sig === lastSentSig) return true;
      let ok = false;
      if (sendActivities([activity])) ok = true;
      else if (await setPresenceViaApi(activity)) ok = true;
      else if (await setPresenceRest(activity)) ok = true;
      if (ok) {
        if (sig) lastSentSig = sig;
        return true;
      }
      lastSentSig = "";
      return false;
    };

    const pushRotation = async () => {
      const activity = await buildRotationActivity();
      if (await setPresence(activity, true)) {
        idx = (idx + 1) % rpcTypes.length;
        lastRotate = Date.now();
      }
    };

    const tick = async () => {
      if (stopped || tickBusy) return;
      tickBusy = true;
      try {
        const s = getSettings();
        const now = Date.now();

        if (!s.lastfmEnabled || !s.lastfmUsername || !s.lastfmApiKey) {
          if (fmActive) {
            fmActive = false;
            fmTrackKey = "";
            fmTrackStart = 0;
            lastFmActivity = null;
            lastFmSent = 0;
            lastSentSig = "";
            lastRotate = 0;
          }
          if (!s.enableAutoRotate) return;
          if (lastRotate === 0 || now - lastRotate >= getIntervalMs(s)) {
            await pushRotation();
          }
          return;
        }

        if (lastLastfm === 0 || now - lastLastfm >= s.lastfmInterval) {
          lastLastfm = now;
          let result = null;
          try {
            result = await buildLastfmActivity(s);
          } catch (e) {
            fmActive = false;
            fmTrackKey = "";
            fmTrackStart = 0;
            lastFmActivity = null;
            lastFmSent = 0;
            lastSentSig = "";
            toastLastfmError("Last.fm: " + (e && e.message ? e.message : String(e)));
            if (s.lastfmFallbackRotation && s.enableAutoRotate) {
              lastRotate = 0;
              await pushRotation();
            }
            return;
          }
          if (result && result.kind === "playing" && result.activity) {
            fmActive = true;
            lastFmActivity = result.activity;
            await setPresence(result.activity, true);
            lastFmSent = now;
            lastRotate = now;
            return;
          }
          if (result && result.kind === "not_playing") {
            fmActive = false;
            fmTrackKey = "";
            fmTrackStart = 0;
            lastFmActivity = null;
            lastFmSent = 0;
            lastSentSig = "";
            if (s.lastfmFallbackRotation) {
              lastRotate = 0;
              if (s.enableAutoRotate) {
                await pushRotation();
              }
              return;
            }
            const sameAsTrack = !!(result.albumName && result.trackName && result.albumName.toLowerCase() === result.trackName.toLowerCase());
            const artistClean = String(result.artistName || "").replace(/^(by\s+)+/i, "").trim();
            let lastState = "";
            if (artistClean && result.albumName && !sameAsTrack) lastState = "by " + artistClean + " on " + result.albumName;
            else if (artistClean) lastState = "by " + artistClean;
            else if (result.albumName && !sameAsTrack) lastState = "on " + result.albumName;
            const lastActivity = { name: "Last.fm", type: 2, details: result.trackName, state: lastState };
            const cover = pickLastfmImage(result.track) || s.presenceImage || "";
            if (cover) {
              await applyImage(lastActivity, cover);
              if (result.albumName && !sameAsTrack) {
                if (!lastActivity.assets) lastActivity.assets = {};
                lastActivity.assets.large_text = result.albumName;
              }
            }
            await setPresence(lastActivity, true);
            lastRotate = now;
            return;
          }
          fmActive = false;
          fmTrackKey = "";
          fmTrackStart = 0;
          lastFmActivity = null;
          lastFmSent = 0;
          lastSentSig = "";
          if (s.lastfmFallbackRotation && s.enableAutoRotate) {
            lastRotate = 0;
            await pushRotation();
          }
          return;
        }

        if (fmActive) {
          if (lastFmActivity && now - lastFmSent >= 20000) {
            await setPresence(lastFmActivity, true);
            lastFmSent = now;
          }
          return;
        }
        if (!s.lastfmFallbackRotation) return;
        if (!s.enableAutoRotate) return;
        if (lastRotate === 0 || now - lastRotate >= getIntervalMs(s)) {
          await pushRotation();
        }
      } finally {
        tickBusy = false;
      }
    };

    hookGateway();
    intervalId = setInterval(() => {
      tick().catch(() => {});
    }, 1000);
    setTimeout(() => { hookGateway(); tick().catch(() => {}); }, 1500);
    setTimeout(() => { hookGateway(); tick().catch(() => {}); }, 5000);
    tick().catch(() => {});

    const state = {
      stop: () => {
        stopped = true;
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
      },
    };
    window.__rpcPresenceActive = state;
    this.__rpcPresenceState = state;
  },

  stop() {
    try {
      const s = (this && this.__rpcPresenceState) || (typeof window !== "undefined" ? window.__rpcPresenceActive : null);
      if (s && s.stop) s.stop();
    } catch (e) {}
  },
};
