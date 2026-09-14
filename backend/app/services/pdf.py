import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def _kpi_status(value: str) -> str:
    if value in ("Bon", "OK", "Rentable", "Positif", "Excellent"):
        return "green"
    if value in ("Attention", "Deficitaire", "Negatif", "Faible"):
        return "red"
    return "grey"


def _styled_table(data, col_widths, header_bg, line_color, margin_color):
    table = Table(data, colWidths=col_widths)
    style = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F6FA")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#DDDDDD")),
        ("LINEBELOW", (0, 0), (-1, 0), 2, line_color),
    ])
    if margin_color:
        style.add("TEXTCOLOR", (3, 1), (3, -1), margin_color)
        style.add("FONTNAME", (3, 1), (3, -1), "Helvetica-Bold")
    table.setStyle(style)
    return table


def generate_pdf(stats: dict) -> bytes:
    buffer = io.BytesIO()
    page_w = A4[0] - 4 * cm

    RAM_RED = colors.HexColor("#C8102E")
    RAM_GOLD = colors.HexColor("#D4A843")
    RAM_DARK = colors.HexColor("#0D1520")
    GREEN = colors.HexColor("#00A878")
    RED_SOFT = colors.HexColor("#E53935")

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "t", parent=styles["Normal"], fontSize=22, fontName="Helvetica-Bold",
        textColor=colors.white, alignment=TA_CENTER, spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "s", parent=styles["Normal"], fontSize=11, fontName="Helvetica",
        textColor=colors.HexColor("#CCCCCC"), alignment=TA_CENTER,
    )
    section_style = ParagraphStyle(
        "sec", parent=styles["Normal"], fontSize=13, fontName="Helvetica-Bold",
        textColor=RAM_RED, spaceBefore=16, spaceAfter=8,
    )
    footer_style = ParagraphStyle(
        "f", parent=styles["Normal"], fontSize=9, fontName="Helvetica",
        textColor=colors.HexColor("#666666"), alignment=TA_CENTER,
    )

    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm,
        title="Rapport Dashboard Royal Air Maroc",
    )

    story = []

    header = Table(
        [[Paragraph("ROYAL AIR MAROC", title_style)],
         [Paragraph("Calculateur de Couts de Vol — Rapport du Tableau de Bord", subtitle_style)]],
        colWidths=[page_w],
    )
    header.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), RAM_DARK),
        ("TOPPADDING", (0, 0), (-1, -1), 20),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 20),
        ("LINEBELOW", (0, -1), (-1, -1), 2, RAM_RED),
    ]))
    story.append(header)
    story.append(Spacer(1, 0.6 * cm))

    total = stats.get("total_flights", 0)
    profitable = stats.get("profitable_flights", 0)
    deficit = stats.get("deficit_count", 0)
    pct = stats.get("profitability_rate", 0)

    kpi_data = [
        ["Indicateur", "Valeur", "Statut"],
        ["Vols Analyses", str(total), "—"],
        ["Vols Rentables", str(profitable), "Bon" if profitable > 0 else "—"],
        ["Vols Deficitaires", str(deficit), "Attention" if deficit > 0 else "OK"],
        ["Marge Moyenne", f"{round(stats.get('avg_margin', 0), 1)}%",
         "Rentable" if stats.get("avg_margin", 0) > 0 else "Deficitaire"],
        ["Profit Net Total", f"{int(stats.get('total_profit', 0))} MAD",
         "Positif" if stats.get("total_profit", 0) >= 0 else "Negatif"],
        ["Taux de Rentabilite", f"{pct}%",
         "Excellent" if pct >= 80 else ("Moyen" if pct >= 50 else "Faible")],
    ]
    kpi_table = Table(kpi_data, colWidths=[page_w * 0.45, page_w * 0.3, page_w * 0.25])
    kpi_style = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), RAM_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F6FA")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#DDDDDD")),
        ("LINEBELOW", (0, 0), (-1, 0), 2, RAM_RED),
    ])
    for i, row_data in enumerate(kpi_data[1:], 1):
        status = _kpi_status(row_data[2])
        if status == "green":
            kpi_style.add("TEXTCOLOR", (2, i), (2, i), GREEN)
        elif status == "red":
            kpi_style.add("TEXTCOLOR", (2, i), (2, i), RED_SOFT)
    kpi_table.setStyle(kpi_style)
    story.append(kpi_table)
    story.append(Spacer(1, 0.5 * cm))

    story.append(HRFlowable(width=page_w, thickness=0.5, color=colors.HexColor("#DDDDDD")))
    story.append(Paragraph("Repartition des Couts", section_style))
    fixed = stats.get("avg_fixed_costs", 0)
    var = stats.get("avg_variable_costs", 0)
    total_costs = fixed + var if (fixed + var) > 0 else 1
    cout_data = [
        ["Type de Cout", "Montant Moyen (MAD)", "Part (%)"],
        ["Couts Fixes", str(int(fixed)), f"{round(fixed / total_costs * 100, 1)}%"],
        ["Couts Variables", str(int(var)), f"{round(var / total_costs * 100, 1)}%"],
        ["TOTAL", str(int(fixed + var)), "100%"],
    ]
    story.append(_styled_table(cout_data, [page_w * 0.4, page_w * 0.35, page_w * 0.25],
                               RAM_DARK, RAM_GOLD, None))
    story.append(Spacer(1, 0.5 * cm))

    top_flights = stats.get("top_flights", [])
    if top_flights:
        story.append(HRFlowable(width=page_w, thickness=0.5, color=colors.HexColor("#DDDDDD")))
        story.append(Paragraph("Vols les Plus Rentables", section_style))
        top_data = [["Vol", "Depart", "Arrivee", "Marge (%)", "Profit (MAD)"]]
        for f in top_flights:
            top_data.append([
                f["flight_number"], f["departure_airport"], f["arrival_airport"],
                f"{round(f['profit_margin'], 1)}%", str(int(f["profit"])),
            ])
        widths = [page_w * 0.2, page_w * 0.15, page_w * 0.15, page_w * 0.25, page_w * 0.25]
        story.append(_styled_table(top_data, widths, colors.HexColor("#1A3A1A"), GREEN, GREEN))
        story.append(Spacer(1, 0.5 * cm))

    deficit_flights = stats.get("deficit_flights", [])
    if deficit_flights:
        story.append(HRFlowable(width=page_w, thickness=0.5, color=colors.HexColor("#DDDDDD")))
        story.append(Paragraph("Vols Deficitaires", section_style))
        def_data = [["Vol", "Depart", "Arrivee", "Marge (%)", "Perte (MAD)"]]
        for f in deficit_flights:
            def_data.append([
                f["flight_number"], f["departure_airport"], f["arrival_airport"],
                f"{round(f['profit_margin'], 1)}%", str(int(f["profit"])),
            ])
        widths = [page_w * 0.2, page_w * 0.15, page_w * 0.15, page_w * 0.25, page_w * 0.25]
        story.append(_styled_table(def_data, widths, colors.HexColor("#3A1A1A"), RED_SOFT, RED_SOFT))
        story.append(Spacer(1, 0.5 * cm))

    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    story.append(Spacer(1, 0.5 * cm))
    story.append(HRFlowable(width=page_w, thickness=1, color=RAM_RED))
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph(
        f"Royal Air Maroc — Flight Cost Calculator v2.0 — Document confidentiel — {now}",
        footer_style,
    ))

    doc.build(story)
    return buffer.getvalue()
