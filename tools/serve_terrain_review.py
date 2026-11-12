#!/usr/bin/env python3
"""Small, uncached HTTP preview; portable review.html stays self-contained.

Serves review.html as-is (embedded background data URI, no extra asset
requests) so the Arena preview proxy only has to transport one HTML
document. The /__background.png endpoint is kept for backward
compatibility with already-cached stripped pages.
"""
import argparse
import base64
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1] / 'docs/terrain-review/valencia'


def _background_png():
    html = (ROOT / 'review.html').read_text(encoding='utf-8')
    match = re.search(r'data:image/png;base64,([A-Za-z0-9+/=]+)', html)
    if not match:
        return None
    return base64.b64decode(match.group(1))


class ReviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def _serve(self, write_body=True):
        path = urlsplit(self.path).path
        if path in ('/', '/index.html', '/review.html'):
            body = (ROOT / 'review.html').read_bytes()
            kind = 'text/html; charset=utf-8'
        elif path == '/__background.png':
            body = _background_png()
            if body is None:
                self.send_error(500, 'Missing review background')
                return
            kind = 'image/png'
        else:
            super().do_GET() if write_body else super().do_HEAD()
            return
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if write_body:
            self.wfile.write(body)

    def do_GET(self):
        self._serve(write_body=True)

    def do_HEAD(self):
        self._serve(write_body=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8001)
    args = parser.parse_args()
    handler = partial(ReviewHandler, directory=str(ROOT))
    print(f'Terrain review listening on 0.0.0.0:{args.port}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', args.port), handler).serve_forever()
