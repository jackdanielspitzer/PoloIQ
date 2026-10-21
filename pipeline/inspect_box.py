import sys,re
sys.path.insert(0,'.')
import net
from bs4 import BeautifulSoup
url=sys.argv[1]
html=net.get(url,max_age=None)
soup=BeautifulSoup(html,'html.parser')
print('title:',soup.title.get_text(' ',strip=True)[:120] if soup.title else None, 'len',len(html))
for i,t in enumerate(soup.find_all('table')):
    rows=[[c.get_text(' ',strip=True) for c in tr.find_all(['td','th'])] for tr in t.find_all('tr')]
    if not rows: continue
    cap=t.find('caption'); capt=cap.get_text(' ',strip=True) if cap else ''
    # preceding heading
    prev=[]
    el=t
    for _ in range(40):
        el=el.find_previous(['h1','h2','h3','h4','h5','caption','strong'])
        if el is None: break
        tx=el.get_text(' ',strip=True)
        if tx and tx not in prev: prev.append(tx[:60])
        if len(prev)>=2: break
    print(f'--- table {i} cap={capt!r} prev={prev} rows={len(rows)}')
    print('   head:',rows[0][:16])
    if len(rows)>1: print('   r1  :',rows[1][:16])
    if len(rows)>2: print('   last:',rows[-1][:16])
