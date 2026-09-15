# TODO — agent sur la machine RTX

**Objectif** : rejouer le banc d'essai des modèles sur la machine GPU, puis
mettre à jour `docs/rapport-benchmark-modeles.md` avec les chiffres réellement
mesurés, et pousser le résultat.

---

## Pourquoi ce TODO existe

Le jeu de données de démonstration a été **recalibré** (coûts avion désormais
exprimés par heure de vol, distances orthodromiques, affectation des appareils
conforme à la flotte RAM). Le jeu est passé de 178 à **185 vols**, et les marges
ont changé.

Conséquence : les **valeurs de contrôle** du banc d'essai ont été mises à jour
dans `scripts/benchmark_models.py`. Les scores publiés dans le rapport actuel
(4/5 contre 5/5) ont été mesurés sur **l'ancien** jeu de données : ils ne sont
plus comparables. Il faut donc rejouer la mesure.

---

## Étape 1 — Récupérer le code

```bash
git pull
```

## Étape 2 — Réinitialiser la base de démonstration (obligatoire)

Si la base de cette machine contient encore l'ancien jeu, le banc d'essai
échouera : les réponses du modèle ne correspondront pas aux valeurs de contrôle.

```bash
docker compose down
docker volume rm ram_v2_pg_data
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

> Ne **pas** utiliser `docker compose down -v` : ce raccourci supprime aussi le
> volume `ram_v2_ollama_data`, ce qui force un re-téléchargement du modèle
> (4,9 Go). La commande ci-dessus ne touche que la base.

Le service `ollama` tire automatiquement `llama3.1:8b` au démarrage s'il est
absent.

## Étape 3 — Contrôler la base

```bash
docker compose exec -T db psql -U ram -d ram_flights -c "SELECT COUNT(*) FROM flights;"
```

**Attendu : 185.** Si vous lisez 178, l'étape 2 n'a pas été appliquée.

## Étape 4 — Contrôler le GPU (à ne pas sauter)

```bash
docker exec ram-ollama ollama ps
```

`PROCESSOR` doit afficher **`100% GPU`**. Si `100% CPU`, le banc d'essai est
invalide : voir `docs/ollama-performance.md` §5.

## Étape 5 — Rejouer le banc d'essai

```bash
python3 scripts/benchmark_models.py
```

Durée : environ 15 minutes. Les résultats détaillés (réponses brutes, métriques
par question) sont écrits dans `/tmp/benchmark_modeles.json`.

Cinq configurations sont mesurées : `llama3.2` (ctx 16 384) et `llama3.1:8b`
(ctx 8 192, 10 240, 12 288, 16 384).

Contrôle de bon sens avant d'écrire le rapport : la configuration
`llama3.1:8b` à 10 240 doit obtenir **5/5**, et les réponses doivent citer les
valeurs attendues de `scripts/benchmark_models.py`. Si ce n'est pas le cas,
**ne pas inventer** : le signaler dans le message final.

## Étape 6 — Mettre à jour `docs/rapport-benchmark-modeles.md`

Réécrire avec les valeurs mesurées, en conservant la structure existante :

| Section | À faire |
| --- | --- |
| En-tête | Date des mesures + machine (RTX 4070 Laptop, 8 Go) |
| §2.2 Questions de contrôle | Reprendre les valeurs de `scripts/benchmark_models.py` |
| §3.1 Exactitude | Nouveaux scores par configuration |
| §3.2 Performances | Génération, latence, chargement, VRAM, GPU/CPU |
| §3.3 Cas `num_ctx = 8 192` | Conserver l'explication `--context-shift`, ajuster si besoin |
| §4.1 / §4.2 Analyse et compromis | Recalculer l'écart de vitesse, revoir la recommandation |
| §5 Recommandation | Doit rester cohérente avec `docker-compose.yml` (`OLLAMA_MODEL`, `OLLAMA_NUM_CTX`) |
| §6 Limites | **Ne rien supprimer** : c'est ce qui rend la mesure défendable |
| §7 Reproductibilité | Inchangé |

Ne pas toucher à §2.1, §2.3 ni §7 (protocole et reproductibilité).

## Étape 7 — Committer et pousser

```bash
git add docs/rapport-benchmark-modeles.md
git commit -m "Benchmark: rejouer les mesures sur le jeu de donnees recalibre"
git push
```

## Étape 8 — Message final : rapporter

- les **scores d'exactitude** par configuration ;
- la **vitesse de génération** (jetons/s) et la **latence médiane** par configuration ;
- la **VRAM occupée** et la **répartition GPU/CPU** par configuration ;
- si le classement 3B/8B diffère du rapport actuel, le dire **explicitement** —
  c'est une information importante, pas un échec.

---

## Ne pas faire

- **Ne pas modifier les valeurs attendues** de `scripts/benchmark_models.py` :
  elles ont été recalculées depuis le jeu de données recalibré et vérifiées.
- **Ne pas modifier le juge `evaluer()`** : il ancre désormais les
  correspondances sur les limites de nombre (`44` ne doit pas être satisfait par
  `1 344` ni par `440`), ce qui évite des scores gonflés.
- **Ne pas toucher à `backend/app/seed_data.py`**.
- **Ne pas éditer le rapport Google Docs** : il est mis à jour séparément.
  Ici, seul `docs/rapport-benchmark-modeles.md` est concerné.
