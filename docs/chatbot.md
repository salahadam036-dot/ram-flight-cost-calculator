# Chatbot IA

L'application embarque un **assistant conversationnel** (bouton « ? » en bas à
droite de l'interface), qui répond en français à des questions sur l'utilisation
de l'application.

## Fonctionnement

- Le chatbot fait appel au service **Ollama** (conteneur `ollama`) via la route
  `POST /api/chatbot`.
- Le modèle utilisé est **`llama3.2`** (configurable via `OLLAMA_MODEL`).
- Un **prompt système** (dans `routers/chatbot.py`) borne l'assistant : il ne répond
  qu'à des questions concernant l'application, en français.

## Dépendances

- Le conteneur `ollama` doit être démarré (inclus dans `docker compose up`).
- Le modèle `llama3.2` est **pré-chargé automatiquement** au premier démarrage du
  conteneur (≈ 2 Go, peut prendre quelques minutes la première fois).

## Sujets couverts

L'assistant peut vous aider sur :

- la gestion de la flotte (ajout / modification / suppression) ;
- la création et la gestion des vols ;
- le calcul des coûts (fixes, variables, marge, seuil de rentabilité) ;
- la simulation de scénarios ;
- le tableau de bord et ses indicateurs ;
- l'import Excel et l'export PDF ;
- la gestion des utilisateurs.

## Dépannage

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| Erreur « Ollama n'est pas demarre » | Conteneur `ollama` arrêté | `docker compose up -d ollama` |
| Réponse très lente | Premier chargement du modèle | Attendre le chargement (`ollama list` pour vérifier) |
| Réponse lente **à chaque** question | Ollama tourne sur CPU, sans GPU | Voir [Performance de l'assistant IA](ollama-performance.md) |
| Aucune réponse | Modèle absent | `docker exec ram-ollama ollama pull llama3.2` |
