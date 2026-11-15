// Render the real packaged UI with fictional demo data in a disposable profile.
// No personal browser profile, Zalo login, network images or chat archive is used.
import {chromium, expect} from '@playwright/test';
import {cp, mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';

const temp = await mkdtemp(resolve(tmpdir(), 'go-lai-store-'));
const extension = resolve(temp, 'extension');
const output = resolve('outputs/store-assets');
await mkdir(output, {recursive: true});
await cp(resolve('outputs/go-lai-extension'), extension, {recursive: true});
const {version} = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>StillHere — Giới thiệu</title><link rel="stylesheet" href="store-preview.css"><body>
<header><img src="assets/stillhere-logo-transparent.png" alt="StillHere"><span>cho Zalo Web và Messenger</span></header>
<main><p class="eyebrow" id="eyebrow"></p><h1 id="title"></h1><p class="description" id="description"></p><ul id="features"></ul><p class="limit" id="limit"></p></main>
<div class="preview"><iframe title="Giao diện popup thực tế" src="popup.html?demo=1"></iframe></div>
<footer><span>Giao diện ${version} · Dữ liệu minh hoạ</span><span>Tiện ích độc lập, không liên kết với Zalo/VNG hay Meta.</span></footer>
</body></html>`;
const css = `*{box-sizing:border-box}body{margin:0;width:1280px;height:800px;overflow:hidden;background:#f2f7ff;color:#182942;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header{display:flex;align-items:center;gap:12px;position:absolute;left:52px;top:52px;font-size:20px}header img{width:180px;height:60px;object-fit:contain}header span{display:none}main{position:absolute;left:52px;top:185px;width:300px}.eyebrow{display:none}h1{font-size:42px;line-height:1.12;letter-spacing:-.035em;margin:0 0 23px;white-space:pre-line}.description{font-size:16px;line-height:1.6;color:#52657f;max-width:300px;margin:0 0 28px}ul{list-style:none;padding:0;margin:0;display:grid;gap:16px}li{font-size:13px;color:#24456d;display:flex;align-items:center;gap:12px}li:before{content:"";width:6px;height:6px;border-radius:50%;background:#0643d7;flex-shrink:0}.limit{font-size:13px;color:#586b85;line-height:1.7;max-width:300px;margin-top:29px}.preview{position:absolute;top:140px;left:420px;width:800px;height:600px;border-radius:16px;overflow:hidden;box-shadow:0 18px 55px #264b8b22}iframe{display:block;width:800px;height:600px;border:0}footer{position:absolute;bottom:30px;left:52px;right:52px;display:flex;justify-content:space-between;font-size:12px;color:#586b85}`;
await writeFile(resolve(extension, 'store-preview.html'), html);
await writeFile(resolve(extension, 'store-preview.css'), css);
let context;
try {
  context = await chromium.launchPersistentContext(resolve(temp, 'profile'), {
    channel: 'chromium', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-gpu', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: {width: 1280, height: 800}, deviceScaleFactor: 1
  });
  // Everything shown is packaged locally. Block any unexpected outbound request.
  await context.route(/^https?:/, route => route.abort());
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/store-preview.html`);
  const popup = page.frameLocator('iframe');
  await expect(popup.locator('.message')).toHaveCount(5);
  const cards = [
    {name:'01-ban-luu.png', eyebrow:'BẢN LƯU CỤC BỘ', title:'Xem lại tin\nđã gỡ.', description:'Giữ nội dung đã hiển thị trên Zalo Web và Messenger để xem lại khi tin nhắn bị thu hồi.', features:['Popup rộng hơn, tìm tin nhanh hơn','Lọc theo cá nhân, nhóm và người thu hồi','Lưu avatar, nhãn dán, ảnh và GIF'], limit:'Chỉ xem lại tin được lưu trước khi thu hồi. Không khôi phục tin đã gỡ từ trước.'},
    {name:'02-tin-nhom.png', eyebrow:'NGỮ CẢNH HỘI THOẠI', title:'Rõ người gửi,\nrõ tên nhóm.', description:'Tin nhóm có nhãn riêng, avatar nhóm và tên người gửi ngay cạnh nội dung.', features:['Bộ lọc nhóm trong một lần bấm','Nhãn “Nhóm — Tên nhóm”','Tìm lại nội dung trong bản lưu'], limit:'Avatar được lấy khi giao diện Zalo cung cấp. Khi ảnh không tải được, hiện chữ viết tắt.', group:true},
    {name:'03-quyen-kiem-soat.png', eyebrow:'DỮ LIỆU TRÊN THIẾT BỊ', title:'Bạn kiểm soát\nbản lưu.', description:'Chủ động bật lưu, tạm dừng và chọn thời gian giữ tin ngay trong popup.', features:['Tin nhắn được mã hoá AES-GCM','Chọn giữ 7 hoặc 30 ngày','Xoá bản lưu và tạm dừng ghi nhận'], limit:'Nội dung tin không gửi tới nhà phát triển. Avatar CDN có thể cần mạng. Không vượt mã hoá E2EE.', settings:true}
  ];
  cards.push(
    {name:'04-facebook.png',title:'Cùng một nơi.\nHai nền tảng.',description:'Dùng StillHere cho Zalo Web và Facebook/Messenger theo lựa chọn của bạn.',features:['Chọn Zalo, Facebook hoặc cả hai','Menu riêng cho từng nền tảng','Không cần giữ popup luôn mở'],limit:'Chỉ ghi nhận hội thoại đã tải. Chat nổi trên bảng tin Facebook chưa hỗ trợ đầy đủ.',facebook:true},
    {name:'05-tim-kiem.png',title:'Tìm lại điều\nbạn cần.',description:'Tìm nội dung đã ghi nhận theo tên hoặc từ khoá, trong giao diện dễ đọc.',features:['Tìm theo người gửi hoặc nội dung','Lọc cá nhân và nhóm','Xem chi tiết ngay bên cạnh'],limit:'Tìm kiếm chỉ áp dụng với dữ liệu đã có trong StillHere.'},
    {name:'06-tep-da-luu.png',title:'Không chỉ\nlà văn bản.',description:'Giữ bản sao tệp được tải trước khi tin nhắn bị thu hồi.',features:['Ảnh, nhãn dán và GIF','Video có thể xem lại khi đã tải đủ','Avatar giúp nhận ra người gửi'],limit:'Cần cấp quyền lưu tệp. Tối đa 20 MB/tệp và 100 MB tổng dung lượng; không phải tệp nào cũng tải được.'},
    {name:'07-ngon-ngu.png',title:'Dễ hiểu.\nDễ sử dụng.',description:'Giao diện tiếng Việt và tiếng Anh, giữ cách thao tác quen thuộc.',features:['Chuyển ngôn ngữ trong một lần bấm','Bộ lọc được ghi nhớ trên thiết bị','Bố cục danh sách và nội dung rõ ràng'],limit:'Hình bên là giao diện tiếng Anh với dữ liệu minh hoạ.',english:true},
    {name:'08-mien-phi.png',title:'Miễn phí.\nDành cho bạn.',description:'StillHere được FSUB.vn phát triển và chia sẻ miễn phí cho cộng đồng.',features:['Không cần mua gói sử dụng','Góp ý để cùng cải thiện sản phẩm','Ủng hộ dự án hoàn toàn tự nguyện'],limit:'Sản phẩm độc lập, không được Zalo/VNG hoặc Meta bảo trợ.',about:true}
  );
  for (const card of cards) {
    await page.locator('iframe').evaluate((el,url)=>{el.src=url;},`chrome-extension://${id}/popup.html?demo=1&shot=${card.name}`);
    await expect(popup.locator('.message').first()).toBeVisible();
    if(card.facebook)await popup.locator('#facebook-button').click();
    if(card.english)await popup.getByText('EN',{exact:true}).click();
    if(card.about)await popup.locator('#about-button').click();

    await page.evaluate(card => {
      for (const key of ['eyebrow','title','description','limit']) document.getElementById(key).textContent = card[key];
      document.getElementById('features').replaceChildren(...card.features.map(text => {const li=document.createElement('li');li.textContent=text;return li;}));
    }, card);
    if (card.group) {
      await popup.getByText('Nhóm', {exact:true}).click();
      await expect(popup.locator('.message')).toHaveCount(2);
    }
    if (card.settings) await popup.locator('#settings-button').click();
    await expect(page.locator('h1')).toHaveText(card.title);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth === innerWidth && document.documentElement.scrollHeight === innerHeight)).toBe(true);
    await page.screenshot({animations:'disabled',path:resolve(output, card.name)});
    console.log(`Created ${card.name} — 1280×800, real UI with demo data`);
  }
  for(const [name,width,height] of [['promo-small.png',440,280],['promo-marquee.png',1400,560]]) {
    await page.setViewportSize({width,height});
    await page.setContent(`<html><head><style>*{box-sizing:border-box}body{margin:0;width:${width}px;height:${height}px;background:#f0f6ff;color:#073baf;font-family:system-ui;display:flex;align-items:center;padding:${width===440?30:72}px;gap:48px}img{width:${width===440?150:260}px;height:auto}h1{font-size:${width===440?28:58}px;line-height:1.15;margin:24px 0 16px;letter-spacing:-.03em}p{font-size:${width===440?14:24}px;line-height:1.6;margin:0;color:#36577d}.art{width:340px}small{display:block;margin-top:24px;color:#526989;font-size:14px}</style></head><body><div><img src="chrome-extension://${id}/assets/stillhere-logo-transparent.png"><h1>Xem lại tin đã gỡ.</h1><p>Zalo Web · Facebook · Messenger</p>${width>440?'<small>Chỉ xem lại nội dung đã lưu trước khi thu hồi.</small>':''}</div>${width>440?`<img class="art" src="chrome-extension://${id}/assets/illustrations/onboarding.png">`:''}</body></html>`);
    await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
    await page.screenshot({path:resolve(output,name)});
  }
  await cp(resolve(extension,'icons/128.png'), resolve(output,'icon-128.png'));
} finally {
  if (context) await context.close();
  await rm(temp, {recursive:true,force:true});
}
