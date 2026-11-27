import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNodeVersion, checkNodeEngine } from '../scripts/verify-node-runtime-compat.mjs';

test('Node 24.22.0 satisfies engine >=22', () => {
  assert.deepEqual(checkNodeEngine({ nodeVersion: 'v24.22.0', engineRange: '>=22' }),
    { ok: true, code: 'SUPPORTED_BY_DECLARED_ENGINE', nodeMajor: 24 });
});
test('Node 22 satisfies >=22', () => assert.equal(checkNodeEngine({nodeVersion:'v22.16.0',engineRange:'>=22'}).ok,true));
test('Node 21 rejected', () => assert.equal(checkNodeEngine({nodeVersion:'v21.13.2',engineRange:'>=22'}).code,'NODE_BELOW_DECLARED_ENGINE'));
test('Node 20 rejected', () => assert.equal(checkNodeEngine({nodeVersion:'v20.19.0',engineRange:'>=22'}).ok,false));
test('below minor floor rejected', () => assert.equal(checkNodeEngine({nodeVersion:'v22.4.0',engineRange:'>=22.5'}).ok,false));
test('at minor floor accepted', () => assert.equal(checkNodeEngine({nodeVersion:'v22.5.1',engineRange:'>=22.5'}).ok,true));
test('below patch floor rejected', () => assert.equal(checkNodeEngine({nodeVersion:'v22.5.1',engineRange:'>=22.5.2'}).ok,false));
test('at patch floor accepted', () => assert.equal(checkNodeEngine({nodeVersion:'v22.5.2',engineRange:'>=22.5.2'}).ok,true));
test('invalid version rejected', () => assert.equal(checkNodeEngine({nodeVersion:'v24',engineRange:'>=22'}).code,'INVALID_NODE_VERSION'));
test('unrecognized policy fails closed', () => assert.equal(checkNodeEngine({nodeVersion:'v24.22.0',engineRange:'^22 || ^24'}).code,'UNRECOGNIZED_NODE_ENGINE_POLICY'));
test('missing policy fails closed', () => assert.equal(checkNodeEngine({nodeVersion:'v24.22.0'}).ok,false));
test('PowerShell quoting-corrupted JS is not evaluated', () => assert.equal(parseNodeVersion('Number(process.versions.node.split(.)[0])'),null));
test('prerelease version parses', () => assert.deepEqual(parseNodeVersion('v24.22.0-test.1'),{major:24,minor:22,patch:0}));
