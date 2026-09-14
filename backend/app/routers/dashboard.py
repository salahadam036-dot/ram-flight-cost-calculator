from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.deps import get_current_user
from app.services.cost import get_dashboard_stats
from app.services.pdf import generate_pdf

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
def stats(_=Depends(get_current_user)):
    return get_dashboard_stats()


@router.get("/pdf")
def pdf(_=Depends(get_current_user)):
    stats = get_dashboard_stats()
    pdf_bytes = generate_pdf(stats)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=rapport_dashboard_RAM.pdf"
        },
    )
