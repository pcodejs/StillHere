// Isolated UI, localization and automation acceptance. No personal profile or live service.
import {chromium,expect} from '@playwright/test';
import {mkdtemp,cp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'fsub-ui-063-'));let context;
const shots=process.env.STILLHERE_SCREENSHOTS||'outputs/screenshots';
try{
 await mkdir(shots,{recursive:true});const extension=join(root,'extension');await cp(resolve('outputs/go-lai-extension'),extension,{recursive:true});
 context=await chromium.launchPersistentContext(join(root,'profile'),{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--disable-gpu',`--load-extension=${extension}`,`--disable-extensions-except=${extension}`],viewport:{width:800,height:600}});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host,page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const outbound=[];context.on('request',r=>{if(/^https?:/.test(r.url()))outbound.push(r.url());});
 await page.goto(`chrome-extension://${id}/popup.html?popup=1&demo=1`);await expect(page.locator('.message')).toHaveCount(5);await expect(page.locator('#expand')).toHaveCount(0);await expect(page.locator('.sidebar-brand strong')).toHaveCount(0);await expect(page.locator('.primary-nav .nav-button')).toHaveCount(3);await expect(page.locator('.platform-picker .platform-logo')).toHaveCount(2);await expect.poll(()=>page.locator('.platform-picker .platform-logo').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);expect(await page.locator('.detail-content').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');await page.evaluate(()=>document.fonts.ready);await page.screenshot({animations:'disabled',path:join(shots,'02-popup-demo.png')});await page.goto(`chrome-extension://${id}/popup.html?demo=1`);await expect(page.locator('.message')).toHaveCount(5);await page.setViewportSize({width:360,height:600});await page.screenshot({animations:'disabled',path:join(shots,'03-narrow-demo.png')});await page.setViewportSize({width:800,height:600});
 await page.locator('#facebook-button').click();await expect(page.locator('#facebook-button')).toHaveAttribute('aria-pressed','true');await expect(page.locator('.message')).toHaveCount(0);await expect(page.locator('#archive-button')).toHaveAttribute('aria-pressed','true');await page.locator('#zalo-button').click();await expect(page.locator('.message')).toHaveCount(5);
 for(const [button,section,file] of [['feedback','feedback','08-feedback'],['settings','settings','04-settings-demo'],['about','about','12-about']]){if(['feedback','about'].includes(button))await page.locator('.more-menu').click();await page.locator('#'+button+'-button').click();await expect(page.locator('#'+section)).toBeVisible();if(button==='about')await expect.poll(()=>page.locator('#about .welcome-art').evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);await page.screenshot({animations:'disabled',path:join(shots,`${file}.png`)});if(button==='feedback'){await page.setViewportSize({width:360,height:600});await page.screenshot({animations:'disabled',path:join(shots,'09-feedback-narrow.png')});await page.setViewportSize({width:800,height:600});}}
 await page.locator('#support-button').click();await expect(page.locator('#support-qr')).toBeVisible();await expect.poll(()=>page.locator('#support-qr').evaluate(i=>i.complete&&i.naturalWidth===512)).toBe(true);await page.screenshot({animations:'disabled',path:join(shots,'11-support.png')});await expect(page.locator('.payment-brands img')).toHaveCount(2);expect(await page.locator('#support-disclosure').evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('footer').getBoundingClientRect().top&&el.getBoundingClientRect().bottom<=document.querySelector('#support-qr').getBoundingClientRect().top)).toBe(true);expect(await page.locator('.payment-brands img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
 await page.getByText('EN',{exact:true}).click();await expect(page.locator('#support')).toContainText('Support StillHere');expect(await page.locator('#archive-button').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(60);await page.screenshot({animations:'disabled',path:join(shots,'13-english.png')});await page.locator('#archive-button').click();await page.screenshot({animations:'disabled',path:join(shots,'15-archive-english.png')});
 for(const width of [360,400,620,800,1024,1280]){await page.setViewportSize({width,height:600});for(const view of ['archive','feedback','about','diagnostics','settings']){if(['feedback','about'].includes(view))await page.locator('.more-menu').click();await page.locator('#'+view+'-button').click();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('.primary-nav .nav-button').evaluateAll(elements=>elements.every(el=>{const box=el.getBoundingClientRect();return box.width>0&&box.right<=innerWidth;}))).toBe(true);}await page.locator('#support-button').click();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('.primary-nav .nav-button').evaluateAll(elements=>elements.every(el=>{const box=el.getBoundingClientRect();return box.width>0&&box.right<=innerWidth;}))).toBe(true);if(width===360)await page.screenshot({animations:'disabled',path:join(shots,'14-support-narrow.png')});}
 await page.setViewportSize({width:1280,height:800});await page.locator('#archive-button').click();
 expect(await page.locator('.app-shell').evaluate(el=>({left:el.getBoundingClientRect().left,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))).toEqual({left:0,width:1280,height:800});
 expect(await page.locator('.message-body').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
 await page.screenshot({animations:'disabled',path:join(shots,'16-full-width.png')});
 // A fresh narrow viewport avoids resize-compositor artifacts and verifies usable reading space.
 const narrow=await context.newPage();await narrow.setViewportSize({width:360,height:600});
 await narrow.goto(`chrome-extension://${id}/popup.html?demo=1`);
 await expect(narrow.locator('.message')).toHaveCount(5);await narrow.evaluate(()=>document.fonts.ready);
 await expect(narrow.locator('#archive-filters')).toBeHidden();
 expect(await narrow.locator('.archive-panes').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(180);
 await narrow.locator('.filter-toggle').click();await expect(narrow.locator('#archive-filters')).toBeVisible();
 await narrow.getByText('Nhóm',{exact:true}).click();
 await expect(narrow.locator('.filter-toggle')).toContainText('1');
 await expect(narrow.locator('.message')).toHaveCount(2);
 await narrow.getByText('Tất cả',{exact:true}).click();
 await narrow.locator('.filter-toggle').click();await expect(narrow.locator('#archive-filters')).toBeHidden();
 await narrow.screenshot({animations:'disabled',path:join(shots,'narrow-archive-fresh.png')});await narrow.close();
 // Keyboard focus follows the narrow master/detail transition and returns to the selected row.
 for(const width of [360,620]){await page.setViewportSize({width,height:600});await page.locator('#archive-button').click();await page.locator('.message').first().click();await expect(page.locator('.detail-header h2')).toBeFocused();await page.locator('.mobile-back').click();await expect(page.locator('.message.current')).toBeFocused();}
 await page.locator('#search').fill('Chiều nay');
 await page.locator('#search').press('Enter');
 await expect(page.locator('.detail-header h2')).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(page.locator('.message.current')).toBeFocused();
 await page.locator('#search').fill('');
 await expect(page.locator('.app-shell > header')).toHaveCount(1);
 await expect(page.locator('.app-shell > footer')).toHaveCount(1);
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.archive').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 // Public UI: both languages, empty search and keyboard-reachable form action.
 for(const lang of ['VI','EN']) {
  await page.getByText(lang,{exact:true}).click();
  await page.setViewportSize({width:800,height:600});
  await page.locator('#archive-button').click();
  await page.locator('#search').fill('no-fixture-matches-7391');
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('.message')).toHaveCount(0);
  await page.locator('#search').fill('');
  await expect(page.locator('.message')).toHaveCount(5);
  await page.locator('.more-menu').click();await page.locator('#feedback-button').click();
  await page.locator('#feedback-submit').scrollIntoViewIfNeeded();
  await expect.poll(()=>page.locator('#feedback-submit').evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,footer:document.querySelector('footer').getBoundingClientRect().top};})).toMatchObject({top:expect.any(Number)});
  const bounds=await page.locator('#feedback-submit').evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,footer:document.querySelector('footer').getBoundingClientRect().top};});console.log('feedback bounds',lang,bounds);expect(bounds.top>=0&&bounds.bottom<=bounds.footer).toBe(true);
 }
 // Branding is local, preserves the approved image ratio and fits beside language controls.
 await expect(page.locator('header h1')).toHaveAccessibleName('StillHere – Unsend Message Viewer');
 await expect.poll(()=>page.locator('.product-wordmark img').evaluate(i=>i.complete&&i.naturalWidth===1960&&i.naturalHeight===532)).toBe(true);
 for(const width of [360,620,800,1280]) {
  await page.setViewportSize({width,height:600});
  expect(await page.evaluate(()=>{
   const mark=document.querySelector('.product-wordmark img').getBoundingClientRect();
   const actions=document.querySelector('.header-actions').getBoundingClientRect();
   return mark.width>100&&Math.abs(mark.width/mark.height-3.684)<0.03&&mark.right<actions.left;
  })).toBe(true);
 }
 await page.locator('.more-menu').click();await page.locator('#about-button').click();
 await expect(page.locator('#about a[href="https://www.facebook.com/profile.php?id=61596131866684"]')).toBeVisible();
 await expect(page).toHaveTitle(/StillHere/);
 expect(outbound).toEqual([]);
 // Real extension preference APIs, but only fictional feedback entered by this test.
 await page.setViewportSize({width:800,height:600});await page.goto(`chrome-extension://${id}/popup.html`);await expect(page.locator('#vault-password')).toBeVisible();await page.evaluate(()=>document.fonts.ready);await page.screenshot({animations:'disabled',path:join(shots,'17-vault-setup.png')});await page.setViewportSize({width:360,height:600});await page.screenshot({animations:'disabled',path:join(shots,'narrow-vault-setup.png')});await page.setViewportSize({width:800,height:600});expect(await page.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'Fixture password 054 secure'}))).toMatchObject({unlocked:true});await page.reload();await expect(page.locator('#onboarding')).toBeVisible();await expect.poll(()=>page.locator('#onboarding .welcome-art').evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);await page.screenshot({animations:'disabled',path:join(shots,'20-onboarding.png')});await page.setViewportSize({width:360,height:600});await page.screenshot({animations:'disabled',path:join(shots,'narrow-onboarding.png')});await page.setViewportSize({width:800,height:600});await expect(page.locator('#demo')).toHaveCount(0);await page.locator('#settings-button').click();await expect(page.locator('#settings-demo')).toHaveCount(0);await page.locator('#archive-button').click();await page.getByText('EN',{exact:true}).click();await expect.poll(()=>worker.evaluate(async()=>(await chrome.storage.local.get('uiPreferences')).uiPreferences?.language)).toBe('en');
 await page.locator('.more-menu').click();await page.locator('#feedback-button').click();await page.locator('#feedback-message').fill('Draft retained after closing the popup.');await page.locator('#feedback-email').fill('draft@example.test');await page.locator('#feedback-consent').check();await expect(page.locator('#telegram-settings')).toHaveCount(0);await expect.poll(()=>page.locator('.draft-row').textContent()).toContain('Draft saved locally');
 const raw=await worker.evaluate(()=>chrome.storage.local.get(null));expect(JSON.stringify(raw)).not.toContain('Draft retained');expect(JSON.stringify(raw)).not.toContain('draft@example.test');
 await page.close();const reopened=await context.newPage();await reopened.goto(`chrome-extension://${id}/popup.html?feedback=1`);await expect(reopened.locator('#feedback-message')).toHaveValue('Draft retained after closing the popup.');await expect(reopened.locator('#feedback-consent')).not.toBeChecked();await expect(reopened.locator('#feedback-submit')).toHaveText('Compose feedback email');
 await reopened.evaluate(()=>chrome.runtime.sendMessage({type:'SETTINGS',consent:true,enabled:true,retentionDays:30}));await reopened.goto(`chrome-extension://${id}/popup.html`);await reopened.locator('.filter-toggle').click();await reopened.getByText('Group',{exact:true}).click();await reopened.locator('#who').click();await reopened.getByRole('option',{name:'You',exact:true}).click();await reopened.locator('#search').fill('not persisted');await expect.poll(()=>worker.evaluate(async()=>(await chrome.storage.local.get('uiPreferences')).uiPreferences?.who)).toBe('self');await reopened.reload();await reopened.locator('.filter-toggle').click();await expect(reopened.locator('#who')).toHaveValue('You');await expect(reopened.locator('#search')).toHaveValue('');await expect(reopened.getByRole('radio',{name:'Group',exact:true})).toBeChecked();
 // Serial narrow evidence for every destination; the captured UI contains one header/footer.
 await reopened.setViewportSize({width:360,height:600});
 await reopened.getByText('VI',{exact:true}).click();
 for(const view of ['feedback','settings','about']) {
  if(view!=='settings') await reopened.locator('.more-menu').click();
  await reopened.locator('#'+view+'-button').click();
  await reopened.locator('#main-content').evaluate(el=>{el.scrollTop=0;});
  await reopened.screenshot({animations:'disabled',path:join(shots,`narrow-${view}.png`)});
 }
 await reopened.locator('#support-button').click();
 await reopened.locator('#main-content').evaluate(el=>{el.scrollTop=0;});
 expect(await reopened.locator('#support-disclosure').evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('footer').getBoundingClientRect().top)).toBe(true);
 await reopened.screenshot({animations:'disabled',path:join(shots,'narrow-support-top.png')});
 await reopened.locator('.qr-card').scrollIntoViewIfNeeded();
 expect(await reopened.locator('#support-qr').evaluate(el=>{const r=el.getBoundingClientRect();const m=document.querySelector('#main-content').getBoundingClientRect();return r.top>=m.top&&r.bottom<=m.bottom;})).toBe(true);
 expect(await reopened.locator('.app-shell>header').count()).toBe(1);
 expect(await reopened.locator('.app-shell>footer').count()).toBe(1);
 await reopened.screenshot({animations:'disabled',path:join(shots,'narrow-support-qr.png')});
 // Capture the actual password and onboarding surfaces, using the same disposable profile.
 await reopened.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_LOCK'}));
 await reopened.goto(`chrome-extension://${id}/popup.html`);
 await expect(reopened.locator('#vault-password')).toBeVisible();
 await reopened.evaluate(()=>document.fonts.ready);
 await reopened.screenshot({animations:'disabled',path:join(shots,'18-vault-unlock.png')});await reopened.setViewportSize({width:360,height:600});await reopened.screenshot({animations:'disabled',path:join(shots,'narrow-vault-unlock.png')});
 const privacy=await context.newPage();
 for(const [file,lang] of [['privacy.html','vi'],['privacy-en.html','en']]) {
  await privacy.goto(`chrome-extension://${id}/${file}`);
  await privacy.evaluate(()=>document.fonts.ready);
  await expect(privacy.locator('.policy-toc')).toBeVisible();
  for(const sectionId of ['section-1','section-7','section-16']){
   await privacy.locator('#'+sectionId).scrollIntoViewIfNeeded();
   await privacy.evaluate(id=>document.getElementById(id).scrollIntoView({block:'start'}),sectionId);
   await expect(privacy.locator('.policy-toc a[aria-current="location"]')).toHaveAttribute('href','#'+sectionId);
  }

  expect(await privacy.locator('.policy-toc a').count()).toBeGreaterThan(8);
  expect(await privacy.locator('.policy-toc a').evaluateAll(links=>links.every(a=>document.querySelector(a.getAttribute('href'))))).toBe(true);
  expect(await privacy.locator('body').evaluate(el=>getComputedStyle(el).fontFamily)).toContain('Be Vietnam Pro');
  for(const width of [360,800]) {
   await privacy.setViewportSize({width,height:600});
   expect(await privacy.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(width===360)await privacy.screenshot({animations:'disabled',path:join(shots,`narrow-privacy-${lang}.png`)});
  }
  await privacy.screenshot({animations:'disabled',path:join(shots,`19-privacy-${lang}.png`)});
 }
 await privacy.close();
 expect(errors).toEqual([]);console.log('PASS: Mantine 800x600 layout, local font/QR, VI/EN, 360/400/620/800/1024/1280 widths and full viewport layout, narrow focus, reduced motion, no outbound demo traffic, language/filter persistence, encrypted draft restoration, no saved consent or search.');
}finally{await context?.close();await rm(root,{recursive:true,force:true});}
