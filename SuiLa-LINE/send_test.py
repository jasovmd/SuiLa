"""主動發送一則測試通知。不會印出權杖。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from envfile import load_env
from line_push import push_text


def main() -> int:
    load_env(ROOT / ".env")
    import os

    user = os.getenv("LINE_TEST_USER_ID", "").strip()
    if not user:
        print("尚未設定 LINE_TEST_USER_ID。請先傳訊給 Bot，再執行 show_user.py 取得 userId。")
        return 2
    ok = push_text(user, "SuiLa 飲水提醒測試")
    print("sent" if ok else "failed")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
