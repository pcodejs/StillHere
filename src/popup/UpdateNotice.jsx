import React,{useEffect,useState} from 'react';
import IconSparkles from '@tabler/icons-react/dist/esm/icons/IconSparkles.mjs';
export default function UpdateNotice({language='vi'}){
 const [notice,setNotice]=useState(null);
 useEffect(()=>{let live=true;chrome.storage.local.get('releaseNotice').then(r=>{if(live)setNotice(r.releaseNotice||null);});return()=>{live=false;};},[]);
 if(!notice)return null;const en=language==='en';
 return <div className="update-notice" role="status"><IconSparkles size={16} aria-hidden="true"/><span>{en?'Updated to':'Đã cập nhật'} <strong>StillHere {notice.version}</strong></span><a href={en?'changelog-en.html':'changelog.html'} target="_blank" rel="noreferrer">{en?"What's new":'Xem điểm mới'}</a><button aria-label={en?'Dismiss update notice':'Đóng thông báo cập nhật'} onClick={async()=>{await chrome.storage.local.remove('releaseNotice');setNotice(null);}}>×</button></div>;
}
