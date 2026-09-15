#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compare les modeles Ollama sur les taches reelles de l'assistant.

Le meme contexte applicatif et les memes questions sont envoyes a chaque
configuration ; seuls le modele et la taille de fenetre changent. Le script
mesure les performances (chargement, lecture du prompt, generation, memoire) et
controle l'exactitude des reponses sur des valeurs connues de la base de
demonstration.

Usage (la stack Docker doit tourner) :

    python3 scripts/benchmark_models.py

Bibliotheque standard uniquement. Les resultats detailles sont ecrits dans
/tmp/benchmark_modeles.json.
"""

import json
import re
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request

OLLAMA = "http://localhost:11434"
CHAT = OLLAMA + "/api/chat"
PS = OLLAMA + "/api/ps"

# systeme = contexte applicatif reel, recupere aupres du backend (voir
# app/services/app_context.py) pour que les deux modeles voient exactement la
# meme chose.
COMMANDE_CONTEXTE = [
    "docker", "exec", "ram-backend", "python", "-c",
    "from app.routers.chatbot import _conversation; from app.schemas import ChatMessage; "
    "print(_conversation([ChatMessage(role='user', content='x')])[0]['content'])",
]

# (modele, taille de fenetre). num_predict=1024 partout, comme l'application.
CONFIGURATIONS = [
    ("llama3.2:latest", 16384),   # modele precedent (3B) : reference de comparaison
    ("llama3.1:8b", 16384),
    ("llama3.1:8b", 12288),
    ("llama3.1:8b", 10240),       # configuration actuelle de l'application
    ("llama3.1:8b", 8192),
]

NUM_PREDICT = 1024
KEEP_ALIVE = "30m"
TIMEOUT = 900

# Questions dont la reponse exacte est connue dans la base de demonstration.
# Chaque question passe si tous ses groupes de controle trouvent une correspondance.
#
# ATTENTION : ces valeurs attendues sont liees au jeu de donnees de demonstration
# (backend/app/seed_data.py). Toute recalibration du jeu les invalide : il faut
# alors relire build_app_context() et mettre a jour les valeurs ci-dessous avant
# de rejouer le banc d'essai.
QUESTIONS = [
    {
        "question": "Combien de vols sont enregistrés dans la base, et combien sont déficitaires ?",
        "attendu": "185 vols enregistrés, 44 déficitaires",
        "controles": [["185"], ["44"]],
    },
    {
        "question": "Quel vol a la marge la plus faible ? Donne son numéro, sa route et sa marge.",
        "attendu": "AT-866 (CMN-BCN), marge -18,6 %",
        "controles": [["at-866", "at866"], ["18.6"]],
    },
    {
        "question": "Quel avion a la marge moyenne la plus élevée, et quelle est cette marge ?",
        "attendu": "Embraer E190, marge moyenne 8,1 %",
        "controles": [["e190"], ["8.1"]],
    },
    {
        "question": "Quel est le coût par passager moyen du Boeing 787-9 ?",
        "attendu": "3810 MAD par passager",
        "controles": [["3810", "3 810"]],
    },
    {
        "question": "Quel est le coût par passager moyen de l'ATR 72-600 ?",
        # La valeur brute "737" ne suffit pas comme controle : elle apparait deja
        # dans le contexte sous la forme des appareils "Boeing 737-800" et
        # "Boeing 737 MAX 8", ce qui ferait passer la question sans que le modele
        # ait trouve le cout par passager. On exige donc la devise.
        "attendu": "737 MAD par passager",
        "controles": [["737 mad", "737mad", "737 dirhams"]],
    },
]


def normaliser(texte: str) -> str:
    return texte.lower().replace(",", ".").replace("\u202f", " ")


def evaluer(reponse: str, controles) -> bool:
    """Vrai si chaque groupe de controle trouve une correspondance.

    La correspondance est ancree sur les limites de nombre : un controle comme
    "44" ne doit pas etre satisfait par "1 344" ni par "440", qui sont d'autres
    valeurs. Sans cette precaution, un contexte riche en chiffres (distances,
    montants, capacites) provoque des faux positifs -- et donc des scores
    gonfles, ce qui est exactement ce qu'un banc d'essai doit eviter.
    """
    texte = normaliser(reponse)
    return all(
        any(
            re.search(
                r"(?<![\d.,])" + re.escape(normaliser(alternative)) + r"(?!\d)", texte
            )
            for alternative in groupe
        )
        for groupe in controles
    )


def appel(charge, timeout=TIMEOUT):
    requete = urllib.request.Request(
        CHAT, data=json.dumps(charge).encode("utf-8"), headers={"Content-Type": "application/json"}
    )
    debut = time.perf_counter()
    with urllib.request.urlopen(requete, timeout=timeout) as reponse:
        data = json.loads(reponse.read().decode("utf-8"))
    return data, time.perf_counter() - debut


def decharger(modele):
    try:
        appel({"model": modele, "stream": False, "keep_alive": 0,
               "messages": [{"role": "user", "content": "hi"}], "options": {"num_predict": 1}})
    except Exception:
        pass


def memoire(modele):
    """(size_vram, size) du modele charge, en Go."""
    try:
        with urllib.request.urlopen(PS, timeout=60) as reponse:
            for entree in json.loads(reponse.read()).get("models", []):
                if entree.get("name") == modele or entree.get("model") == modele:
                    return entree.get("size_vram", 0) / 1e9, entree.get("size", 0) / 1e9
    except Exception:
        pass
    return 0.0, 0.0


def processeur():
    """Colonne PROCESSOR de `ollama ps` (indique un eventuel debordement sur CPU)."""
    try:
        lignes = subprocess.run(
            ["docker", "exec", "ram-ollama", "ollama", "ps"],
            capture_output=True, text=True, timeout=60, check=True,
        ).stdout.strip().splitlines()
        if len(lignes) < 2:
            return "aucun modele charge"
        # NAME | ID | SIZE | PROCESSOR | CONTEXT | UNTIL...
        # PROCESSOR vaut "100% GPU" ou "50%/50% CPU/GPU" : deux jetons.
        champs = lignes[-1].split()
        # Le libelle contient un pourcentage ("100% GPU", "50%/50% CPU/GPU") :
        # on le repere plutot que de compter les colonnes, la taille etant
        # elle-meme coupee en deux jetons ("6.1 GB").
        for index, champ in enumerate(champs):
            if "%" in champ and index + 1 < len(champs):
                return "%s %s" % (champ, champs[index + 1])
        return lignes[-1]
    except Exception:
        return "?"


def mesurer(modele, num_ctx, systeme):
    resultat = {"modele": modele, "num_ctx": num_ctx, "reponses": [], "erreur": None}

    decharger(modele)
    options = {"num_predict": NUM_PREDICT, "num_ctx": num_ctx}

    # 1. Chargement a froid : modele decharge juste avant, reponse d'un jeton.
    try:
        data, _ = appel({
            "model": modele, "stream": False, "keep_alive": KEEP_ALIVE,
            "messages": [{"role": "system", "content": systeme},
                         {"role": "user", "content": "Bonjour"}],
            "options": {"num_predict": 1, "num_ctx": num_ctx},
        })
        resultat["chargement_ms"] = data.get("load_duration", 0) / 1e6
        resultat["prompt_jetons"] = data.get("prompt_eval_count", 0)
        resultat["prompt_ms"] = data.get("prompt_eval_duration", 0) / 1e6
    except Exception as erreur:
        resultat["erreur"] = "chargement : %s" % erreur
        return resultat

    # 2. Questions, avec l'historique vide (comme une nouvelle conversation).
    for item in QUESTIONS:
        try:
            data, murale = appel({
                "model": modele, "stream": False, "keep_alive": KEEP_ALIVE,
                "messages": [{"role": "system", "content": systeme},
                             {"role": "user", "content": item["question"]}],
                "options": options,
            })
            reponse = data.get("message", {}).get("content", "")
            resultat["reponses"].append({
                "question": item["question"],
                "attendu": item["attendu"],
                "reponse": reponse,
                "correct": evaluer(reponse, item["controles"]),
                "murale_ms": murale * 1000,
                "eval_jetons": data.get("eval_count", 0),
                "eval_ms": data.get("eval_duration", 0) / 1e6,
                "prompt_jetons": data.get("prompt_eval_count", 0),
                "fin": data.get("done_reason", ""),
            })
        except urllib.error.URLError as erreur:
            resultat["reponses"].append({
                "question": item["question"], "attendu": item["attendu"],
                "reponse": "", "correct": False, "erreur": str(erreur),
                "murale_ms": 0, "eval_jetons": 0, "eval_ms": 0, "prompt_jetons": 0, "fin": "erreur",
            })

    resultat["vram_go"], resultat["taille_go"] = memoire(modele)
    resultat["processeur"] = processeur()
    return resultat


def resumer(resultat):
    if resultat.get("erreur"):
        return "ECHEC (%s)" % resultat["erreur"]
    reponses = [r for r in resultat["reponses"] if r["eval_ms"]]
    debit = statistics.median(r["eval_jetons"] / (r["eval_ms"] / 1000) for r in reponses) if reponses else 0
    murale = statistics.median(r["murale_ms"] for r in reponses) if reponses else 0
    correctes = sum(1 for r in resultat["reponses"] if r["correct"])
    return (
        "%-16s ctx=%-6d %5.1f tok/s | mediane %5.0f ms | %d/%d correctes | VRAM %.2f/%.2f Go | %s"
        % (
            resultat["modele"], resultat["num_ctx"], debit, murale, correctes,
            len(resultat["reponses"]), resultat["vram_go"], resultat["taille_go"],
            resultat["processeur"],
        )
    )


def configurations():
    """Matrice par defaut, ou matrice passee en arguments : modele:num_ctx."""
    arguments = sys.argv[1:]
    if not arguments:
        return CONFIGURATIONS
    matrice = []
    for argument in arguments:
        modele, _, contexte = argument.rpartition(":")
        matrice.append((modele, int(contexte)))
    return matrice


def main():
    systeme = subprocess.run(
        COMMANDE_CONTEXTE, capture_output=True, text=True, timeout=120, check=True
    ).stdout
    print("Contexte applicatif : %d caracteres" % len(systeme))
    print()

    resultats = []
    for modele, num_ctx in configurations():
        print("Mesure de %s (num_ctx=%d)..." % (modele, num_ctx), flush=True)
        resultat = mesurer(modele, num_ctx, systeme)
        resultats.append(resultat)
        print("  " + resumer(resultat), flush=True)
        for reponse in resultat["reponses"]:
            etat = "OK " if reponse["correct"] else "KO "
            extrait = re.sub(r"\s+", " ", reponse["reponse"])[:110]
            print("    %s%s -> %s" % (etat, reponse["attendu"], extrait), flush=True)
        print()

    with open("/tmp/benchmark_modeles.json", "w", encoding="utf-8") as fichier:
        json.dump({"contexte_caracteres": len(systeme), "resultats": resultats}, fichier,
                  ensure_ascii=False, indent=1)
    print("Resultats detailles : /tmp/benchmark_modeles.json")

    print()
    print("=" * 100)
    for resultat in resultats:
        print(resumer(resultat))


if __name__ == "__main__":
    main()
