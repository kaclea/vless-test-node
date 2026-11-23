// Minimal VLESS-over-WebSocket proxy (TCP only) + HTTP health check.
// Designed for Eurobase buildpacks (Node.js). Env vars:
//   PORT    - provided by the platform (listening port)
//   UUID    - VLESS client id (set in Eurobase dashboard, never committed)
//   WS_PATH - WebSocket path, e.g. /786f284a2aec5b78 (set in Eurobase dashboard)
const http = require('http');
const net = require('net');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT || '3000', 10);
const UUID = (process.env.UUID || '').toLowerCase();
const WS_PATH = process.env.WS_PATH || '/';

if (!UUID || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(UUID)) {
  console.error('UUID env var missing or not a valid UUID; set UUID to the VLESS client id.');
  process.exit(1);
}
const UUID_BIN = Buffer.from(UUID.replace(/-/g, ''), 'hex');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok\n');
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  let path;
  try {
    path = new URL(req.url, 'http://localhost').pathname;
  } catch {
    socket.destroy();
    return;
  }
  if (path !== WS_PATH) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  let remote = null;
  let headerParsed = false;

  ws.on('message', (data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (!headerParsed) {
      try {
        if (buf.length < 24) throw new Error('header too short');
        const version = buf[0];
        const id = buf.slice(1, 17);
        if (!id.equals(UUID_BIN)) {
          ws.close();
          return;
        }
        const addonLen = buf[17];
        let off = 18 + addonLen;
        const command = buf[off++];
        if (command !== 0x01) {
          ws.close(); // TCP only; UDP not implemented in this test build
          return;
        }
        const port = buf.readUInt16BE(off);
        off += 2;
        const atype = buf[off++];
        let host;
        if (atype === 0x01) {
          host = Array.from(buf.slice(off, off + 4)).join('.');
          off += 4;
        } else if (atype === 0x02) {
          const len = buf[off++];
          host = buf.slice(off, off + len).toString();
          off += len;
        } else if (atype === 0x03) {
          host = buf
            .slice(off, off + 16)
            .toString('hex')
            .replace(/(.{4})(?=.)/g, '$1:');
          off += 16;
        } else {
          ws.close();
          return;
        }
        const firstPayload = buf.slice(off);
        remote = net.connect(port, host, () => {
          // VLESS response header: version + zero-length addon
          ws.send(Buffer.from([version, 0x00]));
          if (firstPayload.length) remote.write(firstPayload);
        });
        remote.on('data', (chunk) => {
          if (ws.readyState === 1) ws.send(chunk);
        });
        remote.on('error', () => ws.close());
        remote.on('close', () => ws.close());
        headerParsed = true;
      } catch {
        ws.close();
      }
      return;
    }
    if (remote && !remote.destroyed) remote.write(buf);
  });

  ws.on('close', () => {
    if (remote) remote.destroy();
  });
  ws.on('error', () => {
    if (remote) remote.destroy();
  });
});

server.listen(PORT, () => console.log(`vless-ws listening on ${PORT}, path ${WS_PATH}`));
