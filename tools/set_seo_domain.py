#!/usr/bin/env python3
"""Set canonical root when you VERIFY ownership of a custom domain.
Example: python tools/set_seo_domain.py https://athave.in
No spaces/trailing slash; run before uploading changed public files.
"""
from pathlib import Path
from urllib.parse import urlparse
import sys
BASE='https://athave-ai.pages.dev'
if len(sys.argv)!=2:raise SystemExit('Usage: python tools/set_seo_domain.py https://your-verified-domain')
new=sys.argv[1].rstrip('/')
p=urlparse(new)
if p.scheme!='https' or not p.netloc or p.path or p.query or p.fragment:raise SystemExit('Use HTTPS origin only, e.g. https://athave.in')
root=Path(__file__).resolve().parents[1]/'public'
n=0
for f in root.rglob('*'):
 if f.suffix not in ['.html','.xml','.txt']:continue
 content=f.read_text()
 if BASE in content:
  f.write_text(content.replace(BASE,new));n+=1
print('Updated URLs in',n,'files. Verify new domain DNS and Cloudflare routes before deployment.')
