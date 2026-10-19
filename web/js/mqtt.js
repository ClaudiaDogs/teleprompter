// Client MQTT 3.1.1 minimo su WebSocket: connessione, iscrizione e pubblicazione (QoS 0),
// con ping e riconnessione automatica. Basta per far passare i messaggi da un broker pubblico.

const enc = new TextEncoder();

function remainingLength(n) {
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}

function str(s) {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 255, ...b];
}

function packet(type, body) {
  const out = new Uint8Array(1 + remainingLength(body.length).length + body.length);
  const rl = remainingLength(body.length);
  out[0] = type;
  out.set(rl, 1);
  out.set(body, 1 + rl.length);
  return out;
}

export class MqttWs {
  constructor(url, { onMessage, onState }) {
    this.url = url;
    this.onMessage = onMessage;
    this.onState = onState;
    this.topics = new Set();
    this.up = false;
    this.closed = false;
    this.packetId = 1;
    this.retryMs = 1000;
    this.buf = new Uint8Array(0);
  }

  connect() {
    this.closed = false;
    clearTimeout(this.retryTimer);
    let ws;
    try { ws = this.ws = new WebSocket(this.url, ['mqtt']); }
    catch { this.scheduleRetry(); return; }
    ws.binaryType = 'arraybuffer';
    this.connectTimer = setTimeout(() => { if (!this.up) try { ws.close(); } catch {} }, 8000);
    ws.onopen = () => {
      const id = 'sdtp' + Math.random().toString(36).slice(2, 14);
      const body = [...str('MQTT'), 4, 0x02, 0, 60, ...str(id)]; // sessione pulita, keepalive 60 s
      ws.send(packet(0x10, body));
    };
    ws.onmessage = e => this.receive(new Uint8Array(e.data));
    ws.onclose = ws.onerror = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      clearTimeout(this.connectTimer);
      clearInterval(this.pingTimer);
      this.up = false;
      this.onState?.(this);
      if (!this.closed) this.scheduleRetry();
    };
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
    this.retryMs = Math.min(10000, this.retryMs * 2);
  }

  // Un frame WebSocket può contenere mezzo pacchetto o più pacchetti.
  receive(data) {
    const b = new Uint8Array(this.buf.length + data.length);
    b.set(this.buf);
    b.set(data, this.buf.length);
    let pos = 0;
    while (b.length - pos >= 2) {
      let len = 0, mul = 1, i = pos + 1, byte;
      do {
        if (i >= b.length) { this.buf = b.slice(pos); return; }
        byte = b[i++];
        len += (byte & 127) * mul;
        mul *= 128;
      } while (byte & 128);
      if (b.length - i < len) break;
      this.handle(b[pos], b.subarray(i, i + len));
      pos = i + len;
    }
    this.buf = b.slice(pos);
  }

  handle(head, body) {
    const type = head >> 4;
    if (type === 2) { // CONNACK
      if (body[1] !== 0) { try { this.ws.close(); } catch {} return; }
      clearTimeout(this.connectTimer);
      this.up = true;
      this.retryMs = 1000;
      for (const t of this.topics) this.sendSubscribe(t);
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.raw(new Uint8Array([0xC0, 0])), 25000);
      this.onState?.(this);
    } else if (type === 3) { // PUBLISH
      const tl = (body[0] << 8) | body[1];
      const qos = (head >> 1) & 3;
      const start = 2 + tl + (qos ? 2 : 0);
      this.onMessage?.(new TextDecoder().decode(body.subarray(2, 2 + tl)), body.slice(start));
    }
    // SUBACK e PINGRESP non richiedono nulla
  }

  raw(bytes) {
    if (this.ws?.readyState === 1) { try { this.ws.send(bytes); return true; } catch {} }
    return false;
  }

  sendSubscribe(topic) {
    const id = this.packetId = (this.packetId % 65535) + 1;
    this.raw(packet(0x82, [id >> 8, id & 255, ...str(topic), 0]));
  }

  subscribe(topic) {
    this.topics.add(topic);
    if (this.up) this.sendSubscribe(topic);
  }

  publish(topic, payload) {
    if (!this.up) return false;
    const t = str(topic);
    const body = new Uint8Array(t.length + payload.length);
    body.set(t);
    body.set(payload, t.length);
    return this.raw(packet(0x30, body));
  }

  close() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.connectTimer);
    clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    this.up = false;
    if (ws) { try { ws.send(new Uint8Array([0xE0, 0])); ws.close(); } catch {} }
  }
}
