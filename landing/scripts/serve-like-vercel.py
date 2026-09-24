"""本機驗證用的靜態伺服器:rewrite 規則直接讀 vercel.json,跟正式站同一份設定。
（npx serve 的 -s 在這台機器沒吃到,而且 -s 會把「任何」404 都導到 index.html,
  反而看不出 vercel.json 少寫了哪條 rewrite。）

⚠️ 2026-09-23 修正:順序改成「先查檔案系統、查不到才套 rewrites」。
   Vercel 的路由順序是 redirects → headers → filesystem → rewrites → 404,
   舊版這支先套 rewrites,跟正式站相反 —— 預渲染之後會驗不出真實行為
   （實體的 restaurants.html 應該贏過 /restaurants 的 rewrite）。
   同時補上 cleanUrls / trailingSlash 的行為。
"""
import http.server, json, os, posixpath, socketserver, sys, urllib.parse

ROOT = os.path.abspath(sys.argv[1])
PORT = int(sys.argv[2])
cfg = json.load(open(os.path.join(ROOT, 'vercel.json'), encoding='utf-8'))
REWRITES = [(r['source'], r['destination']) for r in cfg.get('rewrites', [])]
CLEAN_URLS = bool(cfg.get('cleanUrls'))
TRAILING_SLASH = cfg.get('trailingSlash')


def safe_join(clean):
    """把網址路徑轉成 ROOT 底下的絕對路徑,擋掉 ../ 逃逸。"""
    rel = posixpath.normpath(urllib.parse.unquote(clean)).lstrip('/')
    abs_path = os.path.abspath(os.path.join(ROOT, rel))
    return abs_path if abs_path == ROOT or abs_path.startswith(ROOT + os.sep) else None


def find_file(clean):
    """Vercel 的檔案系統查找:精確檔名 →（cleanUrls）<path>.html → <path>/index.html。"""
    base = safe_join(clean)
    if base is None:
        return None
    if clean == '/':
        idx = os.path.join(ROOT, 'index.html')
        return idx if os.path.isfile(idx) else None
    if os.path.isfile(base):
        return base
    if CLEAN_URLS and os.path.isfile(base + '.html'):
        return base + '.html'
    idx = os.path.join(base, 'index.html')
    return idx if os.path.isfile(idx) else None


def match_rewrite(clean):
    """rewrites 只在「檔案系統查不到」時才套。支援 /news/:slug 這種參數路由。"""
    req_parts = clean.strip('/').split('/') if clean != '/' else ['']
    for source, destination in REWRITES:
        if source == clean:
            return destination
        if ':' not in source:
            continue
        src_parts = source.strip('/').split('/')
        if len(src_parts) != len(req_parts):
            continue
        if all(sp.startswith(':') or sp == rp for sp, rp in zip(src_parts, req_parts)):
            return destination
    return None


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass

    def redirect(self, location):
        self.send_response(308)
        self.send_header('Location', location)
        self.end_headers()

    def resolve(self):
        raw = self.path.split('?', 1)[0].split('#', 1)[0]
        clean = raw.rstrip('/') or '/'

        # trailingSlash: false → /foo/ 導到 /foo
        if TRAILING_SLASH is False and raw != clean and raw != '/':
            return ('redirect', clean + self.path[len(raw):])
        # cleanUrls → /foo.html 導到 /foo
        if CLEAN_URLS and clean.endswith('.html') and clean != '/index.html':
            return ('redirect', clean[:-5])
        if CLEAN_URLS and clean == '/index.html':
            return ('redirect', '/')

        hit = find_file(clean)
        if hit:
            return ('file', hit)
        dest = match_rewrite(clean)
        if dest:
            hit = find_file(dest.rstrip('/') or '/')
            if hit:
                return ('file', hit)
        return ('404', None)

    def do_GET(self):
        kind, value = self.resolve()
        if kind == 'redirect':
            return self.redirect(value)
        if kind == '404':
            self.send_error(404, 'Not Found')
            return
        self.serve_path(value)

    def do_HEAD(self):
        kind, value = self.resolve()
        if kind == 'redirect':
            return self.redirect(value)
        if kind == '404':
            self.send_error(404, 'Not Found')
            return
        self.serve_path(value, head_only=True)

    def serve_path(self, abs_path, head_only=False):
        ctype = self.guess_type(abs_path)
        try:
            f = open(abs_path, 'rb')
        except OSError:
            self.send_error(404, 'Not Found')
            return
        with f:
            stat = os.fstat(f.fileno())
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(stat.st_size))
            self.end_headers()
            if not head_only:
                self.copyfile(f, self.wfile)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


with Server(('127.0.0.1', PORT), H) as httpd:
    print(f'serving {ROOT} on {PORT}; cleanUrls={CLEAN_URLS}, '
          f'rewrites(fallback only)={len(REWRITES)}')
    httpd.serve_forever()
