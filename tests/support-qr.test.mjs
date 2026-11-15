import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
test('branded payment QR independently decodes to MB 192198 without a fixed amount',async()=>{
 const png=PNG.sync.read(await readFile(new URL('../src/assets/support-qr.png',import.meta.url)));
 const result=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);assert(result,'QR must decode after adding the supplied logo');
 const parse=s=>{const fields={};let i=0;while(i<s.length){const id=s.slice(i,i+2),length=Number(s.slice(i+2,i+4));fields[id]=s.slice(i+4,i+4+length);i+=4+length;}return fields;};
 const payment=parse(result.data),bank=parse(parse(payment['38'])['01']);assert.equal(bank['00'],'970422');assert.equal(bank['01'],'192198');assert.equal(payment['53'],'704');assert.equal(payment['58'],'VN');assert.equal(payment['54'],undefined);assert.equal(parse(payment['62'])['08'],'UNG HO StillHere');
});
