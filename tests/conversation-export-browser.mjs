import {chromium,expect} from '@playwright/test';
import {conversationExport} from '../src/core/conversation-export.js';
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage();let requests=0;
 await page.route('https://**/*',r=>{requests++;return r.abort();});
 const text='<img src="https://example.com/leak" onerror="window.pwned=true"><script>window.pwned=true</script>';
 const html=conversationExport([{platform:'zalo',conversationId:'x',conversationName:'QA export',sender:'Tester',text,kind:'text',hasOriginal:true,firstSeen:1000,recalledAt:2000}],'zalo','x','html','en').content;
 await page.setContent(html);
 await expect(page.locator('.message')).toHaveText(text);
 expect(await page.evaluate(()=>window.pwned)).toBeUndefined();expect(requests).toBe(0);
 expect(await page.locator('script,img').count()).toBe(0);
 console.log('PASS exported HTML displays hostile text literally with no scripts/images or outbound requests');
}finally{await browser.close();}
