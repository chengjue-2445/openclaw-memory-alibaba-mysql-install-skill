#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 plugins.load.paths 中已配置的 openclaw-memory-alibaba-mysql 插件目录内的文件更新到最新版本。
仅执行 npm install openclaw-memory-alibaba-mysql，不修改 ~/.openclaw/openclaw.json 中的 path 配置。
"""
from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

_PLUGINS_DIR = os.path.expanduser("~/.openclaw/plugins")
_NPM_REGISTRY_CN = "https://registry.npmmirror.com"


def _is_beijing_time() -> bool:
    try:
        ts = datetime.now(timezone.utc)
        local = ts.astimezone()
        offset = local.utcoffset()
        return offset is not None and offset == timedelta(hours=8)
    except Exception:
        return False


def main() -> None:
    print("[更新] 将 openclaw-memory-alibaba-mysql 插件文件更新到最新版本（仅 npm install，不修改 openclaw.json 的 path）", flush=True)
    os.makedirs(_PLUGINS_DIR, exist_ok=True)
    pkg_json = os.path.join(_PLUGINS_DIR, "package.json")
    if not os.path.isfile(pkg_json):
        subprocess.run(["npm", "init", "-y"], cwd=_PLUGINS_DIR, check=True, capture_output=True, timeout=30)

    saved_registry = None
    try:
        get_reg = subprocess.run(
            ["npm", "config", "get", "registry"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        current = (get_reg.stdout or "").strip()
        is_cn = current and (_NPM_REGISTRY_CN in current or "npmmirror.com" in current)
        if not is_cn and _is_beijing_time():
            saved_registry = current
            subprocess.run(
                ["npm", "config", "set", "registry", _NPM_REGISTRY_CN],
                check=True,
                capture_output=True,
                timeout=10,
            )
    except Exception:
        pass

    print("[更新] 执行 npm install openclaw-memory-alibaba-mysql...", flush=True)
    try:
        result = subprocess.run(
            ["npm", "install", "openclaw-memory-alibaba-mysql"],
            cwd=_PLUGINS_DIR,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            print(f"npm install 失败: {result.stderr or result.stdout}", file=sys.stderr, flush=True)
            sys.exit(1)
    finally:
        if saved_registry:
            try:
                subprocess.run(
                    ["npm", "config", "set", "registry", saved_registry],
                    check=True,
                    capture_output=True,
                    timeout=10,
                )
            except Exception:
                pass

    plugin_path = os.path.abspath(os.path.join(_PLUGINS_DIR, "node_modules", "openclaw-memory-alibaba-mysql"))
    if not os.path.isdir(plugin_path):
        print(f"错误：未找到插件目录 {plugin_path}", file=sys.stderr, flush=True)
        sys.exit(1)
    print(f"[更新] 插件文件已更新至最新，位置: {plugin_path}", flush=True)
    print("[更新] 完成。请重启 OpenClaw 以使新版本生效。", flush=True)


if __name__ == "__main__":
    main()
