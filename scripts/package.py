"""Package only audited source/build inputs, never browser profiles or chat data."""
from pathlib import Path
import json,zipfile,hashlib,re

root=Path(__file__).resolve().parent.parent
out=root/'outputs'
version=json.loads((root/'src/manifest.json').read_text())['version']

def archive(path,entries):
    # Validate every input before creating or replacing a deliverable. Build
    # artifacts must not inherit local configuration or old release documents.
    names=set()
    for file,name in entries:
        if not file.is_file():raise ValueError(f'Missing package input: {file.name}')
        if name in names:raise ValueError(f'Duplicate package entry: {name}')
        names.add(name)
        if file.name.startswith('.env') and file.name!='.env.example':raise ValueError('Private configuration cannot be packaged')
        if re.search(rb'\d{8,12}:[A-Za-z0-9_-]{30,}',file.read_bytes()):raise ValueError(f'Bot credential pattern in: {name}')
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        for file,name in sorted(entries,key=lambda item:item[1]):z.write(file,name)
    print(path.name,path.stat().st_size,'bytes')

extension=out/'go-lai-extension'
if json.loads((extension/'manifest.json').read_text())['version']!=version:raise ValueError('Build version does not match source; run npm run build')
stamp=extension/'build-inputs.json'
if not stamp.is_file():raise ValueError('Build provenance missing; run npm run build')
inputs=json.loads(stamp.read_text())
current={str(p.relative_to(root)) for folder in ['src','scripts'] for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts}
current.update(['package.json','package-lock.json'])
if set(inputs)!=current:raise ValueError('Build inputs changed; run npm run build')
for name,digest in inputs.items():
    if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:raise ValueError(f'Stale build input: {name}; run npm run build')
archive(out/f'stillhere-{version}-chrome.zip',[(p,str(p.relative_to(extension))) for p in extension.rglob('*') if p.is_file()])
entries=[]
for folder in ['src','scripts','tests']:
    entries.extend((p,str(p.relative_to(root))) for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and (not p.name.startswith('.env') or p.name=='.env.example'))
for name in ['package.json','package-lock.json','LICENSE','PRODUCT.md','DESIGN.md','BRAND.md','.impeccable/design.json','.gitignore']:
    if (root/name).is_file():entries.append((root/name,name))
readme=out/'README.md' if (out/'README.md').is_file() else root/'README.md'
entries.append((readme,'README.md'))
for name in ['UI-ACCEPTANCE.md','ACCEPTANCE-RUNBOOK.md']:
    if (out/name).is_file():entries.append((out/name,name))
review=out/f'finish-review-{version.replace(".","")}.md'
if review.is_file():entries.append((review,'finish-review.md'))
release=out/'release-notes'/f'RELEASE-{version.replace(".","")}.md'
if release.is_file():entries.append((release,'release-notes/'+release.name))
archive(out/f'stillhere-{version}-source.zip',entries)
# Privacy pages are already embedded in the extension. Store screenshots and
# older hosted-policy exports are reviewed independently, never silently reused.
suffixes=['chrome','source']
hashes=[]
for suffix in suffixes:
    p=out/f'stillhere-{version}-{suffix}.zip'
    hashes.append(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name)
(out/'SHA256SUMS.txt').write_text('\n'.join(hashes)+'\n')
