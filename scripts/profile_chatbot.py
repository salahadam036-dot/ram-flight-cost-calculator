#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test et profilage de l'assistant Ollama, du frontend jusqu'au GPU.

Le script reproduit exactement ce que fait le widget de chat du frontend :
le bundle de production est compile avec VITE_API_URL=http://127.0.0.1:8000/api
(voir frontend/.env.production), donc le navigateur appelle le backend en
direct, en envoyant tout l'historique de la conversation a chaque tour.

Il descend ensuite couche par couche pour attribuer le temps passe :

    navigateur -> backend FastAPI -> Ollama -> GPU

Usage (la stack Docker doit tourner) :

    python3 scripts/profile_chatbot.py

Bibliotheque standard uniquement, aucune dependance a installer.
"""

import json
import re
import statistics
import subprocess
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

BACKEND = "http://127.0.0.1:8000"
FRONTEND = "http://localhost:5173"
OLLAMA = "http://127.0.0.1:11434"
# Origine de la page servie par le frontend : c'est cet en-tete qui declenche
# le controle CORS du navigateur.
ORIGIN = "http://localhost:5173"

LOGIN = {"username": "admin", "password": "admin123"}

# Reprend les suggestions affichees par le widget de chat.
QUESTIONS = [
    "Comment calculer le cout d'un vol ?",
    "Que signifie BELF ?",
    "Comment simuler un scenario ?",
    "Comment importer des vols depuis Excel ?",
]

TIMEOUT = 300


def request(url, payload=None, headers=None, timeout=TIMEOUT):
    """Requete HTTP. Renvoie (statut, entetes, corps, duree en secondes)."""
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    hdrs = {"Content-Type": "application/json"} if data else {}
    hdrs.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=hdrs)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            return resp.status, dict(resp.headers), body, time.perf_counter() - t0
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read(), time.perf_counter() - t0


def ms(seconds):
    return "%.0f ms" % (seconds * 1000)


def tokens_per_second(count, duration_ns):
    if not duration_ns:
        return 0.0
    return count / (duration_ns / 1e9)


def _valeur_config(config, motif, defaut):
    correspondance = re.search(motif, config)
    return correspondance.group(1) if correspondance else defaut


def read_backend_settings():
    """Reglages Ollama lus dans le code du backend."""
    config = (REPO / "backend/app/config.py").read_text(encoding="utf-8")
    return (
        _valeur_config(
            config, r'OLLAMA_KEEP_ALIVE\s*=\s*os\.getenv\("OLLAMA_KEEP_ALIVE",\s*"([^"]+)"\)', "30m"
        ),
        int(_valeur_config(config, r'OLLAMA_NUM_PREDICT\s*=\s*int\(os\.getenv\("OLLAMA_NUM_PREDICT",\s*"([^"]+)"\)\)', "1024")),
        int(_valeur_config(config, r'OLLAMA_NUM_CTX\s*=\s*int\(os\.getenv\("OLLAMA_NUM_CTX",\s*"([^"]+)"\)\)', "16384")),
    )


def read_system_prompt():
    """Prompt systeme complet, contexte applicatif inclus.

    Le backend le construit a l'execution depuis la base : on le lui demande
    directement, afin que les appels directs a Ollama portent exactement la meme
    charge utile que l'application. Repli sur le prompt du code source si le
    conteneur n'est pas joignable.
    """
    commande = [
        "docker", "exec", "ram-backend", "python", "-c",
        "from app.routers.chatbot import _conversation; from app.schemas import ChatMessage; "
        "print(_conversation([ChatMessage(role='user', content='x')])[0]['content'])",
    ]
    try:
        resultat = subprocess.run(commande, capture_output=True, text=True, timeout=60, check=True)
        if resultat.stdout.strip():
            return resultat.stdout.rstrip("\n")
    except Exception:
        pass
    router = (REPO / "backend/app/routers/chatbot.py").read_text(encoding="utf-8")
    correspondance = re.search(r'SYSTEM_PROMPT = """(.*?)"""', router, re.S)
    return correspondance.group(1) if correspondance else ""


def ollama_payload(system, history, keep_alive, num_predict, num_ctx):
    """Meme charge utile que celle construite par le backend."""
    messages = [{"role": "system", "content": system}] + list(history)
    return {
        "model": "llama3.2",
        "stream": False,
        "messages": messages,
        "keep_alive": keep_alive,
        "options": {"num_predict": num_predict, "num_ctx": num_ctx},
    }


def main():
    keep_alive, num_predict, num_ctx = read_backend_settings()
    system = read_system_prompt()

    print("=" * 72)
    print("PROFILAGE DE L'ASSISTANT OLLAMA")
    print("=" * 72)

    # -- 1. Le frontend appelle-t-il bien le backend ? ----------------------
    print("\n[1] Cablage du frontend (bundle servi par le port 5173)")
    status, _, body, _ = request(FRONTEND + "/")
    print("    page d'accueil            : HTTP %s" % status)
    if status == 200:
        html = body.decode("utf-8", "replace")
        assets = re.findall(r'src="(\./assets/[^"]+\.js)"', html)
        found = None
        for asset in assets:
            st, _, js, _ = request(FRONTEND + "/" + asset.lstrip("./"))
            if st == 200 and b"127.0.0.1:8000" in js:
                found = asset
                break
        if found:
            print("    URL de l'API dans le bundle : http://127.0.0.1:8000/api  (dans %s)" % found)
        else:
            print("    URL de l'API dans le bundle : introuvable (appels relatifs /api ?)")

    # -- 2. CORS, tel que le navigateur l'exige ----------------------------
    print("\n[2] Controle CORS (origine %s)" % ORIGIN)
    status, headers, _, _ = request(
        BACKEND + "/api/auth/login",
        LOGIN,
        {"Origin": ORIGIN},
    )
    allow_origin = headers.get("access-control-allow-origin", "(absent)")
    print("    POST /api/auth/login      : HTTP %s, Access-Control-Allow-Origin: %s" % (status, allow_origin))

    # -- 3. Authentification ------------------------------------------------
    print("\n[3] Authentification (comme apiLogin du frontend)")
    status, _, body, elapsed = request(BACKEND + "/api/auth/login", LOGIN, {"Origin": ORIGIN})
    if status != 200:
        print("    ECHEC (HTTP %s) : %s" % (status, body.decode("utf-8", "replace")[:200]))
        print("    Verifie que la stack tourne : docker compose ps")
        return 1
    token = json.loads(body)["access_token"]
    print("    POST /api/auth/login      : HTTP 200 en %s" % ms(elapsed))
    auth = {"Authorization": "Bearer " + token, "Origin": ORIGIN}

    # -- 4. Bout en bout, comme le widget -----------------------------------
    print("\n[4] Bout en bout : POST /api/chatbot, mode bloc (historique cumule)")
    print("    Le widget de chat utilise la version en flux : voir [10].")
    print("    %-4s %-46s %10s %8s %9s" % ("tour", "question", "latence", "mots", "jetons"))
    history = []
    e2e = []
    for i, question in enumerate(QUESTIONS, start=1):
        history.append({"role": "user", "content": question})
        status, _, body, elapsed = request(BACKEND + "/api/chatbot", {"messages": history}, auth)
        if status != 200:
            print("    tour %-2d ECHEC HTTP %s : %s" % (i, status, body.decode("utf-8", "replace")[:160]))
            return 1
        answer = json.loads(body)["content"]
        history.append({"role": "assistant", "content": answer})
        e2e.append(elapsed)
        words = len(answer.split())
        print(
            "    %-4d %-46s %10s %8d %9s"
            % (i, question[:44], ms(elapsed), words, "~%d" % round(words * 1.3))
        )

    # -- 5. Detail cote Ollama ---------------------------------------------
    print("\n[5] Detail Ollama : meme charge utile, appelee directement")
    print(
        "    %-4s %9s %9s %8s %9s %8s %7s %10s"
        % ("tour", "total", "charge", "prompt", "gen.", "jet/s", "jetons", "fin")
    )
    details = []
    for i, question in enumerate(QUESTIONS, start=1):
        turn = history[: 2 * i - 1]  # jusqu'au message utilisateur inclus
        status, _, body, wall = request(OLLAMA + "/api/chat", ollama_payload(system, turn, keep_alive, num_predict, num_ctx))
        if status != 200:
            print("    tour %-4d ECHEC HTTP %s" % (i, status))
            return 1
        data = json.loads(body)
        gen = tokens_per_second(data.get("eval_count", 0), data.get("eval_duration", 0))
        details.append((data, wall))
        print(
            "    %-4d %9s %9s %8s %9s %8.1f %7d %10s"
            % (
                i,
                ms(data.get("total_duration", 0) / 1e9),
                ms(data.get("load_duration", 0) / 1e9),
                ms(data.get("prompt_eval_duration", 0) / 1e9),
                ms(data.get("eval_duration", 0) / 1e9),
                gen,
                data.get("eval_count", 0),
                data.get("done_reason", "?"),
            )
        )

    # -- 6. Ventilation du temps -------------------------------------------
    print("\n[6] Ventilation du temps (dernier tour)")
    last_data, _ = details[-1]
    last_e2e = e2e[-1]
    internal = last_data.get("total_duration", 0) / 1e9
    prompt_count = last_data.get("prompt_eval_count", 0)
    eval_count = last_data.get("eval_count", 0)
    print("    latence vue par le navigateur      : %10s" % ms(last_e2e))
    print("    dont inference Ollama (interne)    : %10s  (%.0f%%)" % (ms(internal), 100 * internal / last_e2e))
    print("    surcouche backend/HTTP/frontend    : quelques dizaines de ms, voir [6b]")
    print("    lecture du prompt                  : %10s pour %4d jetons (%.0f jetons/s)" % (
        ms(last_data.get("prompt_eval_duration", 0) / 1e9),
        prompt_count,
        tokens_per_second(prompt_count, last_data.get("prompt_eval_duration", 0)),
    ))
    print("    generation                         : %10s pour %4d jetons (%.1f jetons/s)" % (
        ms(last_data.get("eval_duration", 0) / 1e9),
        eval_count,
        tokens_per_second(eval_count, last_data.get("eval_duration", 0)),
    ))

    # Couts fixes, hors generation. On ne peut pas comparer directement les deux
    # chemins avec un nombre de jetons identique : le plafond num_predict du
    # backend n'est pas surchargeable depuis l'exterieur, et la longueur de la
    # reponse varie d'un appel a l'autre (temperature par defaut : 0.8). On
    # mesure donc deux planchers deterministes.
    print("\n[6b] Couts fixes, hors generation (mediane sur 5)")
    rejected = []
    for _ in range(5):
        # Jeton invalide : le backend repond 401 sans appeler Ollama.
        _, _, _, elapsed = request(
            BACKEND + "/api/chatbot",
            {"messages": [{"role": "user", "content": "hi"}]},
            {"Authorization": "Bearer invalide", "Origin": ORIGIN},
        )
        rejected.append(elapsed)
    ollama_floor = []
    for _ in range(5):
        # Un seul jeton genere : mesure le plancher HTTP + lecture du prompt.
        _, _, _, elapsed = request(OLLAMA + "/api/chat", ollama_payload(system, [{"role": "user", "content": "hi"}], keep_alive, 1, num_ctx))
        ollama_floor.append(elapsed)
    print("    backend, requete rejetee (401)     : %10s" % ms(statistics.median(rejected)))
    print("    Ollama, 1 jeton genere             : %10s" % ms(statistics.median(ollama_floor)))
    print("    -> couts fixes de l'ordre de la dizaine de ms, contre ~3000 ms d'inference.")

    # -- 6c. Effet du plafond num_predict ----------------------------------
    truncated = [(i, d) for i, (d, _) in enumerate(details, 1) if d.get("done_reason") == "length"]
    print("\n[6c] Effet du plafond OLLAMA_NUM_PREDICT=%d" % num_predict)
    print("    tours tronques (done_reason=length) : %s" % (", ".join(str(i) for i, _ in truncated) or "aucun"))
    for i, data in truncated:
        answer = history[2 * i - 1]["content"]
        print("    tour %d : %d jetons generes, soit %.1f s de generation" % (
            i, data.get("eval_count", 0), data.get("eval_duration", 0) / 1e9
        ))
        print("      fin de la reponse : ...%s" % answer[-88:].replace("\n", " "))

    # -- 7. Demarrage a froid ----------------------------------------------
    print("\n[7] Demarrage a froid (dechargement force puis rechargement)")
    # keep_alive=0 decharge le modele : la requete suivante paie le rechargement.
    request(OLLAMA + "/api/chat", ollama_payload(system, [{"role": "user", "content": "hi"}], "0", 1, num_ctx))
    _, _, body, _ = request(OLLAMA + "/api/chat", ollama_payload(system, [{"role": "user", "content": "hi"}], keep_alive, 8, num_ctx))
    cold = json.loads(body)
    print("    rechargement du modele             : %10s" % ms(cold.get("load_duration", 0) / 1e9))
    print("    total de la requete a froid        : %10s" % ms(cold.get("total_duration", 0) / 1e9))

    # -- 8. Deux requetes simultanees --------------------------------------
    print("\n[8] Deux requetes simultanees (OLLAMA_NUM_PARALLEL=1)")
    turn = history[: 2 * len(QUESTIONS) - 1]
    payload = ollama_payload(system, turn, keep_alive, num_predict, num_ctx)
    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(request, OLLAMA + "/api/chat", payload) for _ in range(2)]
        results = [f.result() for f in futures]
    wall_parallel = time.perf_counter() - t0
    each = [r[3] for r in results]
    print("    duree de chaque requete            : %s" % ", ".join(ms(e) for e in each))
    print("    duree totale des deux             : %10s" % ms(wall_parallel))
    print("    (si ~= somme des deux, les requetes sont serialisees)")

    # -- 9. Confirmation GPU ------------------------------------------------
    print("\n[9] Confirmation GPU")
    _, _, body, _ = request(OLLAMA + "/api/ps")
    for model in json.loads(body).get("models", []):
        vram = model.get("size_vram", 0)
        print("    %-16s size_vram = %.2f Go   (0 = CPU)" % (model.get("name"), vram / 1e9))

    # -- 10. Diffusion en flux (SSE) ---------------------------------------
    print("\n[10] Diffusion en flux : POST /api/chatbot/stream")
    question = QUESTIONS[0]
    payload = json.dumps({"messages": [{"role": "user", "content": question}]}).encode("utf-8")
    req = urllib.request.Request(
        BACKEND + "/api/chatbot/stream",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + token, "Origin": ORIGIN},
    )
    t0 = time.perf_counter()
    first_token = None
    chunks = 0
    text = ""
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        for raw in resp:
            line = raw.decode("utf-8").strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            event = json.loads(data)
            if event.get("token"):
                if first_token is None:
                    first_token = time.perf_counter() - t0
                chunks += 1
                text += event["token"]
    stream_total = time.perf_counter() - t0
    print("    premier jeton affiche apres          : %10s" % ms(first_token or 0))
    print("    reponse complete apres               : %10s" % ms(stream_total))
    print("    morceaux recus                       : %10d" % chunks)
    print("    mots dans la reponse                 : %10d" % len(text.split()))
    print("    -> le texte apparait des %s, au lieu de rester vide pendant %s." % (ms(first_token or 0), ms(stream_total)))

    print("\n" + "=" * 72)
    print("Rappel des ordres de grandeur de docs/ollama-performance.md :")
    print("    CPU seul : ~2 jetons/s      GPU : ~150 jetons/s")
    print("=" * 72)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
