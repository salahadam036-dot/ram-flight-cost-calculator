# Chatbot IA

L'application embarque un **assistant conversationnel** (bouton « ? » en bas à
droite de l'interface), qui répond en français à des questions sur l'utilisation
de l'application.

## Fonctionnement

- Le chatbot fait appel au service **Ollama** (conteneur `ollama`) via la route
  `POST /api/chatbot/stream`, qui diffuse la réponse au fur et à mesure
  (Server-Sent Events). La route `POST /api/chatbot` renvoie la réponse en un bloc.
- Le modèle utilisé est **`llama3.2`** (configurable via `OLLAMA_MODEL`).
- Un **prompt système** (dans `routers/chatbot.py`) borne l'assistant : il ne répond
  qu'à des questions concernant l'application, en français.
- À chaque question, l'assistant reçoit en plus un **état complet de
  l'application** (voir la section suivante).

## Ce que l'assistant connaît

L'assistant ne se contente pas de décrire les fonctionnalités : il reçoit à chaque
question un instantané de l'état réel de l'application, construit par
`backend/app/services/app_context.py` :

- l'application elle-même : pages, rôles, et les **formules de calcul** utilisées ;
- la flotte, avec les caractéristiques et les coûts de chaque avion ;
- les aéroports, avec leur taxe d'atterrissage ;
- les **indicateurs** portant sur tous les vols : nombre de vols enregistrés et
  calculés, parts rentables et déficitaires, marge moyenne, profit cumulé, marge la
  plus faible et la plus élevée ;
- le classement des meilleurs vols et des plus déficitaires ;
- les statistiques par avion (nombre de vols, coût par passager, marge moyenne) ;
- les scénarios de simulation enregistrés ;
- la liste des vols, **groupée par avion**, avec pour chacun le nombre de passagers,
  le prix du billet et la marge.

Les sections de synthèse portent sur **tous** les vols et font foi : c'est à elles
qu'il faut se fier pour un total, une moyenne ou un classement, car un petit modèle
compte mal sur des centaines de lignes. La liste détaillée sert à retrouver un vol
précis.

### Réglages et limites

- Le nombre de vols détaillés est plafonné par un budget de caractères
  (`BUDGET_CARACTERES`). Au-delà, les vols les plus anciens ne sont plus listés —
  ils restent comptés dans les indicateurs.
- `OLLAMA_NUM_CTX` (défaut `16384`) fixe la taille de la fenêtre de contexte du
  modèle. L'augmenter consomme de la mémoire : le cache KV croît avec elle.
- `OLLAMA_NUM_PREDICT` (défaut `1024`) borne la réponse **et** détermine la place
  laissée au prompt : Ollama réserve dans la fenêtre autant de place que
  `num_predict`. Une valeur infinie (`-1`) lui ferait réserver la moitié de la
  fenêtre et tronquerait l'instantané de l'application.

Deux scripts permettent de contrôler tout cela : `scripts/verify_chatbot_data.py`
vérifie le contenu des réponses sur la base de démonstration, et
`scripts/profile_chatbot.py` mesure les performances de bout en bout.

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
| Réponses qui ignorent les données | Instantané tronqué (fenêtre trop petite) | Chercher `truncating input prompt` dans `docker logs ram-ollama`, puis augmenter `OLLAMA_NUM_CTX` |
