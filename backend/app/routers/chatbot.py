import json
import urllib.error
import urllib.request

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.config import (
    OLLAMA_KEEP_ALIVE,
    OLLAMA_MODEL,
    OLLAMA_NUM_CTX,
    OLLAMA_NUM_PREDICT,
    OLLAMA_TIMEOUT,
    OLLAMA_URL,
)
from app.deps import get_current_user
from app.schemas import ChatbotOut, ChatbotRequest
from app.services.app_context import build_app_context

router = APIRouter(prefix="/chatbot", tags=["chatbot"])

SYSTEM_PROMPT = """Tu es l'assistant virtuel de l'application RAM Flight Cost Calculator de Royal Air Maroc.
Tu reponds uniquement en francais, de facon claire et concise.

L'application permet de :
- Gerer la flotte d'avions (ajouter, modifier, supprimer)
- Creer et gerer des vols (route, avion, passagers, prix carburant, prix billet)
- Calculer automatiquement les couts : fixes (amortissement + equipage + assurance) et variables (carburant + maintenance + catering + handling + taxes)
- Voir les resultats : cout total, revenu, marge, seuil de rentabilite
- Simuler des scenarios (variation prix carburant, taux remplissage, taxe)
- Faire des previsions (regression lineaire sur l'historique des vols)
- Analyser le risque et le rendement (KPI aeronautiques, Monte Carlo, optimisation du prix)
- Consulter un tableau de bord avec KPIs et graphiques
- Importer des vols depuis Excel
- Exporter le dashboard en PDF
- Poser des questions via le chatbot (Ollama / llama3.2)
- Gerer les utilisateurs (admin uniquement)

Navigation : Tableau de Bord | Vols | Flotte | Scenarios | Prevision | Risque & Rendement | Utilisateurs (admin)
Connexion par defaut : admin / admin123

Un resume de l'etat reel de l'application (flotte, aeroports, vols, indicateurs,
simulations) est fourni ci-dessous, apres ce prompt. Appuie-toi dessus pour donner
des chiffres exacts, et cite les vols par leur numero et leur identifiant.
Pour les totaux, les moyennes, les comptages et les classements (meilleure ou pire
marge), fie-toi aux sections INDICATEURS, CLASSEMENTS et PAR AVION : elles font foi.
La liste des vols sert a retrouver le detail d'un vol precis, pas a compter ni a
comparer. Si une information n'y figure pas, dis-le clairement au lieu de l'inventer.

Si la question ne concerne pas l'application, redirige poliment vers le sujet."""


def _conversation(messages) -> list:
    """Prompt systeme enrichi de l'etat de l'application, puis historique.

    Le contexte est reconstruit a chaque question : l'assistant voit donc l'etat
    reel de la base, et pas seulement la liste des fonctionnalites.
    """
    systeme = "%s\n\n%s" % (SYSTEM_PROMPT, build_app_context())
    return [{"role": "system", "content": systeme}] + [
        {"role": m.role, "content": m.content} for m in messages
    ]


def _build_payload(messages, stream: bool) -> bytes:
    """Charge utile Ollama, commune au mode bloc et au mode flux."""
    return json.dumps(
        {
            "model": OLLAMA_MODEL,
            "stream": stream,
            "messages": messages,
            # Garde le modele en memoire entre deux questions (defaut : 5 min).
            "keep_alive": OLLAMA_KEEP_ALIVE,
            # -1 = pas de plafond : la reponse se termine sur EOS.
            "options": {"num_predict": OLLAMA_NUM_PREDICT, "num_ctx": OLLAMA_NUM_CTX},
        }
    ).encode("utf-8")


def _open_ollama(payload: bytes):
    """Ouvre la connexion vers Ollama, en traduisant les pannes en erreurs HTTP.

    La connexion est ouverte avant de renvoyer la reponse HTTP : une panne
    produit donc un vrai code 503/504, et non un flux deja commence.
    """
    req = urllib.request.Request(
        OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        return urllib.request.urlopen(req, timeout=OLLAMA_TIMEOUT)
    except urllib.error.URLError as e:
        if isinstance(e.reason, TimeoutError):
            raise HTTPException(504, "Le modele n'a pas repondu dans le delai imparti.")
        raise HTTPException(503, "Ollama n'est pas demarre. Lancez : ollama serve")
    except TimeoutError:
        raise HTTPException(504, "Le modele n'a pas repondu dans le delai imparti.")


def _sse_event(payload: dict) -> str:
    """Formate un evenement Server-Sent Events."""
    return "data: %s\n\n" % json.dumps(payload)


def _sse_stream(resp):
    """Traduit le NDJSON d'Ollama en evenements SSE pour le navigateur."""
    try:
        with resp:
            for raw in resp:
                line = raw.decode("utf-8").strip()
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if chunk.get("error"):
                    yield _sse_event({"error": chunk["error"]})
                    break
                piece = chunk.get("message", {}).get("content", "")
                if piece:
                    yield _sse_event({"token": piece})
                if chunk.get("done"):
                    yield _sse_event(
                        {
                            "done": True,
                            "done_reason": chunk.get("done_reason", ""),
                            "eval_count": chunk.get("eval_count", 0),
                            "eval_duration": chunk.get("eval_duration", 0),
                        }
                    )
                    break
    except Exception as e:
        # Flux interrompu : Ollama arrete, delai depasse, navigateur parti...
        yield _sse_event({"error": str(e)})

    yield "data: [DONE]\n\n"


@router.post("", response_model=ChatbotOut)
def chat(body: ChatbotRequest, _=Depends(get_current_user)):
    """Reponse complete en un bloc (scripts, curl, clients non SSE)."""
    resp = _open_ollama(_build_payload(_conversation(body.messages), stream=False))
    try:
        with resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {"content": data["message"]["content"]}
    except Exception as e:
        raise HTTPException(500, f"Erreur : {e}")


@router.post("/stream")
def chat_stream(body: ChatbotRequest, _=Depends(get_current_user)):
    """Diffuse la reponse au fur et a mesure (Server-Sent Events).

    Le premier jeton arrive en quelques dizaines de millisecondes au lieu
    d'attendre la fin complete de la generation.
    """
    resp = _open_ollama(_build_payload(_conversation(body.messages), stream=True))
    return StreamingResponse(
        _sse_stream(resp),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
