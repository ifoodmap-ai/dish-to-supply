"""本機驗證用的靜態伺服器:rewrite 規則直接讀 vercel.json,跟正式站同一份設定。
（npx serve 的 -s 在這台機器沒吃到,而且 -s 會把「任何」404 都導到 index.html,
  反而看不出 vercel.json 少寫了哪條 rewrite。）"""
import http.server, json, os, socketserver, sys

ROOT = sys.argv[1]
PORT = int(sys.argv[2])
cfg = json.load(open(os.path.join(ROOT, 'vercel.json'), encoding='utf-8'))
REWRITES = {r['source']: r['destination'] for r in cfg.get('rewrites', [])}

class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean = path.split('?', 1)[0].split('#', 1)[0].rstrip('/') or '/'
        if clean in REWRITES or clean == '/':
            return os.path.join(ROOT, 'index.html')
        return super().translate_path(path)

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), H) as httpd:
    print(f'serving {ROOT} on {PORT}, rewrites: {sorted(REWRITES)}')
    httpd.serve_forever()
