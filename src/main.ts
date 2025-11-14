import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import { TextDecoder } from 'node:util';
import zlib from 'node:zlib';
import dgram from 'node:dgram';
import path from 'node:path';
import started from 'electron-squirrel-startup';

function u32LE(b0 : number, b1 : number, b2 : number, b3 : number) {
  const combined = b0.toString() + b1.toString() + b2.toString() + b3.toString()
  return parseInt(combined)
}

function i16LE(b0 : number, b1 : number) {
  const combined = b0.toString() + b1.toString()
  return parseInt(combined)
}

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let promptWindow: BrowserWindow | null = null;
let udpSocket: dgram.Socket | null = null;
let latestNodes: Array<{ globalId: number; latitude: number; longitude: number; altitude: number }> = [];

// Allow renderer to request the latest snapshot (safe IPC invoke)
ipcMain.handle('udp-request-latest', async () => {
  return latestNodes;
});

function setupUdpClient(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      udpSocket = dgram.createSocket('udp4');

      udpSocket.on('error', (err) => {
        console.error('[UDP] error:', err);
        reject(err);
      });

      
      udpSocket.on("message", (msg) => {
        // Convert msg → hex array for easier visual debugging
       
        const parsedMessage = Array.from(msg);   // <- correct

     
     //   console.log(parsedMessage)
    
        // HEADER
        const opcode = parsedMessage[1];
        if (opcode === 101) {
    
          const numMembers = parsedMessage[16];
          console.log("network members",numMembers)
          let offset = 20; // skip reserved[3]
    
          const members = [];
    
          for (let i = 0; i < numMembers; i++) {
            const m = {
                globalId: 0,
                latitude: 0,
                longitude: 0,
                altitude: 0,
                veIn: 0,
                veIe: 0,
                veIu: 0,
                trueHeading: 0,
                reserved: 0,
            };
    
            // opcode101A structure
            m.globalId = u32LE(parsedMessage[offset], parsedMessage[offset+1], parsedMessage[offset+2], parsedMessage[offset+3]);
            offset += 4;
    
            m.latitude =u32LE(parsedMessage[offset], parsedMessage[offset+1], parsedMessage[offset+2], parsedMessage[offset+3]);
            offset += 4;
    
            m.longitude = u32LE(parsedMessage[offset], parsedMessage[offset+1], parsedMessage[offset+2], parsedMessage[offset+3]);
            offset += 4;
    
            m.altitude = i16LE(parsedMessage[offset], parsedMessage[offset+1])
            offset += 2;
    
            m.veIn = i16LE(parsedMessage[offset], parsedMessage[offset+1])
            offset += 2;
    
            m.veIe = i16LE(parsedMessage[offset], parsedMessage[offset+1])
            offset += 2;
    
            m.veIu = i16LE(parsedMessage[offset], parsedMessage[offset+1])
            offset += 2;
    
            m.trueHeading = i16LE(parsedMessage[offset], parsedMessage[offset+1])
            offset += 2;
    
            m.reserved = i16LE(parsedMessage[offset], parsedMessage[offset+1])
            offset += 2;
    
            members.push(m);
          }
          // keep latest snapshot for any late renderer requests
          latestNodes = members;
          if (mainWindow) {
            mainWindow.webContents.send("data-from-main", members); 
          }
          
          console.log("network Members:", members);
        } else if (opcode === 104) {
          const numMembers = parsedMessage[16] * 10 + parsedMessage[17];
          console.log("enemies", numMembers)
          let offset = 20;
          const members = [];
    
          for (let i = 0; i < numMembers; i++) {
            const m = {
                globalId: 0,
                latitude: 0,
                longitude: 0,
                altitude: 0,
                heading : 0,
                groundSpeed : 0,
            };
    
            // opcode101A structure
            m.globalId = u32LE(parsedMessage[offset], parsedMessage[offset+1], parsedMessage[offset+2], parsedMessage[offset+3]);
            offset += 4;
    
            m.latitude = u32LE(parsedMessage[offset], parsedMessage[offset+1], parsedMessage[offset+2], parsedMessage[offset+3]);
            offset += 4;
    
            m.longitude =u32LE(parsedMessage[offset], parsedMessage[offset+1], parsedMessage[offset+2], parsedMessage[offset+3]);
            offset += 4;
    
            m.altitude = i16LE(parsedMessage[offset], parsedMessage[offset+1])
            offset += 2;
    
            m.heading = i16LE(parsedMessage[offset], parsedMessage[offset+1])
            offset += 2;
    
            m.groundSpeed = i16LE(parsedMessage[offset], parsedMessage[offset+1])
            offset += 2;
          
            members.push(m);
          }
            // keep latest snapshot for any late renderer requests
            latestNodes = members;
            if (mainWindow) {
              mainWindow.webContents.send("data-from-main", members); 
            }
          
          console.log("Decoded Members:", members);
        }
      });
    

      udpSocket.connect(port, host, () => {
        console.log(`[UDP] connected to ${host}:${port}`);
        try {
          udpSocket?.send(Buffer.from('hello'));
        } catch {}
        resolve();
      });
    } catch (e) {
      console.error('[UDP] setup failed:', e);
      reject(e);
    }
  });
}

function decodeBufferToText(buf: Buffer): string {
  // Detect BOM for UTF-16
  if (buf.length >= 2) {
    const bom = buf.readUInt16BE(0);
    if (bom === 0xfeff) {
      // UTF-16BE
      try {
        const dec = new TextDecoder('utf-16be', { fatal: false });
        return sanitizeText(dec.decode(buf.subarray(2)));
      } catch {}
    } else if (bom === 0xfffe) {
      // UTF-16LE
      try {
        const dec = new TextDecoder('utf-16le', { fatal: false });
        return sanitizeText(dec.decode(buf.subarray(2)));
      } catch {}
    }
  }

  // Default UTF-8
  try {
    const dec = new TextDecoder('utf-8', { fatal: false });
    return sanitizeText(dec.decode(buf));
  } catch {}

  // Fallback to latin1 for legacy encodings
  try {
    const dec = new TextDecoder('latin1', { fatal: false });
    return sanitizeText(dec.decode(buf));
  } catch {}

  // Fallback: hex preview
  return `0x${buf.toString('hex')}`;
}

function sanitizeText(s: string): string {
  // Remove nulls and non-printable except common whitespace
  return s
    .replace(/[\u0000]/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function maybeDecompress(buf: Buffer): Buffer {
  // GZIP magic number
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      return zlib.gunzipSync(buf);
    } catch {}
  }
  // zlib header often starts with 0x78 .. (various flags)
  if (buf.length > 2 && buf[0] === 0x78) {
    try {
      return zlib.inflateSync(buf);
    } catch {}
  }
  // As a last attempt, try unzip which auto-detects
  try {
    return zlib.unzipSync(buf);
  } catch {}
  return buf;
}

type SchedulerHeader = {
  messageCounter: number;
  opCode: number;
  icdVersionMajor: number;
  icdVersionMinor: number;
  payloadSize: number;
  timestamp: number; // ms since epoch
  numOfNetworkMembers: number;
  reserved1: number;
  reserved2: number;
  reserved3: number;
  globalId: number;
};

type SchedulerMessage101 = SchedulerHeader & {
  latitude: number;
  longitude: number;
  altitude: number;
  veIn: number;
  veIe: number;
  veIu: number;
  trueHeading: number;
};

type SchedulerMessage104 = SchedulerHeader & {
  payloadRemainder: Buffer; // raw payload for debugging
  records?: Array<{
    latitude: number;
    longitude: number;
    altitude: number;
    veIn: number;
    veIe: number;
    veIu: number;
    trueHeading: number;
  }>;
};

type SchedulerMessage = SchedulerMessage101 | SchedulerMessage104;

function parseSchedulerMessage(buf: Buffer): SchedulerMessage {
  // Try to auto-detect header offset and endianness for size/timestamp
  const HEADER_LEN = 22; // bytes
  if (buf.length < HEADER_LEN) throw new Error('buffer too small');

  type Candidate = {
    start: number;
    sizeEndian: 'LE' | 'BE';
    tsEndian: 'LE' | 'BE';
    header: SchedulerHeader;
    nextOffset: number;
    score: number;
  };

  const candidates: Candidate[] = [];
  for (let start = 0; start <= Math.min(8, buf.length - HEADER_LEN); start += 1) {
    for (const sizeEndian of ['LE', 'BE'] as const) {
      for (const tsEndian of ['LE', 'BE'] as const) {
        try {
          let o = start;
          const messageCounter = buf.readUInt8(o); o += 1;
          const opCode = buf.readUInt8(o); o += 1;
          const icdVersionMajor = buf.readUInt8(o); o += 1;
          const icdVersionMinor = buf.readUInt8(o); o += 1;
          const payloadSize = sizeEndian === 'LE' ? buf.readUInt32LE(o) : buf.readUInt32BE(o); o += 4;
          const ts = tsEndian === 'LE' ? buf.readBigUInt64LE(o) : buf.readBigUInt64BE(o); o += 8;
          const timestamp = Number(ts);
          const numOfNetworkMembers = buf.readUInt8(o); o += 1;
          const reserved1 = buf.readUInt8(o); o += 1;
          const reserved2 = buf.readUInt8(o); o += 1;
          const reserved3 = buf.readUInt8(o); o += 1;
          const globalId = buf.readUInt16LE(o); o += 2; // most IDs are LE; adjust if needed later
          const nextOffset = o;
          const header: SchedulerHeader = {
            messageCounter, opCode, icdVersionMajor, icdVersionMinor,
            payloadSize, timestamp, numOfNetworkMembers, reserved1, reserved2, reserved3, globalId,
          };

          // Heuristics-based scoring
          let score = 0;
          if (opCode === 101 || opCode === 104) score += 2; // expected opcodes
          if (icdVersionMajor < 32 && icdVersionMinor < 32) score += 1;
          const remaining = buf.length - nextOffset;
          if (payloadSize === remaining) score += 3; // ideal
          else if (payloadSize === buf.length) score += 1; // payload includes header?
          else if (payloadSize > 0 && payloadSize <= remaining + HEADER_LEN) score += 1;
          if (globalId >= 0 && globalId <= 65535) score += 1;
          // Rough timestamp sanity (2000-01-01 to 2100-01-01 in ms)
          if (timestamp > 946684800000 && timestamp < 4102444800000) score += 1;

          candidates.push({ start, sizeEndian, tsEndian, header, nextOffset, score });
        } catch {
          // ignore invalid read
        }
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error('unable to parse header');
  }
  // Pick best candidate
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (process.env.NODE_ENV !== 'production') {
  //  console.log(`[UDP] header selected start=${best.start} size=${best.sizeEndian} ts=${best.tsEndian} opcode=${best.header.opCode} payloadSize=${best.header.payloadSize}`);
  }

  const header = best.header;
  let o = best.nextOffset;

  if (header.opCode === 101) {
    if (buf.length < o + 28) throw new Error('buffer too small for opcode 101');

    // Try LE first
    let off = o;
    const le = {
      latitude: buf.readFloatLE(off), off1: off + 4,
      longitude: 0, off2: 0,
      altitude: 0, off3: 0,
      veIn: 0, off4: 0,
      veIe: 0, off5: 0,
      veIu: 0, off6: 0,
      trueHeading: 0,
    } as any;
    le.longitude = buf.readFloatLE(le.off1); le.off2 = le.off1 + 4;
    le.altitude = buf.readFloatLE(le.off2); le.off3 = le.off2 + 4;
    le.veIn = buf.readFloatLE(le.off3); le.off4 = le.off3 + 4;
    le.veIe = buf.readFloatLE(le.off4); le.off5 = le.off4 + 4;
    le.veIu = buf.readFloatLE(le.off5); le.off6 = le.off5 + 4;
    le.trueHeading = buf.readFloatLE(le.off6);

    // Try BE as alternative
    off = o;
    const be = {
      latitude: buf.readFloatBE(off), off1: off + 4,
      longitude: 0, off2: 0,
      altitude: 0, off3: 0,
      veIn: 0, off4: 0,
      veIe: 0, off5: 0,
      veIu: 0, off6: 0,
      trueHeading: 0,
    } as any;
    be.longitude = buf.readFloatBE(be.off1); be.off2 = be.off1 + 4;
    be.altitude = buf.readFloatBE(be.off2); be.off3 = be.off2 + 4;
    be.veIn = buf.readFloatBE(be.off3); be.off4 = be.off3 + 4;
    be.veIe = buf.readFloatBE(be.off4); be.off5 = be.off4 + 4;
    be.veIu = buf.readFloatBE(be.off5); be.off6 = be.off5 + 4;
    be.trueHeading = buf.readFloatBE(be.off6);

    const isSane = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    let choice: 'LE' | 'BE' | 'I32LE' | 'I32BE' = 'LE';
    let chosen: any = le;
    if (isSane(le.latitude, le.longitude)) {
      choice = 'LE';
      chosen = le;
    } else if (isSane(be.latitude, be.longitude)) {
      choice = 'BE';
      chosen = be;
    } else {
      // Try scaled Int32 (1e7) for lat/lon
      const i32leLat = buf.readInt32LE(o) / 1e7;
      const i32leLon = buf.readInt32LE(o + 4) / 1e7;
      if (isSane(i32leLat, i32leLon)) {
        choice = 'I32LE';
        chosen = {
          latitude: i32leLat,
          longitude: i32leLon,
          altitude: buf.readFloatLE(o + 8),
          veIn: buf.readFloatLE(o + 12),
          veIe: buf.readFloatLE(o + 16),
          veIu: buf.readFloatLE(o + 20),
          trueHeading: buf.readFloatLE(o + 24),
        };
      } else {
        const i32beLat = buf.readInt32BE(o) / 1e7;
        const i32beLon = buf.readInt32BE(o + 4) / 1e7;
        if (isSane(i32beLat, i32beLon)) {
          choice = 'I32BE';
          chosen = {
            latitude: i32beLat,
            longitude: i32beLon,
            altitude: buf.readFloatBE(o + 8),
            veIn: buf.readFloatBE(o + 12),
            veIe: buf.readFloatBE(o + 16),
            veIu: buf.readFloatBE(o + 20),
            trueHeading: buf.readFloatBE(o + 24),
          };
        }
      }
    }
    if (process.env.NODE_ENV !== 'production') {
    //  console.log(`[UDP] opcode 101 decode mode: ${choice}`);
    }

    const msg101: SchedulerMessage101 = {
      ...header,
      latitude: round2(chosen.latitude),
      longitude: round2(chosen.longitude),
      altitude: round2(chosen.altitude),
      veIn: round2(chosen.veIn),
      veIe: round2(chosen.veIe),
      veIu: round2(chosen.veIu),
      trueHeading: round2(chosen.trueHeading),
    };
    return msg101;
  }

  // For opcode 104: attempt to decode payload as repeated 7-float (LE) records, 28 bytes each
  const payloadRemainder = buf.subarray(o);
  const msg104: SchedulerMessage104 = { ...header, payloadRemainder };
  if (header.payloadSize >= 28 && payloadRemainder.length >= 28) {
    const recordSize = 28;
    const usable = Math.floor(payloadRemainder.length / recordSize) * recordSize;
    const recs: SchedulerMessage104['records'] = [];
    for (let i = 0; i + recordSize <= usable; i += recordSize) {
      const base = i;
      // Try LE floats first
      const le = {
        latitude: payloadRemainder.readFloatLE(base + 0),
        longitude: payloadRemainder.readFloatLE(base + 4),
        altitude: payloadRemainder.readFloatLE(base + 8),
        veIn: payloadRemainder.readFloatLE(base + 12),
        veIe: payloadRemainder.readFloatLE(base + 16),
        veIu: payloadRemainder.readFloatLE(base + 20),
        trueHeading: payloadRemainder.readFloatLE(base + 24),
      };
      const isSane = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
      if (isSane(le.latitude, le.longitude)) {
        recs.push({
          latitude: round2(le.latitude),
          longitude: round2(le.longitude),
          altitude: round2(le.altitude),
          veIn: round2(le.veIn),
          veIe: round2(le.veIe),
          veIu: round2(le.veIu),
          trueHeading: round2(le.trueHeading),
        });
      } else {
        // Try BE as fallback per record
        const be = {
          latitude: payloadRemainder.readFloatBE(base + 0),
          longitude: payloadRemainder.readFloatBE(base + 4),
          altitude: payloadRemainder.readFloatBE(base + 8),
          veIn: payloadRemainder.readFloatBE(base + 12),
          veIe: payloadRemainder.readFloatBE(base + 16),
          veIu: payloadRemainder.readFloatBE(base + 20),
          trueHeading: payloadRemainder.readFloatBE(base + 24),
        };
        recs.push({
          latitude: round2(be.latitude),
          longitude: round2(be.longitude),
          altitude: round2(be.altitude),
          veIn: round2(be.veIn),
          veIe: round2(be.veIe),
          veIu: round2(be.veIu),
          trueHeading: round2(be.trueHeading),
        });
      }
    }
    if (recs.length > 0) msg104.records = recs;
  }
  return msg104;
}

function formatSchedulerLog(m: SchedulerMessage, host: string, port: number): string {
  const headerLines = [
    `Buffer sent from scheduler :`,
    '',
    `Opcode Received : ${m.opCode}`,
    '',
    `Header:`,
    `  messageCounter = ${m.messageCounter}`,
    `  opCode = ${m.opCode}`,
    `  icdVersionMajor = ${m.icdVersionMajor}`,
    `  icdVersionMinor = ${m.icdVersionMinor}`,
    `  payloadSize = ${m.payloadSize}`,
    `  timestamp = ${m.timestamp}`,
    `  numOfNetworkMembers = ${m.numOfNetworkMembers}  reserved = ${m.reserved1} ${m.reserved2} ${m.reserved3}`,
    `  globalId = ${m.globalId}`,
  ];

  if (m.opCode === 101) {
    const m101 = m as SchedulerMessage101;
    return [
      ...headerLines,
      `  latitude = ${m101.latitude.toFixed(2)}`,
      `  longitude = ${m101.longitude.toFixed(2)}`,
      `  altitude = ${m101.altitude.toFixed(2)}`,
      `  veIn = ${m101.veIn.toFixed(2)}`,
      `  veIe = ${m101.veIe.toFixed(2)}`,
      `  veIu = ${m101.veIu.toFixed(2)}`,
      `  trueHeading = ${m101.trueHeading.toFixed(2)}`,
      `  reserved = 0`,
    ].join('\n');
  }

  // Default/104: if records are parsed, print them in text; otherwise show hex preview
  const m104 = m as SchedulerMessage104;
  const payload = m104.payloadRemainder ?? Buffer.alloc(0);
  if (m104.records && m104.records.length > 0) {
    const recLines: string[] = [];
    m104.records.forEach((r, idx) => {
      recLines.push(
        `Record ${idx + 1}:`,
        `  latitude = ${r.latitude.toFixed(2)}`,
        `  longitude = ${r.longitude.toFixed(2)}`,
        `  altitude = ${r.altitude.toFixed(2)}`,
        `  veIn = ${r.veIn.toFixed(2)}`,
        `  veIe = ${r.veIe.toFixed(2)}`,
        `  veIu = ${r.veIu.toFixed(2)}`,
        `  trueHeading = ${r.trueHeading.toFixed(2)}`,
      );
    });
    return [
      ...headerLines,
      `  records = ${m104.records.length}`,
      ...recLines,
    ].join('\n');
  }
  const hex = payload.toString('hex');
  const ascii = payload
    .toString('ascii')
    .replace(/[^\x20-\x7E]+/g, ' ') // printable ASCII only
    .trim();
  return [
    ...headerLines,
    `  payload(len=${payload.length}) hex=${hex}`,
    `  payload(ascii) = ${ascii}`,
  ].join('\n');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function createPromptWindow() {
  promptWindow = new BrowserWindow({
    width: 420,
    height: 220,
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: true,
    modal: true,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'" />
      <title>UDP Configuration</title>
      <style>
        body { font-family: system-ui, sans-serif; margin: 16px; }
        h2 { margin: 0 0 12px; font-size: 16px; }
        label { display: block; margin-top: 8px; font-size: 12px; color: #333; }
        input { width: 100%; padding: 8px; box-sizing: border-box; margin-top: 4px; }
        .row { display: flex; gap: 8px; }
        .row > div { flex: 1; }
        .actions { margin-top: 16px; display: flex; justify-content: flex-end; gap: 8px; }
        button { padding: 8px 12px; }
        .err { color: #b00020; font-size: 12px; margin-top: 8px; display: none; }
      </style>
    </head>
    <body>
      <h2>Enter UDP server details</h2>
      <form id="f">
        <div class="row">
          <div>
            <label for="host">Host</label>
            <input id="host" name="host" value="127.0.0.1" required />
          </div>
          <div>
            <label for="port">Port</label>
            <input id="port" name="port" type="number" min="1" max="65535" value="5005" required />
          </div>
        </div>
        <div class="actions">
          <button type="submit">Connect</button>
        </div>
        <div id="err" class="err">Failed to connect. Please verify host/port.</div>
      </form>
      <script>
        const form = document.getElementById('f');
        const err = document.getElementById('err');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          err.style.display = 'none';
          const host = (document.getElementById('host')).value.trim() || '127.0.0.1';
          const portStr = (document.getElementById('port')).value.trim() || '5005';
          const port = Number(portStr);
          if (!Number.isFinite(port) || port < 1 || port > 65535) {
            err.textContent = 'Please enter a valid port (1-65535)';
            err.style.display = 'block';
            return;
          }
          if (window.udpConfig && typeof window.udpConfig.submit === 'function') {
            window.udpConfig.submit(host, port);
          } else {
            err.textContent = 'IPC not available';
            err.style.display = 'block';
          }
        });
      </script>
    </body>
  </html>`;

  const dataUrl = 'data:text/html;base64,' + Buffer.from(html, 'utf-8').toString('base64');
  promptWindow.loadURL(dataUrl);

  promptWindow.on('closed', () => {
    promptWindow = null;
  });
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.webContents.once('did-finish-load', () => {
    if (latestNodes.length > 0) {
      mainWindow?.webContents.send('udp-nodes', latestNodes);
    }
  });

  globalShortcut.register('F11', () => {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });

  globalShortcut.register('Escape', () => {
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
  });

  globalShortcut.register('Alt+F4', () => {
    app.quit();
  });
};

app.whenReady().then(async () => {
  try {
    await setupUdpClient('127.0.0.1', 5005);
    console.log("UDP connected to localhost:5005");
  } catch (err) {
    console.error("Failed to connect UDP:", err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    try {
      udpSocket?.close();
      udpSocket = null;
    } catch {}
    app.quit()
  }
})

