// nexa presence hub - keeps accounts online from this machine instead of the browser.
// the app caps one browser profile at about 255 websockets, so a long list cannot all
// fit in one page. this holds the sockets outside the browser and answers the stay
// online plugin over a local wss:// so the browser only needs its own one connection.
//
// run:  node nexa-hub.mjs
// the plugin finds wss://localhost:8787 on its own.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import https from "node:https";

const VERSION = "1.0.0";
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const PORT = Number(process.env.NEXA_HUB_PORT || 8787);
const HOST = process.env.NEXA_HUB_HOST || "nexa.pm";
const GATEWAY = process.env.NEXA_HUB_GATEWAY || `wss://${HOST}/gateway`;
const PACE = Number(process.env.NEXA_HUB_PACE || 450);
const HB = Number(process.env.NEXA_HUB_HEARTBEAT || 25000);
const ACK = Number(process.env.NEXA_HUB_ACK || 90000);
const MAX_FRAME = 4096;

const CONF_DIR = join(homedir(), ".config", "nexa-hub");
const CERT = join(CONF_DIR, "cert.pem");
const KEY = join(CONF_DIR, "key.pem");

const t0 = Date.now();
let lastEvent = null;

function log(...args) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);
}

function note(id, kind, detail) {
  lastEvent = { id, kind, detail: String(detail || "").slice(0, 120), at: Date.now() };
}

// --- local certificate -----------------------------------------------------

function ensureCert() {
  if (existsSync(CERT) && existsSync(KEY)) return { cert: readFileSync(CERT), key: readFileSync(KEY) };
  mkdirSync(CONF_DIR, { recursive: true });
  try {
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", "3650", "-nodes",
      "-keyout", KEY, "-out", CERT, "-subj", "/CN=localhost",
      "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1",
    ], { stdio: "ignore" });
  } catch (e) {
    console.error(`nexa-hub: could not create a local certificate with openssl (${e.message}).`);
    console.error(`nexa-hub: install openssl, or put cert.pem and key.pem for localhost in ${CONF_DIR}.`);
    process.exit(1);
  }
  log(`created a local certificate in ${CONF_DIR}`);
  return { cert: readFileSync(CERT), key: readFileSync(KEY) };
}

// --- websocket framing -----------------------------------------------------

function frame(opcode, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), "utf8");
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x80 | opcode, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  return Buffer.concat([header, data]);
}

function attach(socket, onText, onClose) {
  const conn = { socket, buffer: Buffer.alloc(0), open: true };
  const kill = () => {
    if (!conn.open) return;
    conn.open = false;
    if (onClose) onClose();
  };
  socket.on("close", kill);
  socket.on("error", kill);
  socket.on("data", (chunk) => {
    conn.buffer = Buffer.concat([conn.buffer, chunk]);
    for (;;) {
      const b = conn.buffer;
      if (b.length < 2) return;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        len = Number(b.readBigUInt64BE(2));
        off = 10;
      }
      const ml = masked ? 4 : 0;
      if (b.length < off + ml + len) return;
      const mask = masked ? b.subarray(off, off + 4) : null;
      const payload = Buffer.from(b.subarray(off + ml, off + ml + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      conn.buffer = b.subarray(off + ml + len);
      if (opcode === 0x8) {
        try { socket.end(); } catch {}
        kill();
        return;
      }
      if (opcode === 0x9) {
        try { socket.write(frame(0xa, payload)); } catch {}
        continue;
      }
      if (opcode === 0x1) {
        let msg = null;
        try { msg = JSON.parse(payload.toString("utf8")); } catch {}
        if (msg) onText(msg);
      }
    }
  });
  return conn;
}

function accept(req) {
  const key = req.headers["sec-websocket-key"];
  if (!key) return false;
  const digest = createHash("sha1").update(key + WS_GUID).digest("base64");
  req.socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${digest}\r\n\r\n`,
  );
  return true;
}

// --- account sockets -------------------------------------------------------

const accounts = new Map();
let on = false;
let current = null;
let opening = false;
let opener = null;

function delay0(tries) {
  return Math.min(30000, 2000 * 2 ** Math.min(tries, 6)) + Math.floor(Math.random() * 1000);
}

class Account {
  constructor(id, token, name) {
    this.id = id;
    this.token = token;
    this.name = name || id;
    this.ws = null;
    this.state = "wait";
    this.err = "";
    this.tries = 0;
    this.crowded = 0;
    this.pending = false;
    this.sentAt = 0;
    this.hbTimer = null;
    this.retryTimer = null;
    this.handshake = null;
    this.dead = false;
    this.gone = false;
    this.skipped = false;
  }

  open() {
    if (this.gone || this.dead || this.skipped || !on || this.ws) return;
    this.clear();
    let ws;
    try {
      ws = new WebSocket(GATEWAY);
    } catch (e) {
      this.wait(2000, (e && e.message) || "connect failed");
      return;
    }
    this.ws = ws;
    this.state = "conn";
    this.sentAt = 0;
    this.handshake = setTimeout(() => {
      if (this.ws === ws && this.state === "conn") {
        note(this.id, "timeout", "no handshake in 15s");
        try { ws.close(); } catch {}
      }
    }, 15000);

    ws.addEventListener("open", () => {
      if (this.ws !== ws) return;
      clearTimeout(this.handshake);
      this.handshake = null;
      this.state = "on";
      this.err = "";
      this.tries = 0;
      this.crowded = 0;
      try { ws.send(JSON.stringify({ op: "identify", d: { token: this.token } })); } catch {}
      this.startHeartbeat();
      push();
    });

    ws.addEventListener("message", (ev) => {
      if (this.ws !== ws) return;
      const raw = ev && ev.data;
      if (typeof raw !== "string" || raw.length > MAX_FRAME) return;
      if (raw.indexOf("heartbeat_ack") >= 0) {
        this.pending = false;
        return;
      }
      if (raw.indexOf("session_expired") >= 0) this.dead = true;
    });

    ws.addEventListener("close", (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.handshake) clearTimeout(this.handshake);
      this.handshake = null;
      this.stopHeartbeat();
      const code = ev && ev.code;
      const reason = (ev && ev.reason) || "";
      this.state = "wait";
      if (code === 4001 || /session expired|authentication failed/i.test(reason)) {
        this.dead = true;
        this.err = "session expired";
        note(this.id, "dead", "session expired");
        push();
        return;
      }
      let delay;
      if (code === 4009) {
        delay = Math.min(300000, 30000 * 2 ** this.crowded) + Math.floor(Math.random() * 5000);
        this.crowded += 1;
        this.err = "gateway is crowded";
      } else if (code === 4008) {
        delay = Math.max(5000, delay0(this.tries));
        this.err = "rate limited";
      } else {
        delay = delay0(this.tries);
        this.err = reason ? `closed ${code} ${reason}` : `closed ${code}`;
      }
      note(this.id, "close", `${code} ${reason}`);
      this.wait(delay);
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.hbTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== 1 || this.gone || !on) return;
      if (this.pending && Date.now() - this.sentAt > ACK) {
        note(this.id, "timeout", "no heartbeat ack in 90s");
        try { ws.close(); } catch {}
        return;
      }
      if (this.pending) return;
      try { ws.send(JSON.stringify({ op: "heartbeat" })); } catch {}
      this.pending = true;
      this.sentAt = Date.now();
    }, HB);
  }

  stopHeartbeat() {
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.hbTimer = null;
    this.pending = false;
    this.sentAt = 0;
  }

  clear() {
    this.stopHeartbeat();
    if (this.handshake) clearTimeout(this.handshake);
    this.handshake = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  wait(ms, why) {
    if (this.gone) return;
    this.tries += 1;
    if (why && !this.err) this.err = why;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, ms);
  }

  close() {
    this.gone = true;
    this.clear();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try { ws.close(1000, "hub idle"); } catch {}
    }
    this.state = "wait";
  }
}

function counts() {
  let online = 0, connecting = 0, waiting = 0, dead = 0, held = 0;
  for (const a of accounts.values()) {
    if (a.gone || a.skipped) continue;
    held += 1;
    if (a.dead) dead += 1;
    else if (a.state === "on") online += 1;
    else if (a.state === "conn") connecting += 1;
    else waiting += 1;
  }
  return { total: held, online, connecting, waiting, dead };
}

function pump() {
  if (opening) return;
  opening = true;
  const step = () => {
    opening = false;
    if (!on) return;
    for (const a of accounts.values()) {
      if (!a.gone && !a.dead && !a.skipped && a.state === "wait" && !a.ws && !a.retryTimer) {
        a.open();
        opening = true;
        opener = setTimeout(step, PACE);
        return;
      }
    }
    opener = null;
  };
  step();
}

function drop(id) {
  const acc = accounts.get(id);
  if (!acc) return;
  acc.close();
  accounts.delete(id);
}

function applyRoster(list) {
  const want = new Map();
  for (const row of list) {
    if (!row || typeof row.id !== "string" || typeof row.token !== "string" || !row.token) continue;
    want.set(row.id, row);
  }

  for (const [id, acc] of [...accounts]) {
    const next = want.get(id);
    if (next && next.token === acc.token) {
      acc.name = next.name || acc.name;
      continue;
    }
    drop(id);
  }
  for (const [id, row] of want) {
    if (accounts.has(id)) continue;
    accounts.set(id, new Account(id, row.token, row.name));
  }

  // whoever is signed in is already held by the browser, two sessions on one
  // token would kick each other out
  for (const [id, acc] of accounts) {
    const skip = id === current;
    if (skip && !acc.skipped) {
      acc.close();
      acc.skipped = true;
      accounts.set(id, acc);
    } else if (!skip && acc.skipped) {
      const fresh = new Account(id, acc.token, acc.name);
      accounts.set(id, fresh);
    }
  }

  pump();
  push();
}

function stopAll() {
  if (opener) clearTimeout(opener);
  opener = null;
  opening = false;
  for (const a of accounts.values()) a.close();
}

// --- control connection ----------------------------------------------------

const clients = new Set();

function send(client, msg) {
  if (!client.open) return;
  try {
    client.socket.write(frame(0x1, JSON.stringify(msg)));
  } catch {}
}

function status() {
  const c = counts();
  return {
    op: "status",
    on,
    host: HOST,
    version: VERSION,
    uptime: Math.round((Date.now() - t0) / 1000),
    signedIn: current,
    total: c.total,
    online: c.online,
    connecting: c.connecting,
    waiting: c.waiting,
    dead: c.dead,
    last: lastEvent,
  };
}

let pushAt = 0;
let pushTimer = null;

function push() {
  if (pushTimer) return;
  const wait = Math.max(0, 200 - (Date.now() - pushAt));
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushAt = Date.now();
    const msg = status();
    for (const client of clients) send(client, msg);
  }, wait);
}

function handle(msg, client) {
  if (!msg || typeof msg.op !== "string") return;
  if (msg.op === "ping") {
    send(client, { op: "pong", at: Date.now() });
    return;
  }
  if (msg.op === "off") {
    on = false;
    current = null;
    stopAll();
    log("presence off");
    push();
    return;
  }
  if (msg.op !== "sync") return;
  const list = Array.isArray(msg.accounts) ? msg.accounts : [];
  on = true;
  current = typeof msg.current === "string" && msg.current ? msg.current : null;
  log(`sync: ${list.length} accounts, signed in as ${current || "unknown"}`);
  applyRoster(list);
}

// --- server ----------------------------------------------------------------

const { cert, key } = ensureCert();

const server = https.createServer({ cert, key }, (req, res) => {
  if (req.url === "/" || req.url === "/status") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(status(), null, 2));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("nexa hub\n");
});

server.on("upgrade", (req, socket) => {
  if (!accept(req)) {
    socket.destroy();
    return;
  }
  const client = { socket, open: true };
  attach(socket, (msg) => handle(msg, client), () => clients.delete(client));
  clients.add(client);
  log(`plugin connected from ${req.socket.remoteAddress}`);
  send(client, { op: "hello", v: 1, hub: "nexa-hub", version: VERSION, pid: process.pid });
  send(client, status());
});

server.on("listening", () => {
  log(`nexa hub ${VERSION} listening on wss://localhost:${PORT}`);
  log(`gateway ${GATEWAY}`);
  log(`status page: https://localhost:${PORT}/status`);
  log(`if helium warns about the certificate for localhost, add --allow-insecure-localhost to ~/.config/helium-browser-flags.conf`);
});

let fellBack = false;
server.on("error", (e) => {
  if (!fellBack && (e.code === "EAFNOSUPPORT" || e.code === "EADDRNOTAVAIL")) {
    fellBack = true;
    server.listen(PORT, "127.0.0.1");
    return;
  }
  if (e.code === "EADDRINUSE") {
    console.error(`nexa-hub: port ${PORT} is already in use, another hub is probably running.`);
    process.exit(1);
  }
  console.error("nexa-hub:", e.message);
});

server.listen(PORT, "::");

setInterval(() => {
  if (on) pump();
}, 5000);

process.on("SIGINT", () => {
  log("shutting down");
  stopAll();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});
