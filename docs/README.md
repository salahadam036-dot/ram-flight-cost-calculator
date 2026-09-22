# Documentation des onglets

Ce dossier décrit, en français, le rôle de chaque onglet de l'application
**Royal Air Maroc — Calculateur de coûts des vols**.

Chaque onglet correspond à une fonction métier de la planification aérienne,
centrée sur l'analyse du coût et de la rentabilité des vols.

## Sommaire

### 🎓 Guide de présentation (soutenance)

| Document | Rôle |
| --- | --- |
| [Guide de présentation & documentation technique](demo-guide.md) | Pitch, démonstration pas-à-pas, fonctionnement interne, structure des fichiers et arguments de défense |

### Par fonctionnalité (onglets)

| Onglet | Rôle |
| --- | --- |
| [Tableau de Bord](tableau-de-bord.md) | Vue d'ensemble des performances financières |
| [Vols](vols.md) | Gestion et calcul du coût des vols |
| [Flotte](flotte.md) | Caractéristiques et coûts des appareils |
| [Aéroports](aeroports.md) | Catalogue des codes IATA et redevances |
| [Scénarios](scenarios.md) | Simulation économique « what-if » sur un vol |
| [Prévision](prevision.md) | Projection des tendances par régression linéaire |
| [Risque & Rendement](risque-rendement.md) | Monte Carlo, KPI et optimisation du prix |
| [Utilisateurs](utilisateurs.md) | Gestion des comptes et des rôles (admin) |

### Documentation technique

| Sujet | Rôle |
| --- | --- |
| [Architecture & modèle de données](architecture.md) | API, tables, formule de coût, correspondance onglet ↔ route |
| [Algorithmes](algorithmes.md) | Analyse détaillée de chaque algorithme : formules, complexité, hypothèses et limites |
| [Sécurité & authentification](securite.md) | JWT, bcrypt, rôles, clés secrètes |
| [Chatbot IA](chatbot.md) | Assistant intégré (Ollama / llama3.1:8b) |
| [Performance de l'assistant IA](ollama-performance.md) | Diagnostic de latence et déploiement sur GPU |
| [Comparaison des modèles d'IA](rapport-benchmark-modeles.md) | Banc d'essai llama3.2 / llama3.1:8b : exactitude, vitesse, mémoire et recommandation |
| [Import Excel](import-excel.md) | Format du fichier et correspondance des avions |

> L'onglet **Connexion** permet de s'authentifier avant d'accéder à l'application.
