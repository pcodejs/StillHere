export function demoState() {
  const now=Date.now();
  const make=(id,sender,conversationName,conversationType,text,minutes,extra={})=>({id,messageId:id,clientId:id,conversationId:conversationName,sender,conversationName,conversationType,text,kind:'text',firstSeen:now-86400000,sentAt:now-(minutes+2)*60000,recalledAt:now-minutes*60000,hasOriginal:true,isSelf:false,...extra});
  return {settings:{consent:true,enabled:true,retentionDays:30},tabs:0,health:[],bytes:0,records:[
    make('sample-1','Minh Anh','Minh Anh','personal','Chiều nay mình gặp nhau lúc 3 giờ nhé. Quán cũ nha!',3),
    make('sample-2','Hoàng Nam','Nhóm làm việc','group','Mình gửi bản thiết kế mới nhất ở đây, mọi người xem giúp mình nhé.',18),
    make('sample-3','Bạn','Minh Anh','personal','Để mình kiểm tra rồi nhắn lại bạn.',42,{isSelf:true}),
    make('sample-4','Thu Hà','Bạn bè cuối tuần','group','Lịch hẹn cuối tuần',70,{kind:'image'}),
    make('sample-5','Minh Anh','Minh Anh','personal','',130,{hasOriginal:false}),
    make('sample-6','Hoàng Nam','Nhóm làm việc','group','Nội dung đang hiển thị',1,{recalledAt:null})
  ]};
}
