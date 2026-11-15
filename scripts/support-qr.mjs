import {readFile,writeFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import {chromium} from '@playwright/test';
// The verified official payload is committed for reproducible, offline regeneration.
const provenance=JSON.parse(await readFile('src/assets/support-qr.json','utf8'));
const payload=provenance.payload;
function tlv(s){const out={};for(let i=0;i<s.length;){const id=s.slice(i,i+2),n=Number(s.slice(i+2,i+4));if(!Number.isFinite(n)||i+4+n>s.length)throw Error('Invalid TLV');out[id]=s.slice(i+4,i+4+n);i+=n+4;}return out;}
function crc(s){let n=0xffff;for(const c of Buffer.from(s)){n^=c<<8;for(let j=0;j<8;j++)n=n&0x8000?(n<<1)^0x1021:n<<1;}return(n&65535).toString(16).toUpperCase().padStart(4,'0');}
const top=tlv(payload),bank=tlv(tlv(top['38'])['01']);
if(bank['00']!=='970422'||bank['01']!=='192198'||top['53']!=='704'||top['58']!=='VN'||top['54']||tlv(top['62'])['08']!=='UNG HO StillHere'||crc(payload.slice(0,-4))!==top['63'])throw Error('VietQR recipient / amount / CRC mismatch');
const qr=await QRCode.toString(payload,{type:'svg',errorCorrectionLevel:'H',margin:4,color:{dark:'#12306a',light:'#ffffff'}});
const logo=(await readFile('src/assets/fsub-logo-transparent.png')).toString('base64');
const box=Number(qr.match(/viewBox="0 0 (\d+)/)[1]);
const side=Math.floor(box*.13),xy=(box-side)/2;
const svg=qr.replace('</svg>',`<rect x="${xy-1}" y="${xy-1}" width="${side+2}" height="${side+2}" rx="1.3" fill="white"/><svg x="${xy}" y="${xy}" width="${side}" height="${side}" viewBox="0 0 753 817"><image width="753" height="817" href="data:image/png;base64,${logo}"/></svg></svg>`);
await writeFile('src/assets/support-qr.svg',svg);
const browser=await chromium.launch({headless:true,channel:'chromium'});
try {const page=await browser.newPage();for(const size of [512,240,200]){await page.setViewportSize({width:size,height:size});await page.setContent(`<style>html,body{margin:0}img{width:100%;height:100%}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`);await page.locator('img').evaluate(img=>img.decode());const image=await page.screenshot();const p=PNG.sync.read(image);const decoded=jsQR(new Uint8ClampedArray(p.data),p.width,p.height);if(decoded?.data!==payload)throw Error('Branded QR decode failed at '+size);if(size===512)await writeFile('src/assets/support-qr.png',image);}}
finally{await browser.close();}
await writeFile('src/assets/support-qr.json',JSON.stringify({bank:'MB Bank',bin:'970422',account:'192198',accountHolder:'NGUYEN XUAN PHU',amount:null,memo:'UNG HO StillHere',source:'Locally generated EMV VietQR payload with publisher-provided recipient',payload,verifiedSizes:[512,240,200],note:'Account holder supplied by owner; QR decode validates encoded account, not bank ownership.'},null,2)+'\n');
console.log('VietQR verified: MB 970422 / 192198; no amount; CRC valid; branded PNG decodes at 512, 240, 200 px.');
