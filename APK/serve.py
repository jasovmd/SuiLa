"""在區網提供 Capacitor 安裝檔。手機打開網址就會開始下載。"""

from __future__ import annotations

import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APK = ROOT / "suila-capacitor-debug.apk"
PORT = 8088
NAME = "suila-capacitor-debug.apk"

PAGE = f"""<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>水啦</title>
<body style="font-family:sans-serif;text-align:center;padding:48px 16px">
<h1>水啦</h1>
<p style="font-size:22px">正在下載安裝檔…</p>
<p><a href="/{NAME}" style="font-size:28px">若沒有開始，點這裡下載</a></p>
<script>location.replace("/{NAME}")</script>
</body>
"""


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self) -> None:
        path = self.path.split("?", 1)[0]
        if path in (f"/{NAME}", "/download", "/SuiLa.apk"):
            size = APK.stat().st_size
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.android.package-archive")
            self.send_header("Content-Disposition", f'attachment; filename="{NAME}"')
            self.send_header("Content-Length", str(size))
            self.end_headers()
            return
        body = PAGE.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path in (f"/{NAME}", "/download", "/SuiLa.apk"):
            self._send_apk()
            return
        body = PAGE.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_apk(self) -> None:
        size = APK.stat().st_size
        self.send_response(200)
        self.send_header("Content-Type", "application/vnd.android.package-archive")
        self.send_header("Content-Disposition", f'attachment; filename="{NAME}"')
        self.send_header("Content-Length", str(size))
        self.end_headers()
        with APK.open("rb") as handle:
            while True:
                chunk = handle.read(256 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.address_string()}] {fmt % args}")


def lan_ips() -> list[str]:
    ips: list[str] = []
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        ips.append(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass
    try:
        for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = item[4][0]
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except OSError:
        pass
    return ips or ["127.0.0.1"]


def main() -> None:
    if not APK.is_file():
        raise SystemExit(f"找不到安裝檔：{APK}")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("水啦安裝檔已開放下載。手機請連同一個 Wi-Fi，用瀏覽器打開：", flush=True)
    for ip in lan_ips():
        print(f"  http://{ip}:{PORT}/", flush=True)
    print("關閉這個視窗就會停止下載。", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
