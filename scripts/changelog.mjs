import {writeFile} from 'node:fs/promises';
import {RELEASES} from '../src/core/releases.js';
for(const lang of ['vi','en']){
 const en=lang==='en',title=en?'Version history':'Lịch sử phiên bản';
 const toc=RELEASES.map(r=>`<a href="#v-${r.version}">${r.version}</a>`).join('');
 const sections=RELEASES.map(r=>`<section class="policy-section" id="v-${r.version}"><h2>StillHere ${r.version}</h2><p class="policy-meta">${r.date}</p><ul>${r[lang].map(s=>`<li>${s}</li>`).join('')}</ul></section>`).join('');
 await writeFile(`src/popup/changelog${en?'-en':''}.html`,`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>StillHere — ${title}</title><link rel="stylesheet" href="privacy.css"><link rel="icon" href="icons/favicon.ico"><script src="privacy-nav.js" defer></script></head><body><main><header class="policy-header"><a href="popup.html"><img class="privacy-brand" src="assets/stillhere-logo-transparent.png" alt="StillHere"></a><a href="changelog${en?'':'-en'}.html">${en?'Tiếng Việt':'English'}</a></header><div class="policy-intro"><h1>${title}</h1><p>${en?'Changes included in each release. A version listed here does not imply Chrome Web Store approval.':'Những thay đổi trong từng phiên bản. Phiên bản xuất hiện ở đây không đồng nghĩa đã được Chrome Web Store duyệt.'}</p></div><div class="policy-layout"><nav class="policy-toc" aria-label="${title}">${toc}</nav><article class="policy-body">${sections}</article></div></main></body></html>`);
}
