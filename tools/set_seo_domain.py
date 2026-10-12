#!/usr/bin/env python3
"""Change the canonical domain from the currently bundled URL to a new owned HTTPS domain.
Usage: python tools/set_seo_domain.py https://new-domain.example
"""
from pathlib import Path
from urllib.parse import urlparse
import sys
BASE='https://athave.in'
if len(sys.argv)!=2: raise SystemExit('Usage: python tools/set_seo_domain.py https://verified-domain')
new=sys.argv[1].rstrip('/')
p=urlparse(new)
if p.scheme!='https' or not p.netloc or p.path or p.query or p.fragment: raise SystemExit('Use HTTPS origin only')
root=Path(__file__).resolve().parents[1]/'public'
count=0
for f in root.rglob('*'):
 if f.is_file() and f.suffix in {'.html','.xml','.txt'}:
  text=f.read_text(encoding='utf-8')
  if BASE in text:
   f.write_text(text.replace(BASE,new),encoding='utf-8');count+=1
print(f'Updated {count} public files. Validate DNS, sitemap and redirects before deploying.')
