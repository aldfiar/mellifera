#!/usr/bin/env python3
"""One-shot TCP relay 127.0.0.1:15000 -> TV pairing port, then drive `adb pair`
through it. Usage: relay_pair.py <pairing_port> <code>

python's sockets reach the TV direct (proven: real ADB AUTH handshake); the
adb binary's dials get intercepted by local VPN/proxy software — so the
pairing protocol flows through this pipe instead. The 6-digit code expires
~30-60 s: get it from the TV (Developer options → Wireless debugging →
Pair device with code) and run IMMEDIATELY.
"""
import socket, subprocess, sys, threading, time

TV_HOST = "192.168.0.215"
TV_PORT = int(sys.argv[1])
CODE = sys.argv[2] if len(sys.argv) > 2 else ""
LISTEN = ("127.0.0.1", 15000)

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

srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(LISTEN)
srv.listen(1)
print(f"relay listening {LISTEN[0]}:{LISTEN[1]} -> {TV_HOST}:{TV_PORT}", flush=True)

def relay_session():
    cli, _ = srv.accept()
    print("adb connected to relay", flush=True)
    up = socket.create_connection((TV_HOST, TV_PORT), 5)
    print(f"relay dialed {TV_HOST}:{TV_PORT}", flush=True)
    t1 = threading.Thread(target=pump, args=(cli, up), daemon=True)
    t2 = threading.Thread(target=pump, args=(up, cli), daemon=True)
    t1.start(); t2.start()
    t1.join(); t2.join()

session = threading.Thread(target=relay_session, daemon=True)
session.start()
time.sleep(0.3)

ADB = "/Users/aldfiar/Library/Android/sdk/platform-tools/adb"
r = subprocess.run([ADB, "pair", f"{LISTEN[0]}:{LISTEN[1]}", CODE],
                   capture_output=True, text=True, timeout=20)
print("adb pair rc:", r.returncode)
print(r.stdout.strip())
print(r.stderr.strip())
