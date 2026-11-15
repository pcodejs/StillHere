import {chromium,expect} from '@playwright/test';
import {mkdtemp,cp,rm,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:https';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=await mkdtemp(resolve(tmpdir(),'fsub-cdn-redirect-'));
let context,server;
try {
 const key=resolve(root,'key.pem'),cert=resolve(root,'cert.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=fixture.fbcdn.net'],{stdio:'ignore'});
 const png=await readFile('src/icons/128.png');
 let outsideRequests=0,port;
 server=createServer({key:await readFile(key),cert:await readFile(cert)},(request,response)=>{
  const host=request.headers.host.split(':')[0];
  if(host==='outside.fixture.invalid')outsideRequests++;
  if(request.url==='/media.png'){
   response.writeHead(200,{'content-type':'image/png'});response.end(png);return;
  }
  const target=request.url==='/outside'?'outside.fixture.invalid':host.endsWith('.dlfl.vn')?'file-stal-2-te-vnso-pt-65.flchat.vn':'video.fixture.fbcdn.net';
  response.writeHead(302,{location:`https://${target}:${port}/media.png`});response.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port;
 const extension=resolve(root,'extension');await cp(resolve('outputs/go-lai-extension'),extension,{recursive:true});
 const path=resolve(extension,'manifest.json');const manifest=JSON.parse(await readFile(path,'utf8'));
 manifest.host_permissions=manifest.optional_host_permissions;
 // Only the disposable fixture accepts the loopback server's random TLS port.
 for(const domain of ['fbcdn.net','dlfl.vn','flchat.vn'])manifest.content_security_policy.extension_pages=manifest.content_security_policy.extension_pages.replace('https://*.'+domain,'https://*.'+domain+':'+port);
 await writeFile(path,JSON.stringify(manifest));
 context=await chromium.launchPersistentContext(resolve(root,'profile'),{channel:'chromium',headless:true,ignoreHTTPSErrors:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`,'--no-proxy-server','--ignore-certificate-errors','--host-resolver-rules=MAP *.fixture.fbcdn.net 127.0.0.1,MAP *.dlfl.vn 127.0.0.1,MAP *.flchat.vn 127.0.0.1,MAP outside.fixture.invalid 127.0.0.1']});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 context.on('requestfailed',request=>console.log('Fixture request failed',request.url(),request.failure()?.errorText));
 const fetchFixture=source=>worker.evaluate(async source=>{
  try {
   const response=await fetch(source,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'follow',signal:AbortSignal.timeout(8000)});
   return {ok:response.ok,url:response.url,bytes:(await response.arrayBuffer()).byteLength};
  }catch{return {ok:false};}
 },source);
 expect(await fetchFixture(`https://scontent.fixture.fbcdn.net:${port}/allowed`)).toEqual({ok:true,url:`https://video.fixture.fbcdn.net:${port}/media.png`,bytes:png.length});
 expect(await fetchFixture(`https://scontent.fixture.fbcdn.net:${port}/outside`)).toEqual({ok:false});
 expect(await fetchFixture(`https://file-stal-2.dlfl.vn:${port}/allowed`)).toEqual({ok:true,url:`https://file-stal-2-te-vnso-pt-65.flchat.vn:${port}/media.png`,bytes:png.length});
 expect(await fetchFixture(`https://file-stal-2.dlfl.vn:${port}/outside`)).toEqual({ok:false});
 expect(outsideRequests).toBe(0);
 console.log('PASS: MV3 worker follows Facebook and Zalo dlfl-to-flchat CDN redirects; CSP blocks outside redirects before they reach the loopback HTTPS server. Synthetic network, temporary profile and fixture-only TLS exceptions.');
} finally {
 await context?.close();
 if(server)await new Promise(resolve=>server.close(resolve));
 await rm(root,{recursive:true,force:true});
}
