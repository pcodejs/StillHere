import React, {useEffect, useRef, useState} from 'react';

const sections = ['platforms', 'storage', 'security', 'backup', 'delete'];
export default function SettingsIndex({language}) {
  const nav = useRef(null);
  const requested = useRef(null);
  const [active, setActive] = useState('platforms');
  useEffect(() => {
    const root = nav.current?.closest('main');
    const page = nav.current?.closest('#settings');
    if (!root || !page) return;
    let frame;
    const update = () => {
      const height = nav.current.getBoundingClientRect().height;
      page.style.setProperty('--settings-index-height', `${height}px`);
      const threshold = root.getBoundingClientRect().top + height + 20;
      let current = sections[0];
      for (const id of sections) {
        const heading = page.querySelector(`#settings-${id}`);
        if (heading && heading.getBoundingClientRect().top <= threshold) current = id;
      }
      if (requested.current) current = requested.current;
      setActive(current);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(nav.current);
    observer.observe(root);
    const manual = () => { requested.current = null; schedule(); };
    const pointer = event => { if (!nav.current.contains(event.target)) manual(); };
    root.addEventListener('pointerdown', pointer);
    root.addEventListener('wheel', manual, {passive:true});
    root.addEventListener('touchmove', manual, {passive:true});
    root.addEventListener('keydown', manual);
    root.addEventListener('scroll', schedule, {passive:true});
    update();
    return () => { observer.disconnect(); root.removeEventListener('pointerdown', pointer); root.removeEventListener('wheel', manual); root.removeEventListener('touchmove', manual); root.removeEventListener('keydown', manual); root.removeEventListener('scroll', schedule); cancelAnimationFrame(frame); };
  }, [language]);
  const labels = language === 'en'
    ? ['Platforms & access', 'Storage', 'Security', 'Backup', 'Delete data']
    : ['Nền tảng & quyền', 'Lưu trữ', 'Bảo mật', 'Sao lưu', 'Xoá dữ liệu'];
  return <nav ref={nav} className="settings-index" aria-label={language === 'en' ? 'Settings sections' : 'Các mục cài đặt'}>
    {sections.map((id,index) => <a key={id} href={`#settings-${id}`} onClick={() => {requested.current = id; setActive(id);}} aria-current={active === id ? 'location' : undefined}>{labels[index]}</a>)}
  </nav>;
}
