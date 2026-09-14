#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verifie que l'assistant repond sur les donnees reelles de l'application.

Complement de `profile_chatbot.py`, qui mesure les performances : ce script
controle le *contenu*. Il pose des questions dont la reponse exacte est connue
dans la base de demonstration, puis enchaine une conversation (l'historique
s'accumule, comme dans le widget) pour verifier que la fenetre de contexte suffit.

Usage (la stack Docker doit tourner) :

    python3 scripts/verify_chatbot_data.py

Les reponses attendues sont celles de la base de demonstration livree avec le
projet ; elles changent si vous modifiez les vols, la flotte ou les aeroports.
"""

import json
import urllib.request

BACKEND = "http://localhost:8000"

# titre, question, reponse attendue (base de demonstration)
QUESTIONS = [
    (
        "Vols",
        "Combien de vols sont enregistres dans la base, et combien sont deficitaires ?",
        "178 vols enregistres, 94 deficitaires",
    ),
    (
        "Plus forte perte",
        "Quel vol a la marge la plus faible ? Donne son numero, sa route et sa marge.",
        "AT-866 CMN-BCN, marge -79,6 %",
    ),
    (
        "Avion",
        "Quelle est la marge moyenne des vols operes par le Boeing 787-9, et combien de vols cela represente-t-il ?",
        "30,6 % sur 39 vols",
    ),
]

# Verifie que l'historique accumule ne fait pas deborder la fenetre de contexte.
CONVERSATION = [
    "Combien d'avions compte la flotte et lesquels ?",
    "Quel avion de la flotte a la marge moyenne la plus faible, et quelle est cette marge ?",
    "Quel est le cout par passager de cet avion ?",
    "Compare ce cout par passager a celui du Boeing 787-9.",
    "Quel avion de la flotte recommanderais-tu pour un vol CMN-LHR, et pourquoi ?",
]


def post(url, payload, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    requete = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers
    )
    with urllib.request.urlopen(requete, timeout=300) as reponse:
        return json.loads(reponse.read().decode("utf-8"))


def main():
    token = post(
        BACKEND + "/api/auth/login", {"username": "admin", "password": "admin123"}
    )["access_token"]

    print("=" * 72)
    print("REPONSES ATTENDUES (base de demonstration)")
    print("=" * 72)
    for titre, question, attendu in QUESTIONS:
        reponse = post(
            BACKEND + "/api/chatbot", {"messages": [{"role": "user", "content": question}]}, token
        )
        print("\n[%s] attendu : %s" % (titre, attendu))
        print("Q:", question)
        print("R:", reponse["content"].strip())

    print("\n" + "=" * 72)
    print("CONVERSATION SUIVIE (l'historique s'accumule comme dans le widget)")
    print("=" * 72)
    historique = []
    for question in CONVERSATION:
        historique.append({"role": "user", "content": question})
        reponse = post(BACKEND + "/api/chatbot", {"messages": historique}, token)
        historique.append({"role": "assistant", "content": reponse["content"]})
        print("\nQ:", question)
        print("R:", reponse["content"].strip())

    print("\n" + "=" * 72)
    print("Verifier ensuite dans les journaux d'Ollama qu'aucun prompt n'a ete tronque :")
    print("    docker logs ram-ollama 2>&1 | grep truncating")
    print("=" * 72)


if __name__ == "__main__":
    main()
