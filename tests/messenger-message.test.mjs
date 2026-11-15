import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messengerMessage,messengerMessages} from '../src/core/messenger-message.js';
const context={platform:'facebook',conversationId:'123'};
const node=(label,id='sender@msgr.1234567890123456789')=>({getAttribute:key=>({'aria-label':label,'data-message-id':id})[key]});
test('focused message portal retains the empty timeline placeholder position',()=>{
 const before=node('Lúc 17:30, Bạn: before','before');
 const placeholder=node('Lúc 17:43, Bạn','123@msgr.1234567890123456789');
 const after=node('Lúc 17:51, Bạn: after','after');
 const portal=node('Lúc 17:43, Bạn: original','123@msgr.1234567890123456789');
 const messages=messengerMessages([before,placeholder,after,portal],context);
 assert.deepEqual(messages.map(m=>m.messageId),['before','123@msgr.1234567890123456789','after']);
 assert.equal(messages[1].text,'original');
});
test('rendered VI Messenger messages retain stable ID and content punctuation',()=>{
 const result=messengerMessage(node('Lúc 22:13 28 Tháng 3, 2026, Bạn: Nội dung: thử nghiệm\nhai dòng'),context);
 assert.equal(result.messageId,'sender@msgr.1234567890123456789');
 assert.equal(result.text,'Nội dung: thử nghiệm\nhai dòng');
 assert.equal(result.isSelf,true);
 assert.equal(result.messageFingerprint,'22:13 28 Tháng 3, 2026\u0000Bạn');
 assert.equal(messengerMessage(node('Lúc 11:18, Nguyễn: Xin chào'),context).sender,'Nguyễn');
});
test('unidentified nodes and unsupported labels cannot become archived messages',()=>{
 for(const label of ['Đang tải...','Tin nhắn trong cuộc trò chuyện','']) assert.equal(messengerMessage(node(label),context),null);
 assert.equal(messengerMessage(node('Lúc 11:18, Bạn: test',''),context),null);
 assert.equal(messengerMessage(node('Lúc 11:18, Bạn: test'),null),null);
});

test('observed self recall marker requires no content label and exact system body',()=>{
 const recalled=node('Lúc 11:25, Bạn');recalled.innerText='Bạn đã gửi\nBạn đã xóa một tin nhắn';
 assert.equal(messengerMessage(recalled,context).event,'recall');
 assert.equal(messengerMessage(recalled,context).messageFingerprint,'11:25\u0000Bạn');
 const quoted=node('Lúc 11:25, Bạn: Bạn đã xóa một tin nhắn');quoted.innerText='Bạn đã xóa một tin nhắn';
 assert.equal(messengerMessage(quoted,context).event,'snapshot');
 recalled.innerText+='\nordinary message';assert.equal(messengerMessage(recalled,context),null);
});

test('observed English sender label supports tester UI',()=>{
 const result=messengerMessage(node('At 11:30 AM, You: [FSUB TEST] English UI'),context);
 assert.equal(result.isSelf,true);assert.equal(result.text,'[FSUB TEST] English UI');
});

test('received VI recall and English self recall preserve message identity',()=>{
 for(const [label,body,sender,self] of [
  ['Lúc 11:31, Minh','Minh\nMinh đã xóa một tin nhắn','Minh',false],
  ['At 11:31 AM, You','You sent\nYou deleted a message','You',true],
 ]) {
  const item=node(label);item.innerText=body;
  const parsed=messengerMessage(item,context);
  assert.equal(parsed.event,'recall');assert.equal(parsed.sender,sender);
  assert.equal(parsed.isSelf,self);assert.equal(parsed.messageId,'sender@msgr.1234567890123456789');
  item.innerText='Someone else deleted a message';assert.equal(messengerMessage(item,context),null);
 }
});

test('conversation name comes from the enclosing labelled message log only',()=>{
 const item=node('Lúc 11:31, Minh: hello');
 item.closest=()=>({getAttribute:()=> 'Tin nhắn trong cuộc trò chuyện với Minh An'});
 assert.equal(messengerMessage(item,context).conversationName,'Minh An');
 item.closest=()=>({getAttribute:()=> 'Other sidebar preview'});
 assert.equal(messengerMessage(item,context).conversationName,'');
});

test('full sender name uses only an unambiguous in-message avatar button',()=>{
 const item=node('Lúc 11:56, Minh');item.innerText='Minh\nMinh đã xóa một tin nhắn';
 const avatar={alt:'Minh An',width:28,height:28,parentElement:{getAttribute:()=> 'button'}};
 item.querySelectorAll=()=>[avatar];
 assert.equal(messengerMessage(item,context).sender,'Minh An');
 item.querySelectorAll=()=>[{...avatar,width:200,height:200}];
 assert.equal(messengerMessage(item,context).sender,'Minh');
 item.querySelectorAll=()=>[avatar,{...avatar,alt:'Minh Nguyễn'}];
 assert.equal(messengerMessage(item,context).sender,'Minh');
});

test('Facebook sender avatar is constrained to Facebook CDN and message avatar',()=>{
 const item=node('Lúc 11:56, Minh: test');
 const avatar={alt:'Minh An',width:28,height:28,currentSrc:'https://scontent.example.fbcdn.net/avatar.jpg',parentElement:{getAttribute:()=> 'button'}};
 item.querySelectorAll=()=>[avatar];
 assert.equal(messengerMessage(item,context).senderAvatar,avatar.currentSrc);
 avatar.currentSrc='https://attacker.example/avatar.jpg';
 assert.equal(messengerMessage(item,context).senderAvatar,'');
});
