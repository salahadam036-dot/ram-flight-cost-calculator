import os


# Connexion PostgreSQL (requise). L'URL complete se surcharge via la variable
# d'environnement DATABASE_URL si besoin. Format :
#   postgresql://utilisateur:motdepasse@hote:port/base
#
# La valeur par defaut vise une execution dans Docker Compose (l'hote "db" est
# le service PostgreSQL). En dehors de Docker, surcharger DATABASE_URL avec
# l'hote adapte (ex: localhost).
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://ram:ram_password@db:5432/ram_flights",
)

# Cle secrete JWT. OBLIGATOIRE : aucune valeur par defaut n'est fournie pour
# eviter d'embarquer un secret en clair dans le code source. Le backend refuse
# de demarrer si RAM_SECRET_KEY n'est pas defini (voir docker-compose.yml).
SECRET_KEY = os.getenv("RAM_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "RAM_SECRET_KEY n'est pas defini. Definissez cette variable "
        "d'environnement (chaine aleatoire longue) avant de demarrer le backend."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("RAM_TOKEN_EXPIRE", "720"))

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    # Electron charge le frontend depuis file://, l'origine CORS est alors "null".
    "null",
]

# Ollama (chatbot). L'hote "ollama" est le service Docker Compose ; en dehors de
# Docker, surcharger avec http://localhost:11434/api/chat.
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434/api/chat")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")

# Duree pendant laquelle le modele reste charge apres la derniere question.
# Defaut Ollama : 5 min. Passe ce delai, le modele est decharge et la question
# suivante paie un rechargement complet depuis le disque (~5 s mesure).
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m")

# Nombre maximal de jetons generes par reponse. La generation s'arrete de toute
# facon d'elle-meme sur le jeton de fin du modele ; cette borne n'est qu'un
# garde-fou contre une reponse qui partirait en boucle.
#
# Elle joue un second role, moins evident : Ollama reserve dans la fenetre de
# contexte autant de place que num_predict pour la generation. Avec -1 (aucune
# limite), il reserve la moitie de la fenetre et tronque le prompt en consequence
# (constate : "truncating input prompt", limit=4098 pour un prompt de 8 951
# jetons). Une valeur finie laisse donc au contraire toute la place au contexte
# de l'application. 1024 couvre largement les reponses observees (150 a 420
# jetons, mesurees apres passage au streaming).
OLLAMA_NUM_PREDICT = int(os.getenv("OLLAMA_NUM_PREDICT", "1024"))

# Taille de la fenetre de contexte (en jetons) allouee au modele. Doit couvrir le
# prompt systeme + l'etat de l'application (voir app/services/app_context.py) +
# l'historique de la conversation. L'augmenter consomme de la memoire : le cache
# KV croit avec cette valeur. La baisser fait perdre les messages les plus anciens.
# Ollama reserve par ailleurs pour la generation autant de jetons que num_predict :
# avec 1 024, il reste donc environ 9 200 jetons pour le prompt de l'assistant.
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "10240"))

# Delai maximal d'attente de la reponse Ollama, en secondes. A garder au-dessus du
# pire cas : prompt + (num_predict / vitesse de generation).
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "180"))
