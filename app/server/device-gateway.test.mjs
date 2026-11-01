import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGateway } from './device-gateway.mjs';
const adminToken = 'test-admin-token-at-least-24-characters';
const deviceKeys = { SN001: { tenantId: 'tenant-test', token: 'device-test-token' } };
const snapshot = {
  catalog: [], state: { version: 1, tenantId: 'tenant-test', points: [{ id: 'P1', tenantId: 'tenant-test' }], suppliers: [{ id: 'S1', authorizedTenantIds: ['tenant-test'] }],
    models: [{ id: 'M1', name: 'Test', code: 'M1', supplierId: 'S1', status: '启用', revision: 1, channelCount: 1, ioMapping: [{ channel: 1, pumpIo: 'P1', valveIo: 'V1', sensorIo: 'S1' }], capabilities: { storageMotors: 1 } }],
    devices: [{ id: 'D1', sn: 'SN001', tenantId: 'tenant-test', pointId: 'P1', modelId: 'M1', status: '在线' }], storages: [], templates: [], maintenancePlans: [] }
};
test('gateway authenticates, persists bootstrap and accepts sequenced device reports', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'roboops-gateway-'));
  const filename = join(directory, 'state.json');
  let gateway;
  const start = async () => { gateway = await createGateway({ adminToken, deviceKeys, filename }); await new Promise((resolve) => gateway.server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${gateway.server.address().port}`; };
  try {
    let url = await start();
    const request = (path, token, method = 'GET', body) => fetch(`${url}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    assert.equal((await request('/api/devices/SN001/bootstrap', 'invalid')).status, 401);
    assert.equal((await request('/api/admin/tenant-test/snapshot', adminToken, 'PUT', snapshot)).status, 200);
    const initial = await request('/api/devices/SN001/bootstrap', 'device-test-token');
    assert.equal(initial.status, 200); assert.equal((await initial.json()).model.channelCount, 1);
    const report = { sequence: 1, modelRevision: 1, reportedAt: new Date().toISOString(), channels: [{ channel: 1, materialCode: 'TEA', remaining: 10, sensorValue: 3 }] };
    assert.equal((await request('/api/devices/SN001/state', 'device-test-token', 'POST', report)).status, 200);
    assert.equal((await request('/api/devices/SN001/state', 'device-test-token', 'POST', report)).status, 400);
    assert.equal((await request('/api/admin/other/snapshot', adminToken, 'PUT', snapshot)).status, 400);
    await gateway.close(); url = await start();
    const status = await request('/api/admin/tenant-test/status', adminToken);
    assert.equal((await status.json()).devices[0].telemetry.sequence, 1);
    assert.equal((await request('/api/admin/tenant-test/snapshot', adminToken, 'PUT', snapshot)).status, 200);
    assert.equal((await (await request('/api/admin/tenant-test/status', adminToken)).json()).devices[0].telemetry.sequence, 1);
  } finally { await gateway?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('MQTT state reaches the same persisted status endpoint', async () => {
  const { createServer } = await import('node:net');
  const { default: packet } = await import('mqtt-packet');
  let subscriber;
  let subscribed;
  const ready = new Promise((resolve) => { subscribed = resolve; });
  const broker = createServer((socket) => {
    subscriber = socket;
    const parser = packet.parser();
    socket.on('data', (data) => parser.parse(data));
    parser.on('packet', (message) => {
      if (message.cmd === 'connect') socket.write(packet.generate({ cmd: 'connack', returnCode: 0, sessionPresent: false }));
      if (message.cmd === 'subscribe') { socket.write(packet.generate({ cmd: 'suback', messageId: message.messageId, granted: [1] })); subscribed(); }
      if (message.cmd === 'pingreq') socket.write(packet.generate({ cmd: 'pingresp' }));
    });
  });
  await new Promise((resolve) => broker.listen(0, '127.0.0.1', resolve));
  const gateway = await createGateway({ adminToken, deviceKeys, mqttUrl: `mqtt://127.0.0.1:${broker.address().port}` });
  try {
    await new Promise((resolve) => gateway.server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${gateway.server.address().port}`;
    const headers = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${url}/api/admin/tenant-test/snapshot`, { method: 'PUT', headers, body: JSON.stringify(snapshot) })).status, 200);
    await ready;
    subscriber.write(packet.generate({ cmd: 'publish', topic: 'roboops/tenant-test/SN001/state', qos: 0, payload: JSON.stringify({ token: 'device-test-token', report: { sequence: 2, modelRevision: 1, reportedAt: new Date().toISOString(), channels: [] } }) }));
    let received = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await fetch(`${url}/api/admin/tenant-test/status`, { headers });
      if ((await response.json()).devices[0].telemetry?.sequence === 2) { received = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(received, true);
  } finally { await gateway.close(); subscriber?.destroy(); await new Promise((resolve) => broker.close(resolve)); }
});
