import test from 'node:test';
import assert from 'node:assert/strict';
import {createCaptureScope} from '../src/core/capture-scope.js';
test('late media cannot cross account transitions or pause/resume',()=>{
 const scope=createCaptureScope();
 assert.equal(scope.accepts(scope.ticket()),false);
 scope.update('A');const original=scope.ticket();
 scope.update('A');assert.equal(scope.accepts(original),true);
 scope.update(null);assert.equal(scope.accepts(original),false);
 scope.update('A');assert.equal(scope.accepts(original),false);
 const resumed=scope.ticket();scope.update('B');
 assert.equal(scope.accepts(resumed),false);
 assert.equal(scope.accepts(scope.ticket()),true);
});
