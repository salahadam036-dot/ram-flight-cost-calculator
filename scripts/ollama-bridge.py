#!/usr/bin/env python3
"""Pont TCP vers un Ollama distant (contournement du blocage « reseau local »).

Pourquoi ce script ?
--------------------
Depuis macOS 15, l'acces des applications aux autres appareils du reseau local
est soumis a une autorisation explicite (Reglages Systeme > Confidentialite et
securite > Reseau local). Or, dans Docker Desktop, ce n'est pas `Docker
Desktop.app` qui emet le trafic vers le LAN mais un helper privilegie
(`/Library/PrivilegedHelperTools/com.docker.vmnetd` et `com.docker.virtualization`).
Autoriser « Docker Desktop » dans la liste ne suffit donc pas toujours.

Consequence mesuree : les conteneurs joignent Internet mais **aucune** adresse
192.168.x.x, quel que soit le mode reseau (bridge ou host) :

    conteneur -> 1.1.1.1:443           OK
    conteneur -> 192.168.11.107:11434  timeout
    conteneur -> 192.168.11.1:80       timeout
    conteneur (--network host) -> LAN  No route to host

L'hote, lui, y accede sans probleme. Ce script s'execute donc sur l'hote et fait
le relais : les conteneurs l'appellent via `host.docker.internal` (qui, lui,
fonctionne), et il transmet vers l'Ollama distant.

Usage
-----
    python3 scripts/ollama-bridge.py [hote_distant] [port_distant] [port_local]
    # defauts : 192.168.11.107 11434 11435

En arriere-plan (survit a la fermeture du terminal) :

    nohup python3 scripts/ollama-bridge.py > /tmp/ollama-bridge.log 2>&1 &

Puis, dans `.env` :

    OLLAMA_URL=http://host.docker.internal:11435/api/chat

Verification depuis un conteneur :

    docker exec ram-backend python -c "import urllib.request; \\
      print(urllib.request.urlopen('http://host.docker.internal:11435/api/tags').read()[:120])"

Solution definitive (a essayer en premier) : quitter completement Docker Desktop
(menu baleine > Quit), puis le relancer — l'autorisation « Reseau local » n'est
prise en compte qu'au demarrage de l'application. Si les conteneurs joignent
alors directement 192.168.11.107, ce script devient inutile.
"""

from __future__ import annotations

import socket
import socketserver
import sys
import threading

TARGET_HOST = sys.argv[1] if len(sys.argv) > 1 else "192.168.11.107"
TARGET_PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 11434
LISTEN_PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 11435

BUFFER = 65536


def pump(src: socket.socket, dst: socket.socket) -> None:
    """Recopie les octets de `src` vers `dst` jusqu'a fermeture."""
    try:
        while True:
            data = src.recv(BUFFER)
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


class Handler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        try:
            upstream = socket.create_connection((TARGET_HOST, TARGET_PORT), timeout=30)
        except OSError as exc:
            print(f"[pont] amont injoignable ({TARGET_HOST}:{TARGET_PORT}) : {exc}", flush=True)
            return

        upstream.settimeout(None)
        self.request.settimeout(None)

        # Un thread par sens : la requete descend, la reponse remonte.
        back = threading.Thread(target=pump, args=(upstream, self.request), daemon=True)
        back.start()
        pump(self.request, upstream)
        back.join(timeout=5)
        upstream.close()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    print(
        f"[pont] ecoute sur 0.0.0.0:{LISTEN_PORT} -> {TARGET_HOST}:{TARGET_PORT}\n"
        f"[pont] .env : OLLAMA_URL=http://host.docker.internal:{LISTEN_PORT}/api/chat",
        flush=True,
    )
    try:
        Server(("0.0.0.0", LISTEN_PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\n[pont] arrete.", flush=True)


if __name__ == "__main__":
    main()
