#!/usr/bin/env python3
"""Local server for 透视镜. Usage: python3 serve.py  ->  http://localhost:5178"""
import http.server, os, sys

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.task': 'application/octet-stream'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        # cross-origin isolation lets the animal pose model use several threads
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()
    def log_message(self, *a): pass

os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 5178
print(f'透视镜 running at http://localhost:{port}')
http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
