#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OpenClaw Memory 阿里云 MySQL 一键安装脚本。
流程：费用确认 → AKSK → 购买 MySQL 8.0 实例 → 轮询 Running → 开启向量 → 建库 → 建账号+授权+白名单 → 写入 ~/.bashrc 与 OpenClaw 配置目录下 .env
全部通过 alibabacloud_rds20140815 SDK 完成，不依赖 rds-openapi-skill。

【不重试】本脚本遇错即退出，不做任何自动重试；调用方请勿在失败后自动重试，应把错误信息反馈给用户后由用户决定是否重新执行。
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import string
import subprocess
import sys
import threading
import time
from typing import Any, Callable, Dict, List, Optional, TypeVar
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# 购买参数 JSON 所需键名（仅地域与网络；实例固定为基础版 Serverless，无需用户指定规格/存储）
PARAM_KEYS = ("region_id", "vpc_id", "vswitch_id", "zone_id")

# ECS 实例元数据（加固模式），仅 ECS 内可访问
_ECS_METADATA_BASE = "http://100.100.100.200/latest"
_ECS_METADATA_TIMEOUT = 3

# 实时日志：行缓冲 + 关键步骤 flush，便于 Agent/CI 实时转发（建议执行时使用 PYTHONUNBUFFERED=1）
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

T = TypeVar("T")


def _run_sdk_with_heartbeat(
    func: Callable[[], T],
    *,
    heartbeat_interval: int = 10,
    timeout: int = 300,
    message: str = "[安装] ⏳ 仍在处理中，请稍候...",
) -> T:
    """在子线程中执行阻塞的 SDK 调用，主线程每 heartbeat_interval 秒输出一次进度，超时则抛出 TimeoutError。"""
    result: Dict[str, Any] = {"value": None, "error": None}

    def _target() -> None:
        try:
            result["value"] = func()
        except Exception as e:
            result["error"] = e

    thread = threading.Thread(target=_target, daemon=True)
    thread.start()
    started = time.time()
    last_log = 0.0
    while thread.is_alive():
        elapsed = int(time.time() - started)
        if elapsed >= timeout:
            print(
                f"[安装] ⚠️ 调用超时（{timeout} 秒），请检查网络或稍后重试。",
                file=sys.stderr,
                flush=True,
            )
            raise TimeoutError(f"SDK 调用在 {timeout} 秒内未返回")
        time.sleep(1)
        if time.time() - last_log >= heartbeat_interval or last_log == 0:
            print(f"[安装] ⏳ {message}（已等待 {elapsed} 秒）", flush=True)
            last_log = time.time()

    if result["error"] is not None:
        err = result["error"]
        print(f"[安装] ❌ 调用失败：{err}", file=sys.stderr, flush=True)
        raise err
    return result["value"]

# 统一获取 RDS 客户端
def _get_rds_client(region_id: str):
    from alibabacloud_rds20140815.client import Client as RdsClient
    from alibabacloud_tea_openapi.models import Config
    ak = os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_ID")
    sk = os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_SECRET")
    sts = os.environ.get("ALIBABA_CLOUD_SECURITY_TOKEN")
    # 与 rds-openapi-skill 一致：不显式设置 endpoint，仅传 region_id，由 SDK 按地域解析
    config = Config(
        access_key_id=ak,
        access_key_secret=sk,
        security_token=sts,
        region_id=region_id,
        connect_timeout=30000,
        read_timeout=120000,
    )
    return RdsClient(config)


def _get_default_route_src() -> Optional[str]:
    """获取默认路由使用的源 IP（即出口网卡的主 IP），用于多网卡时选择与“主出口”同 VPC 的网卡。"""
    try:
        out = subprocess.run(
            ["ip", "route", "get", "8.8.8.8"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if out.returncode != 0 or not out.stdout:
            return None
        m = re.search(r"\bsrc\s+(\d+\.\d+\.\d+\.\d+)\b", out.stdout)
        return m.group(1) if m else None
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError):
        return None


def _get_ecs_metadata_params() -> Optional[Dict[str, str]]:
    """从当前 ECS 实例元数据（加固模式）获取 region_id、vpc_id、vswitch_id、zone_id；非 ECS 或失败返回 None。
    多网卡时使用「默认路由所在网卡」的 VPC/交换机（按 primary-ip-address 与 ip route get 的 src 匹配），
    确保 RDS 建在 ECS 主出口所在 VPC，避免建在 meta-data/mac（仅表示 eth0）对应的另一 VPC。
    同时读取该网卡的 vswitch-cidr-block（若有）供 RDS 白名单使用整段交换机网段。"""
    try:
        # 1. PUT 获取 Token（加固模式）
        req = Request(
            f"{_ECS_METADATA_BASE}/api/token",
            data=b"",
            method="PUT",
            headers={"X-aliyun-ecs-metadata-token-ttl-seconds": "300"},
        )
        with urlopen(req, timeout=_ECS_METADATA_TIMEOUT) as resp:
            token = (resp.read().decode("utf-8") or "").strip()
        if not token:
            return None
        headers = {"X-aliyun-ecs-metadata-token": token}

        def _get(path: str) -> str:
            r = Request(f"{_ECS_METADATA_BASE}/meta-data/{path}", headers=headers)
            with urlopen(r, timeout=_ECS_METADATA_TIMEOUT) as resp:
                return (resp.read().decode("utf-8") or "").strip()

        # 2. 实例级：region-id、zone-id
        params = {}
        for path, key in (("region-id", "region_id"), ("zone-id", "zone_id")):
            params[key] = _get(path)
            if not params[key]:
                return None
        # 3. 多网卡时用「默认路由出口」对应网卡的 VPC/交换机（匹配 primary-ip-address 与 ip route get src）
        macs_raw = _get("network/interfaces/macs/")
        if not macs_raw:
            return None
        macs = [m.strip().rstrip("/") for m in macs_raw.splitlines() if m.strip()]
        if not macs:
            return None
        default_src = _get_default_route_src()
        chosen_mac: Optional[str] = None
        if default_src:
            for mac in macs:
                primary_ip = _get(f"network/interfaces/macs/{mac}/primary-ip-address").strip()
                if primary_ip == default_src:
                    chosen_mac = mac
                    break
        if not chosen_mac:
            chosen_mac = macs[0]
        for path, key in (
            (f"network/interfaces/macs/{chosen_mac}/vpc-id", "vpc_id"),
            (f"network/interfaces/macs/{chosen_mac}/vswitch-id", "vswitch_id"),
        ):
            params[key] = _get(path)
            if not params[key]:
                return None
        cidr_raw = _get(f"network/interfaces/macs/{chosen_mac}/vswitch-cidr-block")
        if cidr_raw:
            cidr_first = cidr_raw.strip().splitlines()[0].strip()
            if cidr_first:
                params["vswitch_cidr_block"] = cidr_first
        return params
    except (URLError, HTTPError, OSError, ValueError):
        return None


# 步骤 1：费用提示与确认
def step1_confirm() -> None:
    print(
        "本 SKILL 会创建一个基础版 Serverless 实例，起步成本低；可在控制台换成高可用版本或其他固定规格。"
        "接受请输入 y 或 yes 继续，其他键退出。",
        flush=True,
    )
    try:
        line = input("> ").strip().lower()
    except EOFError:
        line = ""
    if line not in ("y", "yes"):
        print("已取消。", flush=True)
        sys.exit(0)


# 步骤 2：读取 AKSK
def step2_aksk() -> tuple[str, str, Optional[str]]:
    ak = os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_ID")
    sk = os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_SECRET")
    sts = os.environ.get("ALIBABA_CLOUD_SECURITY_TOKEN")
    if not ak or not sk:
        print("错误：请设置环境变量 ALIBABA_CLOUD_ACCESS_KEY_ID 和 ALIBABA_CLOUD_ACCESS_KEY_SECRET。", file=sys.stderr, flush=True)
        sys.exit(1)
    return ak, sk, sts


# 步骤 2b：申请实例前检查 DASHSCOPE_API_KEY
def step2b_check_dashscope_api_key() -> None:
    key = os.environ.get("DASHSCOPE_API_KEY")
    if not key or not str(key).strip():
        print(
            "错误：需要设置环境变量 DASHSCOPE_API_KEY。\n"
            "记忆插件将使用百炼进行向量与对话，请前往阿里巴巴百炼平台申请 API Key：\n"
            "https://bailian.console.aliyun.com",
            file=sys.stderr,
            flush=True,
        )
        sys.exit(1)


def _get_params_from_json(params_json: str) -> Dict[str, str]:
    """从调用输入（LLM 构造的 JSON 字符串）解析购买参数。"""
    try:
        data = json.loads(params_json)
    except json.JSONDecodeError as e:
        print(f"错误：购买参数 JSON 解析失败: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
    if not isinstance(data, dict):
        print("错误：购买参数应为 JSON 对象。", file=sys.stderr, flush=True)
        sys.exit(1)
    params: Dict[str, str] = {}
    for key in PARAM_KEYS:
        val = data.get(key)
        if val is None:
            print(f"错误：购买参数 JSON 缺少键: {key}。需要: {list(PARAM_KEYS)}", file=sys.stderr, flush=True)
            sys.exit(1)
        params[key] = str(val).strip()
        if not params[key]:
            print(f"错误：购买参数 {key} 不能为空。", file=sys.stderr, flush=True)
            sys.exit(1)
    return params


def _get_params_from_env_or_prompt(params_json: Optional[str] = None) -> Dict[str, str]:
    """获取购买参数：若传入 params_json（调用输入）则从中解析；否则从环境变量或交互输入。"""
    if params_json and params_json.strip():
        print("[安装] 从调用输入（JSON）读取购买参数。", flush=True)
        return _get_params_from_json(params_json.strip())
    env_map = {
        "region_id": "OPENCLAW_RDS_REGION",
        "vpc_id": "OPENCLAW_VPC_ID",
        "vswitch_id": "OPENCLAW_VSWITCH_ID",
        "zone_id": "OPENCLAW_ZONE_ID",
    }
    params: Dict[str, str] = {}
    interactive = sys.stdin.isatty()
    if not interactive:
        print("[安装] 非交互环境，仅从环境变量读取购买参数。", flush=True)
    for key, env_name in env_map.items():
        val = os.environ.get(env_name)
        if val:
            params[key] = val
        elif interactive:
            prompt = {
                "region_id": "地域 (如 cn-hangzhou)",
                "vpc_id": "VPC ID",
                "vswitch_id": "VSwitch ID",
                "zone_id": "可用区 ID (如 cn-hangzhou-h)",
            }
            try:
                params[key] = input(f"{prompt[key]}: ").strip()
            except EOFError:
                params[key] = ""
            if not params[key]:
                print(f"错误：缺少 {key}。", file=sys.stderr, flush=True)
                sys.exit(1)
        else:
            params[key] = ""
    if not interactive:
        missing = [env_name for key, env_name in env_map.items() if not (params.get(key) or "").strip()]
        if missing:
            print(
                "错误：非交互环境下需通过环境变量或命令行 JSON 提供购买参数。当前缺失：\n  "
                + ", ".join(missing)
                + "\n请设置上述变量、或传入 JSON 如 scripts/install.py '{\"region_id\":\"cn-hangzhou\",...}'，或在交互终端中运行。",
                file=sys.stderr,
                flush=True,
            )
            sys.exit(1)
    return params


# 步骤 3：购买 MySQL 8.0 Serverless 实例（SDK）
def step3_create_instance(
    region_id: str,
    vpc_id: str,
    vswitch_id: str,
    zone_id: str,
) -> str:
    from alibabacloud_rds20140815 import models as rds_models

    client = _get_rds_client(region_id)
    # API: CreateDBInstance。PayType=Serverless、Category=serverless_basic、DBInstanceClass=mysql.n2.serverless.1c（基础版 Serverless）
    # ServerlessConfig 需传入 CreateDBInstanceRequestServerlessConfig 对象，不能传 JSON 字符串
    serverless_config = rds_models.CreateDBInstanceRequestServerlessConfig(
        min_capacity=0.5,
        max_capacity=4,
        auto_pause=False,
        switch_force=True,
    )
    # 必须传 vpcid、v_switch_id，否则实例会建在默认 VPC，与 ECS 不同网段无法互通
    request = rds_models.CreateDBInstanceRequest(
        region_id=region_id,
        vpcid=vpc_id,
        v_switch_id=vswitch_id,
        engine="MySQL",
        engine_version="8.0",
        dbinstance_class="mysql.n2.serverless.1c",
        dbinstance_storage=20,
        security_iplist="0.0.0.0/0",
        dbinstance_net_type="Intranet",
        pay_type="Serverless",
        category="serverless_basic",
        zone_id=zone_id,
        dbis_ignore_case="true",
        serverless_config=serverless_config,
    )
    print("[安装] 阶段：创建 RDS MySQL 8.0 实例（调用 CreateDBInstance API，预计 3–5 分钟）...", flush=True)
    response = _run_sdk_with_heartbeat(
        lambda: client.create_dbinstance(request),
        heartbeat_interval=10,
        timeout=300,
        message="CreateDBInstance 仍在处理中",
    )
    body = response.body
    db_instance_id = getattr(body, "dbinstance_id", None) or getattr(body, "DBInstanceId", None) or getattr(body, "dbinstanceid", None)
    if not db_instance_id and hasattr(body, "to_map"):
        m = body.to_map()
        db_instance_id = m.get("DBInstanceId") or m.get("dbinstance_id")
    if not db_instance_id:
        raise RuntimeError(f"无法从 create_dbinstance 响应中解析 DBInstanceId: {body}")
    print(f"[安装] 实例已创建，DBInstanceId: {db_instance_id}", flush=True)
    return db_instance_id


# 步骤 4：轮询直到 Running（SDK），每 10 秒输出一次状态日志
def step4_wait_running(region_id: str, db_instance_id: str, interval: int = 10, max_wait: int = 3600) -> None:
    from alibabacloud_rds20140815 import models as rds_models

    client = _get_rds_client(region_id)
    request = rds_models.DescribeDBInstanceAttributeRequest(dbinstance_id=db_instance_id)
    print("[安装] 等待实例状态变为 Running（每 10 秒检查并输出状态）...", flush=True)
    start = time.time()
    last_log = 0.0
    while time.time() - start < max_wait:
        response = client.describe_dbinstance_attribute(request)
        elapsed = int(time.time() - start)
        status = ""
        items = getattr(response.body, "items", None)
        if items:
            attrs = getattr(items, "dbinstance_attribute", None) or getattr(items, "DBInstanceAttribute", None)
            if attrs and len(attrs) > 0:
                first = attrs[0]
                status = (getattr(first, "dbinstance_status", None) or getattr(first, "DBInstanceStatus", None) or "").strip()
                if status == "Running":
                    print(f"[安装] 实例已 Running（耗时 {elapsed} 秒）。", flush=True)
                    return
        if time.time() - last_log >= 10 or last_log == 0:
            print(f"[安装] 创建实例阶段：已等待 {elapsed} 秒，当前状态: {status or '(查询中)'}", flush=True)
            last_log = time.time()
        time.sleep(interval)
    raise RuntimeError("等待实例 Running 超时。")


def _random_password_8() -> str:
    """8 位中强度密码：至少含大写、小写、数字中的两类。"""
    u = string.ascii_uppercase
    l = string.ascii_lowercase
    d = string.digits
    a = random.choice(u) + random.choice(l) + random.choice(d)
    b = "".join(random.choices(u + l + d, k=5))
    return "".join(random.sample(a + b, 8))


def _get_my_public_ip() -> str:
    try:
        import urllib.request
        with urllib.request.urlopen("https://api.ipify.org?format=text", timeout=5) as r:
            return r.read().decode().strip()
    except Exception:
        return "127.0.0.1"


def _sdk_create_database(
    region_id: str,
    db_instance_id: str,
    db_name: str = "openclaw_memory",
    charset: str = "utf8mb4",
) -> None:
    from alibabacloud_rds20140815 import models as rds_models

    client = _get_rds_client(region_id)
    req = rds_models.CreateDatabaseRequest(
        dbinstance_id=db_instance_id,
        dbname=db_name,
        character_set_name=charset,
    )
    client.create_database(req)


def _sdk_grant_privilege(
    region_id: str,
    db_instance_id: str,
    account_name: str,
    db_name: str,
    privilege: str = "ReadWrite",
) -> None:
    from alibabacloud_rds20140815 import models as rds_models

    client = _get_rds_client(region_id)
    req = rds_models.GrantAccountPrivilegeRequest(
        dbinstance_id=db_instance_id,
        account_name=account_name,
        dbname=db_name,
        account_privilege=privilege,
    )
    client.grant_account_privilege(req)


def _sdk_create_account(
    region_id: str,
    db_instance_id: str,
    account_name: str,
    account_password: str,
    account_description: str = "OpenClaw Memory",
) -> None:
    from alibabacloud_rds20140815 import models as rds_models

    client = _get_rds_client(region_id)
    req = rds_models.CreateAccountRequest(
        dbinstance_id=db_instance_id,
        account_name=account_name,
        account_password=account_password,
        account_description=account_description,
    )
    client.create_account(req)


def _sdk_modify_security_ips(
    region_id: str,
    db_instance_id: str,
    security_ips: str,
    whitelist_network_type: str = "MIX",
) -> None:
    from alibabacloud_rds20140815 import models as rds_models

    client = _get_rds_client(region_id)
    req = rds_models.ModifySecurityIpsRequest(
        dbinstance_id=db_instance_id,
        security_ips=security_ips,
        whitelist_network_type=whitelist_network_type,
    )
    client.modify_security_ips(req)


def _sdk_modify_vector_support(region_id: str, db_instance_id: str, status: str = "ON") -> None:
    """ModifyDBInstanceVectorSupportStatus：SDK 方法名为 modify_dbinstance_vector_support_status（无 db_instance 间下划线）。"""
    from alibabacloud_rds20140815 import models as rds_models

    client = _get_rds_client(region_id)
    # 先试 SDK 实际命名：modify_dbinstance_vector_support_status；再试 modify_db_instance_vector_support_status
    for method_name in ("modify_dbinstance_vector_support_status", "modify_db_instance_vector_support_status"):
        if not hasattr(client, method_name):
            continue
        req_class = getattr(
            rds_models,
            "ModifyDBInstanceVectorSupportStatusRequest",
            getattr(rds_models, "ModifyDbinstanceVectorSupportStatusRequest", None),
        )
        if req_class is None:
            continue
        try:
            req = req_class(dbinstance_id=db_instance_id, status=status)
            getattr(client, method_name)(req)
            print("[安装] 阶段：已调用 ModifyDBInstanceVectorSupportStatus(Status=ON)。", flush=True)
            return
        except Exception as e:
            print(f"[安装] 错误：开启向量失败，安装中止: {e}", file=sys.stderr, flush=True)
            sys.exit(1)
    print("错误：当前 SDK 未提供 ModifyDBInstanceVectorSupportStatus，无法开启向量；请至 RDS 控制台该实例「向量存储」处手动开启后重试，或升级 SDK。安装中止。", file=sys.stderr, flush=True)
    sys.exit(1)


def _get_connection_string(region_id: str, db_instance_id: str) -> str:
    """从 describe_db_instance_attribute 或 describe_dbinstance_net_info 获取连接地址，优先公网。"""
    from alibabacloud_rds20140815 import models as rds_models

    client = _get_rds_client(region_id)
    # 先试 attribute 里的 connection_string
    req = rds_models.DescribeDBInstanceAttributeRequest(dbinstance_id=db_instance_id)
    resp = client.describe_dbinstance_attribute(req)
    items = getattr(resp.body, "items", None)
    if items:
        attrs = getattr(items, "dbinstance_attribute", None) or getattr(items, "DBInstanceAttribute", None)
        if attrs and len(attrs) > 0:
            first = attrs[0]
            conn = getattr(first, "connection_string", None) or getattr(first, "ConnectionString", None)
            if conn:
                return conn
    # 再试 net info
    try:
        net_req = rds_models.DescribeDBInstanceNetInfoRequest(dbinstance_id=db_instance_id)
        net_resp = client.describe_dbinstance_net_info(net_req)
        if net_resp.body and net_resp.body.dbinstance_net_infos and net_resp.body.dbinstance_net_infos.dbinstance_net_info:
            infos: List[Any] = net_resp.body.dbinstance_net_infos.dbinstance_net_info
            for info in infos:
                iptype = getattr(info, "iptype", "")
                if "Public" in str(iptype):
                    return getattr(info, "connection_string", None) or getattr(info, "connectionstring", "") or ""
            if infos:
                return getattr(infos[0], "connection_string", None) or getattr(infos[0], "connectionstring", "") or ""
    except Exception:
        pass
    return ""


def _check_python_version() -> None:
    """要求 Python >= 3.8，否则提示并退出。"""
    if sys.version_info < (3, 8):
        print(
            f"错误：需要 Python 3.8 及以上版本，当前为 {sys.version_info.major}.{sys.version_info.minor}。",
            file=sys.stderr,
            flush=True,
        )
        sys.exit(1)


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


def _write_openclaw_dotenv(
    config_dir: str,
    *,
    mysql_host: str,
    mysql_user: str,
    mysql_password: str,
    mysql_database: str,
    dashscope_api_key: str,
) -> str:
    """在 OpenClaw 配置目录下写入 .env（仅 KEY=VALUE，与 ~/.bashrc 中变量一致）。"""
    env_path = os.path.join(config_dir, ".env")
    block_lines = [
        "# OpenClaw Memory RDS",
        f'DASHSCOPE_API_KEY="{dashscope_api_key}"',
        f'MYSQL_HOST="{mysql_host}"',
        f'MYSQL_USER="{mysql_user}"',
        f'MYSQL_PASSWORD="{mysql_password}"',
        f'MYSQL_DATABASE="{mysql_database}"',
    ]
    block = "\n".join(block_lines) + "\n"
    drop_prefixes = (
        "# OpenClaw Memory RDS",
        "DASHSCOPE_API_KEY=",
        "MYSQL_HOST=",
        "MYSQL_USER=",
        "MYSQL_PASSWORD=",
        "MYSQL_DATABASE=",
    )
    if os.path.isfile(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        lines = [ln for ln in lines if not any(ln.strip().startswith(p) for p in drop_prefixes)]
        content = "".join(lines).rstrip()
        if content and not content.endswith("\n"):
            content += "\n"
    else:
        content = ""
    os.makedirs(config_dir, exist_ok=True)
    with open(env_path, "w", encoding="utf-8") as f:
        f.write(content)
        f.write(block)
    return env_path


def _already_installed() -> bool:
    """若 ~/.openclaw/openclaw.json 中已配置 slots.memory 为本插件，视为已安装。"""
    path = os.path.join(os.path.expanduser("~/.openclaw"), "openclaw.json")
    if not os.path.isfile(path):
        return False
    try:
        with open(path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        slots = (cfg.get("plugins") or {}).get("slots") or {}
        return slots.get("memory") == "openclaw-memory-alibaba-mysql"
    except Exception:
        return False


def main() -> None:
    parser = argparse.ArgumentParser(
        description="安装 openclaw-memory-alibaba-mysql（阿里云 RDS + 插件注册）。AK/SK、DASHSCOPE_API_KEY 从环境变量读取；购买参数可从命令行 JSON 传入。"
    )
    parser.add_argument(
        "params_json",
        nargs="?",
        default="",
        help="购买参数 JSON，仅需地域与网络 4 项（实例固定为基础版 Serverless）。例: '{\"region_id\":\"cn-hangzhou\",\"vpc_id\":\"vpc-xxx\",\"vswitch_id\":\"vsw-xxx\",\"zone_id\":\"cn-hangzhou-h\"}'。不传则从环境变量或交互输入读取。",
    )
    parser.add_argument(
        "--yes", "-y",
        action="store_true",
        help="跳过费用确认，直接继续（用于由调用方已确认时）。",
    )
    args = parser.parse_args()

    print("[安装] 开始安装 openclaw-memory-alibaba-mysql（阿里云 RDS + 插件注册）", flush=True)
    _check_python_version()
    print("[安装] 阶段：校验 Python 版本通过", flush=True)
    if _already_installed():
        print("检测到已安装 openclaw-memory-alibaba-mysql（plugins.slots.memory 已配置）。是否更新 openclaw-memory-alibaba-mysql 插件？(y/yes 更新，其他退出)", flush=True)
        do_update = args.yes
        if not do_update:
            try:
                line = input("> ").strip().lower()
                do_update = line in ("y", "yes")
            except EOFError:
                pass
        if do_update:
            script_dir = os.path.dirname(os.path.abspath(__file__))
            update_py = os.path.join(script_dir, "update.py")
            code = subprocess.run([sys.executable, update_py], cwd=os.path.dirname(script_dir)).returncode
            sys.exit(code if code != 0 else 0)
        print("已取消，退出。", flush=True)
        sys.exit(0)

    ecs_params = _get_ecs_metadata_params()
    if ecs_params:
        print(
            "[安装] 观察到您正处在阿里云 ECS 环境内，我们将自动创建一个同地域、同 VPC、同可用区的 Serverless 基础版实例（采用 ECS 元数据，忽略调用输入）。",
            flush=True,
        )
        print(
            f"[安装] 地域={ecs_params.get('region_id')} VPC={ecs_params.get('vpc_id')} 交换机={ecs_params.get('vswitch_id')} 可用区={ecs_params.get('zone_id')}",
            flush=True,
        )
    elif args.params_json and args.params_json.strip():
        print("[安装] 阶段：购买参数将来自调用输入（JSON）或环境变量", flush=True)
    else:
        print(
            "[安装] 观察到您未处在阿里云 ECS 环境内，需要您手动输入地域、VPC、可用区、交换机等参数来创建一个 Serverless 基础版实例，并自行保证网络可达；安装完成后可能需要在 ~/.openclaw/openclaw.json 中修改数据库连接域名。",
            flush=True,
        )

    if not args.yes:
        step1_confirm()
        print("[安装] 阶段：用户已确认费用与流程", flush=True)
    else:
        print("[安装] 阶段：已使用 --yes，跳过确认", flush=True)
    step2_aksk()
    print("[安装] 阶段：AKSK 校验通过（来自环境变量）", flush=True)
    step2b_check_dashscope_api_key()
    print("[安装] 阶段：DASHSCOPE_API_KEY 校验通过（来自环境变量）", flush=True)

    # ECS 元数据优先：有则一律采用，忽略命令行/环境变量中的购买参数
    if ecs_params:
        params = ecs_params
        print("[安装] 阶段：购买参数已从 ECS 元数据就绪", flush=True)
        print(f"[安装] 阶段：VPC={params.get('vpc_id')} VSwitch={params.get('vswitch_id')}（默认路由对应网卡）", flush=True)
    elif args.params_json and args.params_json.strip():
        params = _get_params_from_env_or_prompt(args.params_json)
        print("[安装] 阶段：购买参数已从调用输入（JSON）就绪", flush=True)
    else:
        params = _get_params_from_env_or_prompt(args.params_json)
        print("[安装] 阶段：购买参数已就绪", flush=True)
    region_id = params["region_id"]
    vpc_id = params["vpc_id"]
    vswitch_id = params["vswitch_id"]
    zone_id = params["zone_id"]

    db_instance_id = step3_create_instance(region_id, vpc_id, vswitch_id, zone_id)
    step4_wait_running(region_id, db_instance_id)

    print("[安装] 阶段：开启向量支持...", flush=True)
    _sdk_modify_vector_support(region_id, db_instance_id, "ON")
    print("[安装] 阶段：向量支持已开启", flush=True)

    print("[安装] 阶段：创建数据库 openclaw_memory...", flush=True)
    try:
        _sdk_create_database(region_id, db_instance_id, "openclaw_memory", "utf8mb4")
    except Exception as e:
        if "Duplicate" in str(e) or "already exists" in str(e).lower() or "InvalidDBName.Duplicate" in str(e):
            print("[安装] 数据库 openclaw_memory 已存在，跳过。", flush=True)
        else:
            raise
    else:
        print("[安装] 阶段：数据库 openclaw_memory 已创建", flush=True)

    account_name = "openclaw_memory"
    account_password = _random_password_8()
    print("[安装] 阶段：创建账号 openclaw_memory 并授权...", flush=True)
    try:
        _sdk_create_account(region_id, db_instance_id, account_name, account_password, "OpenClaw Memory")
    except Exception as e:
        if "InvalidAccountName.AlreadyExists" in str(e) or "already exists" in str(e).lower():
            print("[安装] 账号已存在，仅更新白名单与授权。", flush=True)
            account_password = os.environ.get("OPENCLAW_MEMORY_MYSQL_PASSWORD", "")
            if not account_password:
                print("错误：账号已存在但未提供 OPENCLAW_MEMORY_MYSQL_PASSWORD，无法写入 ~/.bashrc。", file=sys.stderr, flush=True)
                sys.exit(1)
        else:
            raise
    try:
        _sdk_grant_privilege(region_id, db_instance_id, account_name, "openclaw_memory", "ReadWrite")
    except Exception as e:
        if "already" in str(e).lower() or "Duplicate" in str(e):
            pass
        else:
            print(f"[安装] 授权警告: {e}", file=sys.stderr, flush=True)
    else:
        print("[安装] 阶段：账号已创建并授权", flush=True)

    # RDS 白名单：在 ECS 内且元数据有交换机 CIDR 时，用默认路由网卡对应交换机的网段（整段放行）；否则沿用本机单 IP / 公网 IP
    cidr = (params.get("vswitch_cidr_block") or "").strip() if ecs_params else ""
    if ecs_params and cidr:
        whitelist_ip = cidr
        print(f"[安装] 阶段：ECS 元数据（默认路由网卡）交换机网段，设置白名单为: {whitelist_ip}", flush=True)
    else:
        if ecs_params:
            print("[安装] 阶段：ECS 元数据未返回 vswitch-cidr-block，回退为本机 IP 白名单。", flush=True)
        whitelist_ip = _get_default_route_src()
        if whitelist_ip:
            print(f"[安装] 阶段：设置白名单为本机内网/出口 IP: {whitelist_ip}", flush=True)
        else:
            whitelist_ip = _get_my_public_ip()
            print(f"[安装] 阶段：设置白名单为本机公网 IP: {whitelist_ip}", flush=True)
    _sdk_modify_security_ips(region_id, db_instance_id, whitelist_ip, "MIX")
    print("[安装] 阶段：白名单已设置", flush=True)

    connection_string = _get_connection_string(region_id, db_instance_id)
    if not connection_string:
        connection_string = f"{db_instance_id}.rwlb.rds.aliyuncs.com"

    bashrc = os.path.expanduser("~/.bashrc")
    block = f"""
# OpenClaw Memory RDS
export MYSQL_HOST="{connection_string}"
export MYSQL_USER="{account_name}"
export MYSQL_PASSWORD="{account_password}"
export MYSQL_DATABASE="openclaw_memory"
"""
    # 只删除「# OpenClaw Memory RDS」注释和 4 个 KEY 的 export 行（若已存在），再追加新内容
    drop_patterns = (
        "# OpenClaw Memory RDS",
        "export MYSQL_HOST=",
        "export MYSQL_USER=",
        "export MYSQL_PASSWORD=",
        "export MYSQL_DATABASE=",
    )

    if os.path.isfile(bashrc):
        with open(bashrc, "r", encoding="utf-8") as f:
            lines = f.readlines()
        lines = [ln for ln in lines if not any(ln.strip().startswith(p) for p in drop_patterns)]
        content = "".join(lines).rstrip()
        if content and not content.endswith("\n"):
            content += "\n"
    else:
        content = ""
    with open(bashrc, "w", encoding="utf-8") as f:
        f.write(content)
        f.write(block.strip() + "\n")
    print(f"[安装] 阶段：已追加环境变量到 {bashrc}。", flush=True)

    dashscope_key = (os.environ.get("DASHSCOPE_API_KEY") or "").strip()
    oc_config_dir = _get_openclaw_config_dir_from_cli()
    if not oc_config_dir:
        oc_config_dir = os.path.expanduser("~/.openclaw")
        print(
            "[安装] 未能通过 openclaw config file | grep openclaw.json 解析配置目录，"
            f"回退在 {oc_config_dir} 写入 .env。",
            flush=True,
        )
    env_path = _write_openclaw_dotenv(
        oc_config_dir,
        mysql_host=connection_string,
        mysql_user=account_name,
        mysql_password=account_password,
        mysql_database="openclaw_memory",
        dashscope_api_key=dashscope_key,
    )
    print(f"[安装] 阶段：已写入 {env_path}。", flush=True)

    subprocess.run([os.environ.get("SHELL", "bash"), "-c", f"source {bashrc}"], timeout=5, capture_output=True)
    print("[安装] 阶段：已执行 source ~/.bashrc。", flush=True)

    # npm install：先切国内镜像，结束后恢复；超时或失败则改试 registry.npmjs.org 一次
    plugins_dir = os.path.expanduser("~/.openclaw/plugins")
    os.makedirs(plugins_dir, exist_ok=True)
    pkg_json = os.path.join(plugins_dir, "package.json")
    if not os.path.isfile(pkg_json):
        subprocess.run(["npm", "init", "-y"], cwd=plugins_dir, check=True, capture_output=True, timeout=30)

    npm_registry_cn = "https://registry.npmmirror.com"
    npm_registry_official = "https://registry.npmjs.org"

    get_reg = subprocess.run(
        ["npm", "config", "get", "registry"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    saved_registry = (get_reg.stdout or "").strip()
    print(
        f"[安装] 阶段：安装前 npm 源（将暂时切国内源并在结束后恢复）: {saved_registry or '(默认)'}",
        flush=True,
    )
    try:
        subprocess.run(
            ["npm", "config", "set", "registry", npm_registry_cn],
            check=True,
            capture_output=True,
            timeout=10,
        )
        print(f"[安装] 阶段：已切换为国内源 {npm_registry_cn}。", flush=True)
    except Exception as e:
        print(f"[安装] 阶段：切换国内源失败，将用当前源首次尝试: {e}", flush=True)

    print("[安装] 阶段：安装 npm 包 openclaw-memory-alibaba-mysql...", flush=True)

    def _run_npm_install() -> subprocess.CompletedProcess:
        return subprocess.run(
            ["npm", "install", "openclaw-memory-alibaba-mysql"],
            cwd=plugins_dir,
            capture_output=True,
            text=True,
            timeout=120,
        )

    result: Optional[subprocess.CompletedProcess] = None
    try:
        try:
            result = _run_npm_install()
        except subprocess.TimeoutExpired:
            print("[安装] 阶段：国内/当前源 npm install 超时，改试官方源。", flush=True)
            try:
                subprocess.run(
                    ["npm", "config", "set", "registry", npm_registry_official],
                    check=True,
                    capture_output=True,
                    timeout=10,
                )
            except Exception as ex:
                print(f"[安装] 切换官方源失败: {ex}", file=sys.stderr, flush=True)
                sys.exit(1)
            result = _run_npm_install()
        else:
            if result.returncode != 0:
                print("[安装] 阶段：国内/当前源 npm install 失败，改试官方源。", flush=True)
                try:
                    subprocess.run(
                        ["npm", "config", "set", "registry", npm_registry_official],
                        check=True,
                        capture_output=True,
                        timeout=10,
                    )
                except Exception as ex:
                    print(f"[安装] 切换官方源失败: {ex}", file=sys.stderr, flush=True)
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
                print(f"[安装] 阶段：已恢复 npm 源为 {saved_registry}。", flush=True)
            except Exception as e:
                print(f"[安装] 阶段：恢复 npm 源失败（请手动恢复）: {e}", file=sys.stderr, flush=True)
        else:
            try:
                subprocess.run(
                    ["npm", "config", "delete", "registry"],
                    check=True,
                    capture_output=True,
                    timeout=10,
                )
                print("[安装] 阶段：已恢复 npm 源为默认。", flush=True)
            except Exception as e:
                print(f"[安装] 阶段：恢复 npm 源失败（请手动恢复）: {e}", file=sys.stderr, flush=True)
    plugin_path = os.path.abspath(os.path.join(plugins_dir, "node_modules", "openclaw-memory-alibaba-mysql"))
    if not os.path.isdir(plugin_path):
        print(f"错误：未找到插件目录 {plugin_path}", file=sys.stderr, flush=True)
        sys.exit(1)
    print(f"[安装] 阶段：npm 包已安装至 {plugin_path}", flush=True)

    # 合并写入 ~/.openclaw/openclaw.json
    openclaw_dir = os.path.expanduser("~/.openclaw")
    openclaw_json_path = os.path.join(openclaw_dir, "openclaw.json")
    os.makedirs(openclaw_dir, exist_ok=True)
    if os.path.isfile(openclaw_json_path):
        with open(openclaw_json_path, "r", encoding="utf-8") as f:
            openclaw_cfg = json.load(f)
    else:
        openclaw_cfg = {}
    if "plugins" not in openclaw_cfg:
        openclaw_cfg["plugins"] = {}
    pl = openclaw_cfg["plugins"]
    if "load" not in pl:
        pl["load"] = {"paths": []}
    if "paths" not in pl["load"]:
        pl["load"]["paths"] = []
    if plugin_path not in pl["load"]["paths"]:
        pl["load"]["paths"].append(plugin_path)
    if "slots" not in pl:
        pl["slots"] = {}
    pl["slots"]["memory"] = "openclaw-memory-alibaba-mysql"
    if "entries" not in pl:
        pl["entries"] = {}
    pl["entries"]["openclaw-memory-alibaba-mysql"] = {
        "enabled": True,
        "config": {
            "mysql": {
                "host": "${MYSQL_HOST}",
                "port": 3306,
                "user": "${MYSQL_USER}",
                "password": "${MYSQL_PASSWORD}",
                "database": "openclaw_memory",
                "ssl": False,
            },
            "embedding": {
                "apiKey": "${DASHSCOPE_API_KEY}",
                "model": "text-embedding-v3",
                "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "dimensions": 1024,
            },
            "llm": {
                "apiKey": "${DASHSCOPE_API_KEY}",
                "model": "qwen-plus",
                "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            },
            "memory_duplication_conflict_process": True,
            "enableFullContextMemory": True,
            "enableSelfImprovingMemory": True,
            "memoryExtractionMethod": "llm",
            "autoRecall": True,
            "autoCapture": True,
            "captureMaxChars": 50000,
            "enableMemoryDecay": True,
            "tableName": "openclaw_memories",
        },
    }
    if "allow" not in pl:
        pl["allow"] = []
    if "openclaw-memory-alibaba-mysql" not in pl["allow"]:
        pl["allow"].append("openclaw-memory-alibaba-mysql")
    with open(openclaw_json_path, "w", encoding="utf-8") as f:
        json.dump(openclaw_cfg, f, indent=2, ensure_ascii=False)
    print(f"[安装] 阶段：已在 {openclaw_json_path} 中注册插件 openclaw-memory-alibaba-mysql。", flush=True)
    print("[安装] 安装完成。请执行 openclaw gateway restart（或等价方式）以使插件读取 .env 并生效。", flush=True)


if __name__ == "__main__":
    main()
