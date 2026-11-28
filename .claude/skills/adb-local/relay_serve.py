#!/usr/bin/env python3
"""Persistent TCP relay 127.0.0.1:<listen> -> TV:<port> — fork per client.

The adb TRANSPORT lives on this pipe (the adb server's own outbound dials
are intercepted by local VPN/proxy software; python's are not), so this must
stay alive for the whole adb session. If it dies: restart it, then re-run
`adb connect 127.0.0.1:<listen>`.

Usage: relay_serve.py <listen_port> <tv_port> [tv_host=192.168.0.215]
"""
import socket, sys, threading

LISTEN_PORT = int(sys.argv[1])
TV_PORT = int(sys.argv[2])
TV_HOST = sys.argv[3] if len(sys.argv) > 3 else "192.168.0.215"

def pump(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        try:
            dst.shutdown(socket.SHUT_WR)
        except OSError:
            pass

def handle(cli):
    try:
        up = socket.create_connection((TV_HOST, TV_PORT), 5)
    except OSError as e:
        print(f"dial {TV_HOST}:{TV_PORT} failed: {e}", flush=True)
        cli.close()
        return
    print(f"session: client <-> {TV_HOST}:{TV_PORT}", flush=True)
    threading.Thread(target=pump, args=(cli, up), daemon=True).start()
    pump(up, cli)

srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", LISTEN_PORT))
srv.listen(4)
print(f"relay up: 127.0.0.1:{LISTEN_PORT} -> {TV_HOST}:{TV_PORT}", flush=True)
while True:
    cli, _ = srv.accept()
    threading.Thread(target=handle, args=(cli,), daemon=True).start()
