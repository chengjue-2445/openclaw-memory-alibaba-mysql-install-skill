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
from typing import Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

_PLUGINS_DIR = os.path.expanduser("~/.openclaw/plugins")
_NPM_REGISTRY_CN = "https://registry.npmmirror.com"
_NPM_REGISTRY_OFFICIAL = "https://registry.npmjs.org"


def main() -> None:
    print("[更新] 将 openclaw-memory-alibaba-mysql 插件文件更新到最新版本（仅 npm install，不修改 openclaw.json 的 path）", flush=True)
    os.makedirs(_PLUGINS_DIR, exist_ok=True)
    pkg_json = os.path.join(_PLUGINS_DIR, "package.json")
    if not os.path.isfile(pkg_json):
        subprocess.run(["npm", "init", "-y"], cwd=_PLUGINS_DIR, check=True, capture_output=True, timeout=30)

    # 使用 --registry 指定源：项目目录 .npmrc 会覆盖用户级 npm config，原先 set registry 常不生效
    eff = subprocess.run(
        ["npm", "config", "get", "registry"],
        cwd=_PLUGINS_DIR,
        capture_output=True,
        text=True,
        timeout=10,
    )
    print(
        f"[更新] plugins 目录解析到的 registry（仅供参考，本次使用 --registry 覆盖）: "
        f"{(eff.stdout or '').strip() or '(默认)'}",
        flush=True,
    )

    def _run_npm_install(registry: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [
                "npm",
                "install",
                "openclaw-memory-alibaba-mysql",
                "--registry",
                registry,
            ],
            cwd=_PLUGINS_DIR,
            capture_output=True,
            text=True,
            timeout=120,
        )

    print(f"[更新] 执行 npm install（优先 {_NPM_REGISTRY_CN}）...", flush=True)
    result: Optional[subprocess.CompletedProcess] = None
    try:
        result = _run_npm_install(_NPM_REGISTRY_CN)
    except subprocess.TimeoutExpired:
        print("[更新] 国内源 npm install 超时，改试官方源。", flush=True)
        try:
            result = _run_npm_install(_NPM_REGISTRY_OFFICIAL)
        except subprocess.TimeoutExpired:
            print("[更新] 官方源 npm install 仍超时。", file=sys.stderr, flush=True)
            sys.exit(1)
    else:
        if result.returncode != 0:
            print("[更新] 国内源 npm install 失败，改试官方源。", flush=True)
            try:
                result = _run_npm_install(_NPM_REGISTRY_OFFICIAL)
            except subprocess.TimeoutExpired:
                print("[更新] 官方源 npm install 超时。", file=sys.stderr, flush=True)
                sys.exit(1)

    assert result is not None
    if result.returncode != 0:
        print(f"npm install 失败: {result.stderr or result.stdout}", file=sys.stderr, flush=True)
        sys.exit(1)

    plugin_path = os.path.abspath(os.path.join(_PLUGINS_DIR, "node_modules", "openclaw-memory-alibaba-mysql"))
    if not os.path.isdir(plugin_path):
        print(f"错误：未找到插件目录 {plugin_path}", file=sys.stderr, flush=True)
        sys.exit(1)
    print(f"[更新] 插件文件已更新至最新，位置: {plugin_path}", flush=True)
    print("[更新] 完成。请执行 openclaw gateway restart（或等价方式）以使新版本生效。", flush=True)


if __name__ == "__main__":
    main()
