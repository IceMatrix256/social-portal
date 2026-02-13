import http.server
import socketserver
import urllib.request
import urllib.error
import os
import sys
import socket
import ssl
import random

PORT = 8090
script_dir = os.path.dirname(os.path.abspath(__file__))
# Check multiple locations for dist/
# 1. Sibling directory (if server.py and dist/ are in same folder)
# 2. Parent's dist/ (if server.py is in scripts/)
DIST_DIR = None
possible_paths = [
    os.path.join(script_dir, 'dist'),
    os.path.join(os.path.dirname(script_dir), 'dist')
]

for p in possible_paths:
    if os.path.exists(p) and os.path.isdir(p):
        DIST_DIR = p
        break

if not DIST_DIR:
    # Default to sibling if not found (will error later)
    DIST_DIR = possible_paths[0]

PROXIES = {
    '/api/reddit': 'https://www.reddit.com',
    '/api/mastodon': 'https://mastodon.social',
    '/api/nostr': 'https://api.nostr.band',
    '/api/lemmy': 'https://lemmy.world',
    '/api/custom-feed': 'https://piefed.social',
    '/api/misskey': 'https://misskey.io',
    '/api/misskey-design': 'https://misskey.design',
    '/api/bluesky': 'https://public.api.bsky.app',
}

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
]

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def do_GET(self):
        # Proxy Logic
        for prefix, target in PROXIES.items():
            if self.path.startswith(prefix):
                self.handle_proxy(target, prefix)
                return

        # SPA Logic: If file doesn't exist, serve index.html
        path = self.translate_path(self.path)
        if not os.path.exists(path) or os.path.isdir(path):
            # Try serving as static file first (in case it IS a file but translate_path messed up? No.)
            # If standard handler can't find it, serve index.html
            # But SimpleHTTPRequestHandler is tricky to override properly for fallback.
            # Easier approach: Check if path matches a file extension we expect? 
            # Or just check existence.
            if not os.path.exists(path):
                self.path = '/index.html'
        
        super().do_GET()

    def handle_proxy(self, target_base, prefix):
        # Construct target URL
        # e.g. /api/reddit/r/foo -> https://www.reddit.com/r/foo
        path_suffix = self.path[len(prefix):]
        target_url = target_base + path_suffix
        
        print(f"Proxying {self.path} -> {target_url}")
        
        try:
            req = urllib.request.Request(target_url)
            # Rotate User-Agent to avoid fingerprinting
            req.add_header('User-Agent', random.choice(USER_AGENTS))
            
            # 15s timeout to prevent hanging forever
            # Create unverified context to avoid SSL errors on some pythons
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            
            with urllib.request.urlopen(req, timeout=15, context=ctx) as response:
                body = response.read()
                self.send_response(response.status)
                
                # Filter out hop-by-hop headers and headers we might invalidate
                skip_headers = {'transfer-encoding', 'content-encoding', 'content-length', 'connection'}
                
                for key, value in response.headers.items():
                   if key.lower() not in skip_headers:
                       self.send_header(key, value)
                
                # We send the full body, so we set Content-Length
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

def get_local_ip():
    try:
        # Create a dummy socket to detect primary outbound IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

if __name__ == '__main__':
    # Ensure dist exists (optional for proxy mode)
    if not os.path.exists(DIST_DIR):
        print(f"⚠️ Warning: Dist directory not found. Static file serving disabled.")
        print("Proxy mode is still active.")
        DIST_DIR = "." # Fallback to current dir instead of exiting

    internal_ip = get_local_ip()
    print(f"\n--- Social Portal Portable Server ---")
    print(f"Listing on PORT: {PORT}")
    print(f"Local:   http://localhost:{PORT}")
    print(f"Network: http://{internal_ip}:{PORT} (Share this URL!)")
    print(f"-------------------------------------\n")
    
    # Bind to 0.0.0.0 (all interfaces)
    with socketserver.TCPServer(("0.0.0.0", PORT), SPAHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down.")
