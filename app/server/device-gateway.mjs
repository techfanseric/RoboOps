import { createServer as createHttpServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import { connect } from 'mqtt';

// Development/integration gateway. Bind locally; deploy behind an authenticated TLS service.
export async function createGateway({ adminToken, deviceKeys = {}, filename, mqttUrl, mqttUsername, mqttPassword, origin = 'http://127.0.0.1:5173' }) {
  if (!adminToken || adminToken.length < 24) throw new Error('GATEWAY_ADMIN_TOKEN must contain at least 24 characters');
  const vite = await createViteServer({ root: resolve(dirname(fileURLToPath(import.meta.url)), '..'), configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null }, appType: 'custom' });
  const { buildDeviceBootstrap, validateTelemetry, validateModel } = await vite.ssrLoadModule('/src/features/deviceOps/hardware.ts');
  let store = { tenants: {} };
  if (filename) { try { store = JSON.parse(readFileSync(filename, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  const persist = () => { if (filename) { mkdirSync(dirname(filename), { recursive: true }); writeFileSync(`${filename}.tmp`, JSON.stringify(store), { mode: 0o600 }); renameSync(`${filename}.tmp`, filename); } };
  const matches = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length > 0 && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  function receive(tenantId, sn, report) {
    const snapshot = store.tenants[tenantId];
    if (!snapshot) throw new Error('Unknown tenant');
    const validation = validateTelemetry(snapshot.state, sn, report);
    if (!validation.ok) throw new Error(validation.message);
    const device = snapshot.state.devices.find((item) => item.sn.toUpperCase() === sn.toUpperCase());
    const previous = device.telemetry;
    const previousStatus = device.status;
    device.telemetry = report; device.status = '在线';
    try { persist(); } catch (error) { device.telemetry = previous; device.status = previousStatus; throw error; }
  }
  let mqtt;
  if (mqttUrl) {
    mqtt = connect(mqttUrl, { username: mqttUsername, password: mqttPassword, reconnectPeriod: 2000 });
    mqtt.on('connect', () => mqtt.subscribe('roboops/+/+/state', { qos: 1 }));
    mqtt.on('error', () => console.error('MQTT connection failed; check broker configuration'));
    mqtt.on('message', (topic, payload) => {
      try {
        if (payload.length > 1_048_576) throw new Error('Message too large');
        const [, tenantId, sn] = topic.split('/');
        const body = JSON.parse(payload.toString());
        const identity = deviceKeys[sn.toUpperCase()];
        if (!identity || identity.tenantId !== tenantId || !matches(body.token, identity.token)) throw new Error('Invalid device identity');
        receive(tenantId, sn, body.report);
      } catch { console.error('Rejected MQTT state message'); }
    });
  }
  const server = createHttpServer(async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: 'Origin denied' });
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      const admin = url.pathname.match(/^\/api\/admin\/([^/]+)\/(snapshot|status)$/);
      const deviceRoute = url.pathname.match(/^\/api\/devices\/([a-zA-Z0-9]+)\/(bootstrap|state)$/);
      let tenantId, sn;
      if (admin) {
        if (!matches(token, adminToken)) return send(401, { error: 'Unauthorized' });
        tenantId = decodeURIComponent(admin[1]);
      } else if (deviceRoute) {
        sn = deviceRoute[1].toUpperCase();
        const identity = deviceKeys[sn];
        if (!identity || !matches(token, identity.token)) return send(401, { error: 'Unauthorized device' });
        tenantId = identity.tenantId;
      } else return send(404, { error: 'Not found' });
      let body;
      if (['PUT', 'POST'].includes(req.method)) {
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 4_194_304) return send(413, { error: 'Payload too large' }); chunks.push(chunk); }
        body = JSON.parse(Buffer.concat(chunks).toString());
      }
      if (admin && admin[2] === 'snapshot' && req.method === 'PUT') {
        if (body.state?.tenantId !== tenantId || !Array.isArray(body.catalog) || body.state?.version !== 1 || (body.resources && body.resources.tenantId !== tenantId)) throw new Error('Invalid tenant snapshot');
        // Reuse the same runtime validation as the editor, and preserve server-owned telemetry.
        for (const model of body.state.models) {
          const validation = validateModel(body.state, model);
          if (!validation.ok) throw new Error(`${model.name}: ${validation.message}`);
        }
        if (body.state.devices.some((device) => device.tenantId !== tenantId || !body.state.models.some((model) => model.id === device.modelId))) throw new Error('Invalid device scope');
        const previous = store.tenants[tenantId];
        body.state.devices = body.state.devices.map(({ telemetry: _ignored, ...device }) => ({ ...device, telemetry: previous?.state.devices.find((old) => old.sn.toUpperCase() === device.sn.toUpperCase())?.telemetry }));
        store.tenants[tenantId] = body;
        try { persist(); } catch (error) { if (previous) store.tenants[tenantId] = previous; else delete store.tenants[tenantId]; throw error; }
        return send(200, { saved: true });
      }
      const snapshot = store.tenants[tenantId];
      if (!snapshot) return send(404, { error: 'Snapshot not published' });
      if (admin && admin[2] === 'status' && req.method === 'GET') return send(200, { devices: snapshot.state.devices.map((device) => ({ sn: device.sn, telemetry: device.telemetry })) });
      if (deviceRoute?.[2] === 'bootstrap' && req.method === 'GET') return send(200, buildDeviceBootstrap(snapshot.state, sn, snapshot.catalog, snapshot.resources, snapshot.variants));
      if (deviceRoute?.[2] === 'state' && req.method === 'POST') { receive(tenantId, sn, body); return send(200, { accepted: true }); }
      return send(405, { error: 'Method not allowed' });
    } catch (error) { return send(400, { error: error instanceof Error ? error.message : 'Invalid request' }); }
  });
  return { server, close: async () => { mqtt?.end(true); await new Promise((resolve) => server.close(resolve)); await vite.close(); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const gateway = await createGateway({ adminToken: process.env.GATEWAY_ADMIN_TOKEN, deviceKeys: JSON.parse(process.env.GATEWAY_DEVICE_KEYS || '{}'), filename: resolve(process.env.GATEWAY_DATA_FILE || 'server/data/snapshots.json'), mqttUrl: process.env.MQTT_URL, mqttUsername: process.env.MQTT_USERNAME, mqttPassword: process.env.MQTT_PASSWORD, origin: process.env.GATEWAY_ORIGIN || 'http://127.0.0.1:5173' });
  gateway.server.listen(Number(process.env.GATEWAY_PORT || 8787), '127.0.0.1', () => console.log('Device gateway listening on 127.0.0.1'));
  process.on('SIGINT', async () => { await gateway.close(); process.exit(0); });
}
