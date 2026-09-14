import json
import urllib.error
import urllib.request

from fastapi import APIRouter, Depends, HTTPException

from app.config import (
    OLLAMA_KEEP_ALIVE,
    OLLAMA_MODEL,
    OLLAMA_NUM_PREDICT,
    OLLAMA_TIMEOUT,
    OLLAMA_URL,
)
from app.deps import get_current_user
from app.schemas import ChatbotOut, ChatbotRequest

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

Si la question ne concerne pas l'application, redirige poliment vers le sujet."""


@router.post("", response_model=ChatbotOut)
def chat(body: ChatbotRequest, _=Depends(get_current_user)):
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in body.messages]
    payload = json.dumps(
        {
            "model": OLLAMA_MODEL,
            "stream": False,
            "messages": messages,
            # Garde le modele en memoire entre deux questions (defaut : 5 min).
            "keep_alive": OLLAMA_KEEP_ALIVE,
            # Borne la longueur de la reponse : garantit un pire cas connu.
            "options": {"num_predict": OLLAMA_NUM_PREDICT},
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=OLLAMA_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {"content": data["message"]["content"]}
    except urllib.error.URLError as e:
        if isinstance(e.reason, TimeoutError):
            raise HTTPException(504, "Le modele n'a pas repondu dans le delai imparti.")
        raise HTTPException(503, "Ollama n'est pas demarre. Lancez : ollama serve")
    except TimeoutError:
        raise HTTPException(504, "Le modele n'a pas repondu dans le delai imparti.")
    except Exception as e:
        raise HTTPException(500, f"Erreur : {e}")
