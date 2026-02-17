import http.server
import json
import os
import random
import socket
import socketserver
import ssl
import subprocess
import urllib.error
import urllib.request
from urllib.parse import parse_qs, quote, urljoin, urlparse

PORT = int(os.getenv("SOCIAL_PORTAL_PORT", "8090"))
REQUEST_TIMEOUT_SECONDS = int(os.getenv("SOCIAL_PORTAL_REQUEST_TIMEOUT_SECONDS", "6"))
HEALTH_PROBE_TIMEOUT_SECONDS = int(os.getenv("SOCIAL_PORTAL_HEALTH_TIMEOUT_SECONDS", "4"))
MAX_DIRECT_SOURCE_ATTEMPTS = int(os.getenv("SOCIAL_PORTAL_MAX_SOURCE_ATTEMPTS", "4"))
MAX_PROXY_FALLBACK_ATTEMPTS = int(os.getenv("SOCIAL_PORTAL_MAX_PROXY_FALLBACK_ATTEMPTS", "2"))
JINA_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64)"

script_dir = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = None
possible_paths = [
    os.path.join(script_dir, "dist"),
    os.path.join(os.path.dirname(script_dir), "dist"),
]

for p in possible_paths:
    if os.path.exists(p) and os.path.isdir(p):
        DIST_DIR = p
        break

if not DIST_DIR:
    DIST_DIR = possible_paths[0]

PROXIES = {
    "/api/reddit": "https://www.reddit.com",
    "/api/mastodon": "https://mastodon.social",
    "/api/nostr": "https://api.nostr.band",
    "/api/lemmy": "https://lemmy.world",
    "/api/custom-feed": "https://piefed.social",
    "/api/misskey": "https://misskey.io",
    "/api/misskey-design": "https://misskey.design",
    "/api/bluesky": "https://public.api.bsky.app",
}

DEFAULT_NITTER_PUBLIC = [
    "https://xcancel.com",
    "https://nuku.trabun.org",
    "https://nitter.privacyredirect.com",
    "https://nitter.poast.org",
    "https://nitter.net",
    "https://nitter.privacydev.net",
    "https://nitter.uni-sonia.com",
    "https://nitter.no-logs.com",
    "https://lightbrd.com",
]

DEFAULT_REDLIB_PUBLIC = [
    "https://www.reddit.com",
    "https://l.opnxng.com",
    "https://redlib.catsarch.com",
    "https://redlib.perennialte.ch",
    "https://redlib.r4fo.com",
    "https://redlib.cow.rip",
    "https://redlib.privacyredirect.com",
    "https://redlib.nadeko.net",
    "https://redlib.4o1x5.dev",
    "https://redlib.orangenet.cc",
    "https://rl.bloat.cat",
    "https://redlib.tux.pizza",
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
]


def parse_bool_env(name, default=True):
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def normalize_source(value):
    cleaned = value.strip()
    if not cleaned:
        return ""
    if not cleaned.startswith("http://") and not cleaned.startswith("https://"):
        cleaned = f"https://{cleaned}"
    return cleaned.rstrip("/")


def parse_source_list_env(name, default_values):
    raw = os.getenv(name)
    values = default_values
    if raw is not None:
        values = [v.strip() for v in raw.split(",")]
    normalized = []
    for value in values:
        source = normalize_source(value)
        if source:
            normalized.append(source)
    return normalized


NITTER_ENABLED = parse_bool_env("SOCIAL_PORTAL_ENABLE_NITTER_BRIDGE", False)
REDLIB_ENABLED = parse_bool_env("SOCIAL_PORTAL_ENABLE_REDLIB_BRIDGE", True)

NITTER_SELF_HOSTED = parse_source_list_env("SOCIAL_PORTAL_NITTER_SELF_HOSTED", [])
REDLIB_SELF_HOSTED = parse_source_list_env("SOCIAL_PORTAL_REDLIB_SELF_HOSTED", [])
NITTER_PUBLIC = parse_source_list_env("SOCIAL_PORTAL_NITTER_PUBLIC", DEFAULT_NITTER_PUBLIC)
REDLIB_PUBLIC = parse_source_list_env("SOCIAL_PORTAL_REDLIB_PUBLIC", DEFAULT_REDLIB_PUBLIC)

NITTER_SOURCES = NITTER_SELF_HOSTED + NITTER_PUBLIC
REDLIB_SOURCES = REDLIB_SELF_HOSTED + REDLIB_PUBLIC

NITTER_CHALLENGE_MARKERS = (
    "verify your request",
    "bot protection",
    "please wait while we check your browser",
    "whitelisted",
    "cf-chl",
    "cloudflare",
)

REDLIB_CHALLENGE_MARKERS = NITTER_CHALLENGE_MARKERS
HOP_BY_HOP_HEADERS = {"transfer-encoding", "content-encoding", "content-length", "connection"}


def build_ssl_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def is_html_like(content_type, body_text):
    lowered_type = (content_type or "").lower()
    if "text/html" in lowered_type:
        return True
    sample = body_text[:600].lower()
    return "<!doctype html" in sample or "<html" in sample


def has_challenge_markers(body_text, markers):
    lowered = body_text.lower()
    return any(marker in lowered for marker in markers)


def validate_nitter_payload(content_type, body_text):
    if not body_text:
        return False
    has_rss = "<rss" in body_text or "<channel" in body_text or "<feed" in body_text
    if has_rss:
        return not has_challenge_markers(body_text, NITTER_CHALLENGE_MARKERS)
    return False


def validate_redlib_payload(content_type, body_text):
    if not body_text:
        return False
    if is_html_like(content_type, body_text):
        return False
    if has_challenge_markers(body_text, REDLIB_CHALLENGE_MARKERS):
        return False
    try:
        payload = json.loads(body_text)
    except json.JSONDecodeError:
        return False
    data = payload.get("data")
    return payload.get("kind") == "Listing" and isinstance(data, dict) and isinstance(data.get("children"), list)


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        route_path = parsed.path

        if route_path == "/api/proxy":
            params = parse_qs(parsed.query)
            if "url" not in params:
                self.send_error(400, "Missing url query parameter")
                return
            self.handle_proxy_direct(params["url"][0])
            return

        if route_path.startswith("/api/nitter"):
            self.handle_network_bridge(
                route_path=route_path,
                query=parsed.query,
                prefix="/api/nitter",
                network_name="nitter",
                enabled=NITTER_ENABLED,
                sources=NITTER_SOURCES,
                validator=validate_nitter_payload,
                accept_header="application/rss+xml, application/xml, text/xml, */*",
                fallback_sources=NITTER_PUBLIC,
                fallback_content_type="application/rss+xml; charset=utf-8",
            )
            return

        if route_path.startswith("/api/redlib"):
            self.handle_network_bridge(
                route_path=route_path,
                query=parsed.query,
                prefix="/api/redlib",
                network_name="redlib",
                enabled=REDLIB_ENABLED,
                sources=REDLIB_SOURCES,
                validator=validate_redlib_payload,
                accept_header="application/json, text/plain, */*",
                fallback_sources=REDLIB_PUBLIC,
                fallback_content_type="application/json; charset=utf-8",
            )
            return

        if route_path == "/api/healthz":
            self.handle_healthz()
            return

        for prefix, target in PROXIES.items():
            if route_path.startswith(prefix):
                self.handle_proxy(target, prefix)
                return

        path = self.translate_path(self.path)
        if not os.path.exists(path) or os.path.isdir(path):
            if not os.path.exists(path):
                self.path = "/index.html"

        super().do_GET()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, User-Agent")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def request_url(self, target_url, accept_header, timeout_seconds):
        req = urllib.request.Request(target_url)
        req.add_header("User-Agent", random.choice(USER_AGENTS))
        req.add_header("Accept", accept_header)
        req.add_header("Accept-Language", "en-US,en;q=0.5")
        with urllib.request.urlopen(req, timeout=timeout_seconds, context=build_ssl_context()) as response:
            body = response.read()
            return response.status, dict(response.headers.items()), body

    def send_binary_response(self, status_code, headers, body):
        self.send_response(status_code)
        for key, value in headers.items():
            if key.lower() not in HOP_BY_HOP_HEADERS:
                self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def source_url(self, base_url, suffix):
        joined = urljoin(f"{base_url.rstrip('/')}/", suffix.lstrip("/"))
        return joined

    def resolve_suffix(self, route_path, query, prefix):
        suffix = route_path[len(prefix):]
        if not suffix:
            suffix = "/"
        if not suffix.startswith("/"):
            suffix = f"/{suffix}"
        if query:
            suffix = f"{suffix}?{query}"
        return suffix

    def fetch_valid_source(self, network_name, sources, suffix, validator, accept_header, timeout_seconds):
        failures = []
        for source in sources[:max(1, MAX_DIRECT_SOURCE_ATTEMPTS)]:
            target_url = self.source_url(source, suffix)
            print(f"[{network_name}] trying {target_url}")
            try:
                status_code, headers, body = self.request_url(target_url, accept_header, timeout_seconds)
                content_type = headers.get("Content-Type", "")
                decoded = body.decode("utf-8", errors="ignore")
                if status_code == 200 and validator(content_type, decoded):
                    return {
                        "ok": True,
                        "status": status_code,
                        "headers": headers,
                        "body": body,
                        "source": source,
                        "target_url": target_url,
                    }
                failures.append(f"{target_url} -> invalid payload (status={status_code})")
            except urllib.error.HTTPError as e:
                failures.append(f"{target_url} -> HTTP {e.code}")
            except Exception as e:
                failures.append(f"{target_url} -> {e}")
        return {"ok": False, "failures": failures}

    def fetch_safe_proxy_fallback(self, network_name, fallback_sources, suffix, validator, content_type):
        if not fallback_sources:
            return {"ok": False, "error": f"{network_name}: no fallback source configured"}
        errors = []
        for fallback_source in fallback_sources[:max(1, MAX_PROXY_FALLBACK_ATTEMPTS)]:
            target_url = self.source_url(fallback_source, suffix)
            allorigins_url = f"https://api.allorigins.win/get?url={quote(target_url, safe='')}"
            print(f"[{network_name}] proxy fallback via {allorigins_url}")
            try:
                status_code, _, body = self.request_url(allorigins_url, "application/json, */*", REQUEST_TIMEOUT_SECONDS)
                if status_code != 200:
                    errors.append(f"{target_url} -> fallback status {status_code}")
                    continue
                wrapped = json.loads(body.decode("utf-8", errors="ignore"))
                content = wrapped.get("contents", "")
                if not validator("text/plain", content):
                    errors.append(f"{target_url} -> fallback payload validation failed")
                    continue
                return {
                    "ok": True,
                    "status": 200,
                    "headers": {"Content-Type": content_type},
                    "body": content.encode("utf-8"),
                    "source": f"allorigins:{fallback_source}",
                }
            except Exception as e:
                errors.append(f"{target_url} -> fallback failed ({e})")
        return {"ok": False, "error": "; ".join(errors[:6])}

    def handle_network_bridge(self, route_path, query, prefix, network_name, enabled, sources, validator, accept_header, fallback_sources, fallback_content_type):
        if not enabled:
            self.send_error(503, f"{network_name} bridge disabled")
            return
        if not sources:
            self.send_error(503, f"{network_name} bridge has no sources configured")
            return

        suffix = self.resolve_suffix(route_path, query, prefix)
        result = self.fetch_valid_source(
            network_name=network_name,
            sources=sources,
            suffix=suffix,
            validator=validator,
            accept_header=accept_header,
            timeout_seconds=REQUEST_TIMEOUT_SECONDS,
        )
        if result.get("ok"):
            print(f"[{network_name}] success via {result['source']}")
            self.send_binary_response(result["status"], result["headers"], result["body"])
            return

        fallback = self.fetch_safe_proxy_fallback(network_name, fallback_sources, suffix, validator, fallback_content_type)
        if fallback.get("ok"):
            print(f"[{network_name}] success via fallback {fallback['source']}")
            self.send_binary_response(fallback["status"], fallback["headers"], fallback["body"])
            return

        failure_parts = result.get("failures", []) + [fallback.get("error", "unknown fallback failure")]
        error_body = json.dumps(
            {
                "error": f"{network_name} bridge failed",
                "details": failure_parts[:8],
            },
            indent=2,
        ).encode("utf-8")
        self.send_response(502)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(error_body)))
        self.end_headers()
        self.wfile.write(error_body)

    def handle_proxy_direct(self, target_url):
        print(f"Direct Proxying -> {target_url}")
        try:
            # r.jina.ai blocks Python urllib user agents/TLS fingerprints; proxy via allorigins.
            try:
                host = urlparse(target_url).hostname or ""
            except Exception:
                host = ""
            if host.lower() == "r.jina.ai":
                result = subprocess.run(
                    ["curl", "-sS", "-L", "--max-time", str(max(REQUEST_TIMEOUT_SECONDS, 20)), "-A", JINA_USER_AGENT, "-H", "Accept: text/plain", target_url],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    check=False,
                )
                if result.returncode != 0:
                    raise Exception(result.stderr.decode("utf-8", errors="ignore").strip() or f"curl failed ({result.returncode})")
                self.send_binary_response(
                    200,
                    {"Content-Type": "text/plain; charset=utf-8", "X-Proxy-Source": "curl"},
                    result.stdout,
                )
                return
            status_code, headers, body = self.request_url(
                target_url,
                "application/rss+xml, application/xml, text/xml, application/json, */*",
                REQUEST_TIMEOUT_SECONDS,
            )
            self.send_binary_response(status_code, headers, body)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode("utf-8"))

    def handle_proxy(self, target_base, prefix):
        path_suffix = self.path[len(prefix):]
        target_url = target_base + path_suffix
        print(f"Proxying {self.path} -> {target_url}")
        try:
            status_code, headers, body = self.request_url(
                target_url,
                "application/rss+xml, application/xml, text/xml, application/json, */*",
                REQUEST_TIMEOUT_SECONDS,
            )
            self.send_binary_response(status_code, headers, body)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode("utf-8"))

    def probe_network(self, network_name, enabled, sources, path, validator, accept_header):
        details = {
            "enabled": enabled,
            "sources": len(sources),
            "selfHostedSources": len([s for s in sources if s in (NITTER_SELF_HOSTED if network_name == "nitter" else REDLIB_SELF_HOSTED)]),
        }
        if not enabled:
            details["ok"] = False
            details["reason"] = "disabled"
            return details
        if not sources:
            details["ok"] = False
            details["reason"] = "no sources configured"
            return details
        probe = self.fetch_valid_source(
            network_name=network_name,
            sources=sources[:3],
            suffix=path,
            validator=validator,
            accept_header=accept_header,
            timeout_seconds=HEALTH_PROBE_TIMEOUT_SECONDS,
        )
        details["ok"] = bool(probe.get("ok"))
        if probe.get("ok"):
            details["source"] = probe["source"]
        else:
            details["errors"] = probe.get("failures", [])[:3]
        return details

    def handle_healthz(self):
        payload = {
            "status": "ok",
            "nitter": self.probe_network(
                network_name="nitter",
                enabled=NITTER_ENABLED,
                sources=NITTER_SOURCES,
                path="/search/rss?q=privacy",
                validator=validate_nitter_payload,
                accept_header="application/rss+xml, application/xml, text/xml, */*",
            ),
            "redlib": self.probe_network(
                network_name="redlib",
                enabled=REDLIB_ENABLED,
                sources=REDLIB_SOURCES,
                path="/r/popular.json?limit=1&raw_json=1",
                validator=validate_redlib_payload,
                accept_header="application/json, text/plain, */*",
            ),
        }
        if (payload["nitter"].get("enabled") and not payload["nitter"].get("ok")) or (
            payload["redlib"].get("enabled") and not payload["redlib"].get("ok")
        ):
            payload["status"] = "degraded"
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


if __name__ == "__main__":
    if not os.path.exists(DIST_DIR):
        print("Warning: Dist directory not found. Static file serving disabled.")
        print("Proxy mode is still active.")
        DIST_DIR = "."

    internal_ip = get_local_ip()
    print("\n--- Social Portal Portable Server ---")
    print(f"Listening on PORT: {PORT}")
    print(f"Local:   http://localhost:{PORT}")
    print(f"Network: http://{internal_ip}:{PORT}")
    print(f"Nitter bridge: {'enabled' if NITTER_ENABLED else 'disabled'} ({len(NITTER_SOURCES)} sources)")
    print(f"Redlib bridge: {'enabled' if REDLIB_ENABLED else 'disabled'} ({len(REDLIB_SOURCES)} sources)")
    print(f"Bridge limits: {MAX_DIRECT_SOURCE_ATTEMPTS} direct + {MAX_PROXY_FALLBACK_ATTEMPTS} proxy attempts")
    print("-------------------------------------\n")

    with socketserver.TCPServer(("0.0.0.0", PORT), SPAHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down.")
