import test from 'node:test';
import assert from 'node:assert/strict';
import {captureStatus} from '../src/popup/status.js';

const enabled = {settings: {consent: true, enabled: true}, health: [], tabs: 0};

test('capture status describes the connection separately from the capture switch', () => {
  assert.equal(captureStatus(enabled), 'waiting');
  assert.equal(captureStatus({...enabled, tabs: 1}), 'reconnecting');
  assert.equal(captureStatus({...enabled, health: [{online: true, matched: 0}]}), 'connected');
  assert.equal(captureStatus({...enabled, health: [{online: true, matched: 3}]}), 'live');
  assert.equal(captureStatus({...enabled, health: [{online: false, matched: 3}]}), 'offline');
});

test('off, paused and demo states take precedence over old health signals', () => {
  const live = {...enabled, health: [{online: true, matched: 3}]};
  assert.equal(captureStatus({...live, settings: {consent: false, enabled: true}}), 'off');
  assert.equal(captureStatus({...live, settings: {consent: true, enabled: false}}), 'paused');
  assert.equal(captureStatus(live, true), 'demo');
});
test('background timer throttling is distinguished from a disconnected or discarded tab',()=>{
 const stale={online:true,matched:3,fresh:false,background:true};
 assert.equal(captureStatus({...enabled,tabs:1,health:[stale]}),'background');
 assert.equal(captureStatus({...enabled,tabs:1,health:[{...stale,background:false}]}),'reconnecting');
 assert.equal(captureStatus({...enabled,tabs:1,health:[{...stale,unavailable:true}]}),'reconnecting');
 assert.equal(captureStatus({...enabled,tabs:2,health:[stale,{online:true,matched:2,fresh:true}]}),'live');
});

test('revoked site permission overrides stale live health',()=>{assert.equal(captureStatus({...enabled,siteAccess:false,health:[{online:true,matched:3}]}),'permissionMissing');});


test('background heartbeat freshness does not alternate the main status', () => {
  for (const fresh of [true, false, true, false]) {
    assert.equal(captureStatus({...enabled,tabs:1,health:[{online:true,matched:3,background:true,fresh}]}), 'background');
  }
  assert.equal(captureStatus({...enabled,tabs:1,health:[{online:true,matched:3,background:false,fresh:true}]}), 'live');
  assert.equal(captureStatus({...enabled,tabs:1,health:[{online:false,matched:3,background:true,fresh:true}]}), 'offline');
  assert.equal(captureStatus({...enabled,tabs:1,health:[{online:true,matched:3,background:true,fresh:true,unavailable:true}]}), 'reconnecting');
});
