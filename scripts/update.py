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

    get_reg = subprocess.run(
        ["npm", "config", "get", "registry"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    saved_registry = (get_reg.stdout or "").strip()
    print(f"[更新] 安装前 npm 源（将暂时切国内源并在结束后恢复）: {saved_registry or '(默认)'}", flush=True)
    try:
        subprocess.run(
            ["npm", "config", "set", "registry", _NPM_REGISTRY_CN],
            check=True,
            capture_output=True,
            timeout=10,
        )
        print(f"[更新] 已切换为国内源 {_NPM_REGISTRY_CN}。", flush=True)
    except Exception as e:
        print(f"[更新] 切换国内源失败，将用当前源首次尝试: {e}", flush=True)

    def _run_npm_install() -> subprocess.CompletedProcess:
        return subprocess.run(
            ["npm", "install", "openclaw-memory-alibaba-mysql"],
            cwd=_PLUGINS_DIR,
            capture_output=True,
            text=True,
            timeout=120,
        )

    print("[更新] 执行 npm install openclaw-memory-alibaba-mysql...", flush=True)
    result: Optional[subprocess.CompletedProcess] = None
    try:
        try:
            result = _run_npm_install()
        except subprocess.TimeoutExpired:
            print("[更新] 国内/当前源 npm install 超时，改试官方源。", flush=True)
            try:
                subprocess.run(
                    ["npm", "config", "set", "registry", _NPM_REGISTRY_OFFICIAL],
                    check=True,
                    capture_output=True,
                    timeout=10,
                )
            except Exception as ex:
                print(f"[更新] 切换官方源失败: {ex}", file=sys.stderr, flush=True)
                sys.exit(1)
            result = _run_npm_install()
        else:
            if result.returncode != 0:
                print("[更新] 国内/当前源 npm install 失败，改试官方源。", flush=True)
                try:
                    subprocess.run(
                        ["npm", "config", "set", "registry", _NPM_REGISTRY_OFFICIAL],
                        check=True,
                        capture_output=True,
                        timeout=10,
                    )
                except Exception as ex:
                    print(f"[更新] 切换官方源失败: {ex}", file=sys.stderr, flush=True)
                    sys.exit(1)
                result = _run_npm_install()

        assert result is not None
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
                print(f"[更新] 已恢复 npm 源为 {saved_registry}。", flush=True)
            except Exception:
                pass
        else:
            try:
                subprocess.run(
                    ["npm", "config", "delete", "registry"],
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
    print("[更新] 完成。请执行 openclaw gateway restart（或等价方式）以使新版本生效。", flush=True)


if __name__ == "__main__":
    main()
