const sections=[...document.querySelectorAll('.policy-section')];
const links=[...document.querySelectorAll('.policy-toc a')];let scheduled=false;
function update(){scheduled=false;if(!sections.length)return;const bottom=innerHeight+scrollY>=document.documentElement.scrollHeight-4;let current=sections[0];for(const section of sections){if(section.getBoundingClientRect().top<=140)current=section;}if(bottom)current=sections.at(-1);for(const link of links){if(link.hash==='#'+current.id)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}}
addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(update);}},{passive:true});addEventListener('resize',update);addEventListener('hashchange',update);update();
