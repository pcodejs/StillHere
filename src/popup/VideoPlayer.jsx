import React, {useEffect, useRef, useState} from 'react';
import {Button} from '@mantine/core';
import IconPlayerPlay from '@tabler/icons-react/dist/esm/icons/IconPlayerPlay.mjs';
import IconPlayerPause from '@tabler/icons-react/dist/esm/icons/IconPlayerPause.mjs';
import IconVolume from '@tabler/icons-react/dist/esm/icons/IconVolume.mjs';
import IconVolumeOff from '@tabler/icons-react/dist/esm/icons/IconVolumeOff.mjs';
import IconArrowsMaximize from '@tabler/icons-react/dist/esm/icons/IconArrowsMaximize.mjs';

function timeLabel(seconds) {
  const value=Number.isFinite(seconds)?Math.max(0,Math.floor(seconds)):0;
  return Math.floor(value/60)+':'+String(value%60).padStart(2,'0');
}

// Keep keyboard focus in ordinary controls. Chrome's built-in media controls
// handle Escape outside the document and can dismiss an entire action popup.
export default function VideoPlayer({url, t, expanded=false, onExpand, onError, onReady}) {
  const video=useRef(null);
  const [playing,setPlaying]=useState(false);
  const [position,setPosition]=useState(0);
  const [duration,setDuration]=useState(0);
  const [muted,setMuted]=useState(false);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    setPlaying(false);setPosition(0);setDuration(0);setReady(false);
  },[url]);
  async function togglePlay() {
    const player=video.current;
    if(!player)return;
    if(!player.paused){player.pause();return;}
    try{await player.play();onReady?.();}catch{onError?.();}
  }
  return <div className={'video-player'+(expanded?' video-player-expanded':'')}>
    <video ref={video} className={expanded?'expanded-video':undefined}
      src={url||undefined} preload="metadata" playsInline tabIndex={-1} muted={muted}
      onLoadedMetadata={()=>{
        const length=video.current?.duration;
        setDuration(Number.isFinite(length)?length:0);setReady(true);
      }}
      onLoadedData={()=>onReady?.()}
      onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
      onEnded={()=>setPlaying(false)}
      onTimeUpdate={()=>setPosition(video.current?.currentTime||0)}
      onError={()=>{setReady(false);setPlaying(false);onError?.();}}/>
    <div className="video-timeline">
      <input type="range" aria-label={t('videoPosition')} min="0" max={duration||0}
        step="0.1" value={Math.min(position,duration)} disabled={!ready||!duration}
        aria-valuetext={timeLabel(position)+' / '+timeLabel(duration)}
        onChange={event=>{
          const next=Math.min(duration,Math.max(0,Number(event.target.value)));
          if(video.current)video.current.currentTime=next;
          setPosition(next);
        }}/>
      <output aria-live="off">{timeLabel(position)} / {timeLabel(duration)}</output>
    </div>
    <div className="media-controls">
      <Button className="media-play-video" variant="light" size="xs" disabled={!url||!ready}
        leftSection={playing?<IconPlayerPause size={14}/>:<IconPlayerPlay size={14}/>}
        onClick={togglePlay}>{t(playing?'pauseVideo':'playVideo')}</Button>
      <Button variant="subtle" size="xs" disabled={!url||!ready} aria-pressed={muted}
        leftSection={muted?<IconVolumeOff size={14}/>:<IconVolume size={14}/>}
        onClick={()=>setMuted(value=>!value)}>{t(muted?'unmuteVideo':'muteVideo')}</Button>
      {onExpand&&<Button className="media-expand-video" variant="subtle" size="xs"
        disabled={!url||!ready} leftSection={<IconArrowsMaximize size={14}/>}
        onClick={()=>{video.current?.pause();onExpand();}}>{t('expandVideo')}</Button>}
    </div>
  </div>;
}
