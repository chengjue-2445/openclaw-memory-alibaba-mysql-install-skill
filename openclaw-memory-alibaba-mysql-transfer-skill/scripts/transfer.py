#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 OpenClaw 配置目录下 workspace/MEMORY.md 重命名为 MEMORY.md.bak.{时间戳}。
时间戳格式：YYYYMMDDHHMMSS，如 20250101000001。
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from datetime import datetime
from typing import Optional


def _get_openclaw_config_dir_from_cli() -> Optional[str]:
    """通过 `openclaw config file | grep openclaw.json` 解析 openclaw.json 所在目录。"""
    try:
        proc = subprocess.run(
            ["bash", "-lc", "openclaw config file | grep openclaw.json"],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None
    out = proc.stdout or ""
    for line in out.splitlines():
        for m in re.finditer(r"([~\w./-]+openclaw\.json)\b", line):
            cfg_path = os.path.expanduser(m.group(1))
            if not cfg_path.endswith("openclaw.json"):
                continue
            return os.path.dirname(os.path.abspath(cfg_path))
    return None


def main() -> None:
    config_dir = _get_openclaw_config_dir_from_cli()
    if not config_dir:
        config_dir = os.path.expanduser("~/.openclaw")
        print(
            f"[迁移] 未能通过 openclaw config file | grep openclaw.json 解析配置目录，回退 {config_dir}",
            file=sys.stderr,
            flush=True,
        )

    memory_path = os.path.join(config_dir, "workspace", "MEMORY.md")
    if not os.path.isfile(memory_path):
        print(f"错误：{memory_path} 不存在。", file=sys.stderr, flush=True)
        sys.exit(1)

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    bak_path = f"{memory_path}.bak.{timestamp}"

    os.rename(memory_path, bak_path)
    print(f"[迁移] 已将 {memory_path} 重命名为 {bak_path}", flush=True)


if __name__ == "__main__":
    main()
