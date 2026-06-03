"""Network egress guard.

The WebUI lets admins configure arbitrary HTTP base URLs for data vendors
(custom_data) and price APIs (backtesting). Without a guard, a malicious
or accidentally-internal URL (e.g. 169.254.169.254 cloud metadata,
10.0.0.0/8 internal services) would be reachable from the server
process. This module provides a single, configurable choke point that all
egress paths must pass through.

Override the default-deny on private networks by setting
``TRADINGAGENTS_ALLOW_PRIVATE_NETWORK_URLS=1`` (e.g. when the deployment
is air-gapped inside a trusted network).
"""
from __future__ import annotations

import ipaddress
import os
import socket
from typing import Any
from urllib.parse import urlparse


_ALLOW_PRIVATE_ENV = "TRADINGAGENTS_ALLOW_PRIVATE_NETWORK_URLS"


def allow_private_networks() -> bool:
    """Whether the deployment explicitly allows private/loopback/link-local URLs.

    Default is to refuse them. Set the environment variable to ``1`` to opt in.
    """
    return os.getenv(_ALLOW_PRIVATE_ENV, "").lower() in {"1", "true", "yes"}


def _resolve_addresses(hostname: str) -> list[str]:
    """Resolve a hostname to all of its IP addresses.

    Returns an empty list if resolution fails so the caller can fail closed.
    """
    try:
        infos = socket.getaddrinfo(hostname, None)
    except (socket.gaierror, UnicodeError, ValueError):
        return []
    return list({info[4][0] for info in infos if info and info[4]})


def _is_blocked_ip(ip_str: str) -> bool:
    """True if the IP belongs to a network we refuse by default.

    Always blocks link-local (169.254.0.0/16 — cloud metadata), loopback
    (127.0.0.0/8, ::1), multicast, and the unspecified address (0.0.0.0, ::).
    Private RFC1918 ranges (10/8, 172.16/12, 192.168/16, fc00::/7) are also
    blocked unless the deployment explicitly opts in.

    We intentionally do not rely on ``ipaddress.is_private``: that predicate
    also flags IANA reserved ranges (e.g. 198.18.0.0/15 benchmarking) that
    public services occasionally resolve to, and would break legitimate
    egress. The allow-by-default list below matches the well-known
    abuse-relevant ranges and nothing else.
    """
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True
    # Always-blocked ranges: any of these is a clear abuse target.
    _always_block = [
        ipaddress.ip_network("0.0.0.0/8"),
        ipaddress.ip_network("127.0.0.0/8"),
        ipaddress.ip_network("169.254.0.0/16"),
        ipaddress.ip_network("::1/128"),
        ipaddress.ip_network("::/128"),
        ipaddress.ip_network("fe80::/10"),
        ipaddress.ip_network("ff00::/8"),
    ]
    for net in _always_block:
        if ip.version == net.version and ip in net:
            return True
    if ip.is_multicast or ip.is_unspecified:
        return True
    if not allow_private_networks():
        _private = [
            ipaddress.ip_network("10.0.0.0/8"),
            ipaddress.ip_network("172.16.0.0/12"),
            ipaddress.ip_network("192.168.0.0/16"),
            ipaddress.ip_network("fc00::/7"),
        ]
        for net in _private:
            if ip.version == net.version and ip in net:
                return True
    return False


def assert_safe_url(url: str, *, context: str) -> str:
    """Validate an outbound URL and return the cleaned form.

    Raises ``ValueError`` if the URL is unsafe. The error message includes
    the caller-supplied ``context`` so the failure can be traced back to
    the config field that produced it.
    """
    if not url:
        raise ValueError(f"Refusing empty URL for {context}.")
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise ValueError(
            f"Refusing {context}: scheme '{parsed.scheme}' is not allowed (use http or https)."
        )
    host = (parsed.hostname or "").strip()
    if not host:
        raise ValueError(f"Refusing {context}: missing hostname.")
    addresses = _resolve_addresses(host)
    if not addresses:
        # Fail closed: if DNS doesn't resolve, don't try the URL either.
        raise ValueError(f"Refusing {context}: hostname '{host}' did not resolve.")
    for ip_str in addresses:
        if _is_blocked_ip(ip_str):
            if allow_private_networks():
                raise ValueError(
                    f"Refusing {context}: hostname '{host}' resolves to blocked address '{ip_str}'."
                )
            raise ValueError(
                f"Refusing {context}: hostname '{host}' resolves to a private/blocked address '{ip_str}'. "
                f"Set {_ALLOW_PRIVATE_ENV}=1 to allow private network URLs."
            )
    cleaned = url.strip().rstrip("/")
    return cleaned


def safe_request_kwargs(url: str, *, context: str) -> dict[str, Any]:
    """Validate a URL and return kwargs safe to spread into ``requests.*``.

    Performs the same hostname/address checks as :func:`assert_safe_url`
    and additionally disables redirect-following so a 30x cannot exfiltrate
    the request to a private host.
    """
    assert_safe_url(url, context=context)
    # The ``timeout`` is a hard upper bound on how long we wait for the
    # remote service so a hostile endpoint cannot pin a worker thread
    # forever. ``allow_redirects=False`` ensures any 30x stays inside
    # the same egress policy we just enforced.
    return {"timeout": 30, "allow_redirects": False}
