"""Signed GitHub push receiver forwarding authorized main pushes to BaoTa WebHook.

Run independently of the garden process, behind an HTTPS reverse proxy. Store all
configuration in its process environment; never commit the plugin URL or secret.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

MAX_BODY = 2 * 1024 * 1024


def validate(body: bytes, signature: str, event: str, secret: str, repository: str) -> str:
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise ValueError("invalid signature")
    payload = json.loads(body)
    if not isinstance(payload, dict):
        raise ValueError("invalid payload")
    if payload.get("repository", {}).get("full_name") != repository:
        raise ValueError("unexpected repository")
    if event == "ping":
        return "ping"
    if event != "push" or payload.get("ref") != "refs/heads/main" or payload.get("deleted"):
        return "ignore"
    return "deploy"


def main() -> None:
    secret = os.environ["GROW_WEBHOOK_SECRET"]
    target = os.environ["BT_WEBHOOK_URL"]
    repository = os.environ.get("GROW_WEBHOOK_REPOSITORY", "franz-9527/grow")
    parsed = urlparse(target)
    if len(secret) < 32 or parsed.scheme != "https" or not parsed.hostname:
        raise SystemExit("A secret of at least 32 characters and an HTTPS plugin URL are required")
    lock = threading.Lock()

    def deploy() -> None:
        try:
            # No redirects: avoid forwarding a private capability URL to another host.
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, req, fp, code, msg, headers, newurl):
                    return None
            opener = urllib.request.build_opener(NoRedirect)
            with opener.open(urllib.request.Request(target, data=b"", method="POST"), timeout=1800) as response:
                if response.status != 200:
                    print("BaoTa WebHook returned an unexpected status", flush=True)
                else:
                    print("BaoTa WebHook completed; check plugin deployment log", flush=True)
        except Exception:
            # Exceptions may contain the secret URL. Never log their text.
            print("BaoTa WebHook request failed; inspect the private plugin log", flush=True)
        finally:
            lock.release()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            # Request paths/headers may contain secrets; do not record them.
            pass

        def reply(self, status: int, message: str):
            content = json.dumps({"message": message}).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def do_POST(self):
            if self.path != "/hooks/github/grow":
                self.reply(404, "not found")
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= MAX_BODY:
                    self.reply(413, "invalid body length")
                    return
                self.connection.settimeout(10)
                body = self.rfile.read(length)
                if len(body) != length:
                    raise ValueError("incomplete body")
                action = validate(body, self.headers.get("X-Hub-Signature-256", ""),
                                  self.headers.get("X-GitHub-Event", ""), secret, repository)
            except (ValueError, TypeError, AttributeError, OSError):
                self.reply(403, "request rejected")
                return
            if action != "deploy":
                self.reply(200, action)
                return
            # Serialize requests; return retryable failure rather than lose a later push.
            if not lock.acquire(blocking=False):
                self.reply(503, "deployment busy; redeliver after it completes")
                return
            threading.Thread(target=deploy, daemon=True).start()
            self.reply(202, "deployment accepted; check BaoTa log")

    server = ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("GROW_WEBHOOK_PORT", "9011"))), Handler)
    print("GitHub receiver listening on loopback", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
