import test from 'node:test';import assert from 'node:assert/strict';import {installedRelease,RELEASES} from '../src/core/releases.js';
test('only an extension version update creates a notice, never install/reload/browser update',()=>{
 for(const reason of ['install','chrome_update','shared_module_update'])assert.equal(installedRelease({reason,previousVersion:'0.7.2'},'0.7.3'),null);
 assert.equal(installedRelease({reason:'update',previousVersion:'0.7.3'},'0.7.3'),null);
 assert.deepEqual(installedRelease({reason:'update',previousVersion:'0.7.2'},'0.7.3',7),{version:'0.7.3',previousVersion:'0.7.2',at:7});
 assert(RELEASES.every(r=>r.vi.length&&r.en.length));
});
