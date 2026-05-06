import datetime as dt
import os
from statistics import mean

import dotenv
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import AzureChatOpenAI
from langgraph.prebuilt import create_react_agent
from supabase import create_client


dotenv.load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
_supabase = None


def _get_supabase():
    global _supabase
    if _supabase is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise SystemExit("SUPABASE_URL and SUPABASE_KEY must be set")
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


def _parse_date(date_str):
    return dt.datetime.strptime(date_str, "%Y-%m-%d").date()


def _today_date(date_str=None):
    return _parse_date(date_str) if date_str else dt.date.today()


def _round_currency(value):
    return int(round(value))


def _get_rooms():
    return _get_supabase().table("rooms").select("*").execute().data


def _avg_rate(rooms, room_type):
    rates = [room["rate"] for room in rooms if room.get("type") == room_type]
    return mean(rates) if rates else None


@tool
def get_occupancy(date: str | None = None):
    """Return today's occupancy percent and vacant room list."""
    rooms = _get_rooms()
    total_rooms = len(rooms)

    occupied = [room for room in rooms if room.get("status") == "occupied"]
    vacant = [room for room in rooms if room.get("status") == "vacant"]
    maintenance = [room for room in rooms if room.get("status") == "maintenance"]

    occupancy_pct = round((len(occupied) / total_rooms) * 100) if total_rooms else 0

    return {
        "date": str(_today_date(date)),
        "total_rooms": total_rooms,
        "occupied_count": len(occupied),
        "vacant_count": len(vacant),
        "maintenance_count": len(maintenance),
        "occupancy_pct": occupancy_pct,
        "vacant_rooms": [room.get("room_number") for room in vacant],
        "out_of_service_rooms": [room.get("room_number") for room in maintenance],
    }


@tool
def get_revenue_summary(period: str = "daily", date: str | None = None):
    """Return daily or weekly revenue summary and RevPAR."""
    daily = _get_supabase().table("daily_revenue").select("*").execute().data
    if not daily:
        return {"error": "No revenue data available."}

    daily_sorted = sorted(daily, key=lambda item: item["date"])
    target_date = _today_date(date)

    latest_entry = next((item for item in reversed(daily_sorted)), None)
    if latest_entry and _parse_date(latest_entry["date"]) <= target_date:
        default_date = latest_entry["date"]
    else:
        default_date = daily_sorted[-1]["date"]

    target_str = date or default_date

    total_rooms = len(_get_rooms())

    if period == "weekly":
        target_dt = _parse_date(target_str)
        recent = [
            item for item in daily_sorted if _parse_date(item["date"]) <= target_dt
        ][-7:]

        if not recent:
            return {"error": "No revenue data for requested period."}

        rooms_occupied = sum(item["rooms_occupied"] for item in recent)
        room_revenue = sum(item["room_revenue"] for item in recent)
        total_revenue = sum(item["total_revenue"] for item in recent)
        avg_occupancy = round(mean(item["occupancy_pct"] for item in recent), 1)
        revpar = (
            round(room_revenue / (total_rooms * len(recent)), 2) if total_rooms else 0
        )

        return {
            "period": "weekly",
            "end_date": target_str,
            "days": len(recent),
            "rooms_occupied": rooms_occupied,
            "room_revenue": room_revenue,
            "total_revenue": total_revenue,
            "avg_occupancy_pct": avg_occupancy,
            "revpar": revpar,
        }

    entry = next((item for item in daily_sorted if item["date"] == target_str), None)
    if not entry:
        return {"error": "No revenue data for requested date."}

    revpar = round(entry["room_revenue"] / total_rooms, 2) if total_rooms else 0
    return {
        "period": "daily",
        "date": entry["date"],
        "rooms_occupied": entry["rooms_occupied"],
        "occupancy_pct": entry["occupancy_pct"],
        "room_revenue": entry["room_revenue"],
        "total_revenue": entry["total_revenue"],
        "revpar": revpar,
    }


@tool
def get_maintenance_tickets(status: str = "open", overdue_hours: int = 24):
    """Return maintenance tickets filtered by status or overdue."""
    tickets = _get_supabase().table("maintenance_tickets").select("*").execute().data
    now = dt.datetime.now()

    def is_overdue(ticket):
        if ticket.get("status") not in {"open", "in_progress"}:
            return False
        if not ticket.get("reported_at"):
            return False
        reported_at = dt.datetime.fromisoformat(ticket["reported_at"])
        age_hours = (now - reported_at).total_seconds() / 3600
        return age_hours >= overdue_hours

    if status == "overdue":
        filtered = [ticket for ticket in tickets if is_overdue(ticket)]
    elif status == "all":
        filtered = tickets
    else:
        filtered = [ticket for ticket in tickets if ticket.get("status") == status]

    return {
        "status_filter": status,
        "count": len(filtered),
        "overdue_count": sum(1 for ticket in tickets if is_overdue(ticket)),
        "tickets": filtered,
    }


@tool
def suggest_pricing(room_type: str | None = None, date: str | None = None):
    """Compare competitor rates and recommend tonight's pricing."""
    competitors = _get_supabase().table("competitor_rates").select("*").execute().data
    rooms = _get_rooms()
    our_rates = {
        "standard_king": _avg_rate(rooms, "Standard King"),
        "standard_double": _avg_rate(rooms, "Standard Double"),
        "deluxe_king": _avg_rate(rooms, "Deluxe King"),
        "deluxe_double": _avg_rate(rooms, "Deluxe Double"),
        "junior_suite": _avg_rate(rooms, "Junior Suite"),
        "executive_suite": _avg_rate(rooms, "Executive Suite"),
        "penthouse_suite": _avg_rate(rooms, "Penthouse Suite"),
    }

    occupancy = get_occupancy(date).get("occupancy_pct", 0)

    def competitor_avg(field):
        values = [comp[field] for comp in competitors if comp.get(field) is not None]
        return mean(values) if values else None

    standard_king_avg = competitor_avg("standard_king")
    deluxe_king_avg = competitor_avg("deluxe_king")
    suite_avg = competitor_avg("suite")

    def target_price(current_rate, comp_rate):
        if comp_rate is None:
            return current_rate
        baseline = comp_rate
        if occupancy >= 85:
            return _round_currency(baseline * 1.02)
        return _round_currency(baseline * 0.95)

    recommended = {}

    standard_king_target = target_price(
        our_rates.get("standard_king"), standard_king_avg
    )
    deluxe_king_target = target_price(our_rates.get("deluxe_king"), deluxe_king_avg)
    suite_target = target_price(our_rates.get("junior_suite"), suite_avg)

    recommended["standard_king"] = standard_king_target
    recommended["deluxe_king"] = deluxe_king_target
    recommended["junior_suite"] = suite_target

    if (
        our_rates.get("standard_double")
        and our_rates.get("standard_king")
        and standard_king_target
    ):
        ratio = standard_king_target / our_rates["standard_king"]
        recommended["standard_double"] = _round_currency(
            our_rates["standard_double"] * ratio
        )

    if (
        our_rates.get("deluxe_double")
        and our_rates.get("deluxe_king")
        and deluxe_king_target
    ):
        ratio = deluxe_king_target / our_rates["deluxe_king"]
        recommended["deluxe_double"] = _round_currency(
            our_rates["deluxe_double"] * ratio
        )

    if (
        our_rates.get("executive_suite")
        and our_rates.get("junior_suite")
        and suite_target
    ):
        ratio = suite_target / our_rates["junior_suite"]
        recommended["executive_suite"] = _round_currency(
            our_rates["executive_suite"] * ratio
        )

    if (
        our_rates.get("penthouse_suite")
        and our_rates.get("junior_suite")
        and suite_target
    ):
        ratio = suite_target / our_rates["junior_suite"]
        recommended["penthouse_suite"] = _round_currency(
            our_rates["penthouse_suite"] * ratio
        )

    if room_type:
        return {
            "date": _latest_competitor_date(competitors) or str(_today_date(date)),
            "occupancy_pct": occupancy,
            "room_type": room_type,
            "current_rate": our_rates.get(room_type),
            "recommended_rate": recommended.get(room_type),
        }

    return {
        "date": _latest_competitor_date(competitors) or str(_today_date(date)),
        "occupancy_pct": occupancy,
        "recommendations": recommended,
        "competitor_avg": {
            "standard_king": _round_currency(standard_king_avg)
            if standard_king_avg
            else None,
            "deluxe_king": _round_currency(deluxe_king_avg)
            if deluxe_king_avg
            else None,
            "suite": _round_currency(suite_avg) if suite_avg else None,
        },
    }


@tool
def document_qa(query: str | None = None, doc_id: str | None = None):
    """Search invoices/contracts and extract key fields."""
    docs = _get_supabase().table("documents").select("*").execute().data

    if doc_id:
        match = next((doc for doc in docs if doc.get("doc_id") == doc_id), None)
        if not match:
            return {"error": "Document not found."}
        return {
            "doc_id": match.get("doc_id"),
            "type": match.get("type"),
            "vendor": match.get("vendor"),
            "filename": match.get("filename"),
            "total_amount": match.get("total_amount"),
            "due_date": match.get("due_date"),
            "payment_status": match.get("payment_status"),
            "notes": match.get("notes"),
            "tags": match.get("tags"),
        }

    if not query:
        return {
            "documents": [
                {
                    "doc_id": doc.get("doc_id"),
                    "type": doc.get("type"),
                    "vendor": doc.get("vendor"),
                    "filename": doc.get("filename"),
                    "payment_status": doc.get("payment_status"),
                }
                for doc in docs
            ]
        }

    query_lower = query.lower()
    matches = [doc for doc in docs if query_lower in str(doc).lower()]

    results = [
        {
            "doc_id": doc.get("doc_id"),
            "type": doc.get("type"),
            "vendor": doc.get("vendor"),
            "filename": doc.get("filename"),
            "total_amount": doc.get("total_amount"),
            "due_date": doc.get("due_date"),
            "payment_status": doc.get("payment_status"),
            "notes": doc.get("notes"),
            "tags": doc.get("tags"),
        }
        for doc in matches
    ]

    return {
        "query": query,
        "count": len(results),
        "results": results,
    }


@tool
def generate_briefing(date: str | None = None):
    """Generate GM morning briefing."""
    occupancy = get_occupancy(date)
    daily_rev = get_revenue_summary("daily", date)
    weekly_rev = get_revenue_summary("weekly", date)
    open_tickets = get_maintenance_tickets("open")
    overdue_tickets = get_maintenance_tickets("overdue")
    pricing = suggest_pricing("standard_king", date)

    lines = [
        f"Date: {occupancy['date']}",
        (
            f"Occupancy: {occupancy['occupancy_pct']}% "
            f"({occupancy['occupied_count']}/{occupancy['total_rooms']} rooms)"
        ),
        (
            f"Vacant rooms: {occupancy['vacant_count']} "
            f"| Out of service: {occupancy['maintenance_count']}"
        ),
        (
            f"Daily revenue: ${daily_rev.get('total_revenue', 0):,.0f} "
            f"| RevPAR: ${daily_rev.get('revpar', 0):,.2f}"
        ),
        (
            f"Weekly revenue (last {weekly_rev.get('days', 0)} days): "
            f"${weekly_rev.get('total_revenue', 0):,.0f}"
        ),
        (
            f"Open maintenance tickets: {open_tickets['count']} "
            f"| Overdue: {overdue_tickets['count']}"
        ),
        (
            f"Suggested Standard King rate: ${pricing.get('recommended_rate', 0)} "
            f"(current ${pricing.get('current_rate', 0)})"
        ),
    ]

    return {"briefing": "\n".join(lines)}


TOOLS = [
    get_occupancy,
    get_revenue_summary,
    get_maintenance_tickets,
    suggest_pricing,
    document_qa,
    generate_briefing,
]


def build_agent():
    _get_supabase()
    model_name = os.getenv("MODEL_NAME", "gpt-4.1-mini")
    if model_name.startswith("gemini"):
        model = ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=os.getenv("GEMINI_API_KEY"),
        )
    return create_react_agent(model, TOOLS)


def _latest_competitor_date(competitors):
    dates = [row.get("date") for row in competitors if row.get("date")]
    return max(dates) if dates else None
