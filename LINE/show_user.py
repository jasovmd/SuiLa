from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT.parent / "backend"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(BACKEND))

import store


def main() -> int:
    store.init_tables()
    user = store.last_user()
    if not user:
        print("還沒有人傳訊給 Bot")
        return 2
    print(user)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
