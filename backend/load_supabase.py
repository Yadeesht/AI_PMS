import json
import os
from pathlib import Path

from supabase import create_client
import dotenv

dotenv.load_dotenv()

SUPABASE_URL = "https://eabsuoftlornvrrmivui.supabase.co"
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
DATA_DIR = Path(__file__).resolve().parent / "data"


def load_json(filename):
    with open(DATA_DIR / filename, "r", encoding="utf-8") as handle:
        return json.load(handle)


def insert_rows(table_name, rows):
    if not rows:
        print(f"Skipping {table_name}: no rows found")
        return
    result = supabase.table(table_name).insert(rows).execute()
    print(f"Inserted {len(rows)} rows into {table_name}")
    return result


def clear_table(table_name, key_column):
    result = supabase.table(table_name).delete().not_.is_(key_column, "null").execute()
    print(f"Cleared {table_name}")
    return result


if __name__ == "__main__":
    if not SUPABASE_KEY:
        raise SystemExit("SUPABASE_KEY is not set in the environment")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    clear_table("bookings", "booking_id")
    clear_table("maintenance_tickets", "ticket_id")
    clear_table("daily_revenue", "date")
    clear_table("competitor_rates", "id")
    clear_table("documents", "doc_id")
    clear_table("rooms", "room_number")

    hotel_data = load_json("hotel.json")
    insert_rows("rooms", hotel_data.get("rooms", []))

    bookings_data = load_json("bookings.json")
    bookings_rows = [
        {
            key: value
            for key, value in booking.items()
            if key
            in {
                "booking_id",
                "guest_name",
                "email",
                "room_number",
                "check_in",
                "check_out",
                "nights",
                "rate_per_night",
                "total_amount",
                "paid",
                "balance",
                "status",
                "source",
                "special_requests",
            }
        }
        for booking in bookings_data.get("bookings", [])
    ]
    insert_rows("bookings", bookings_rows)

    maintenance_data = load_json("maintenance.json")
    maintenance_rows = [
        {
            key: value
            for key, value in ticket.items()
            if key
            in {
                "ticket_id",
                "room_number",
                "reported_by",
                "issue",
                "category",
                "priority",
                "status",
                "reported_at",
                "assigned_vendor",
                "estimated_cost",
                "actual_cost",
                "notes",
                "resolved_at",
            }
        }
        for ticket in maintenance_data.get("maintenance_tickets", [])
    ]
    insert_rows("maintenance_tickets", maintenance_rows)

    revenue_data = load_json("revenue.json")
    insert_rows("daily_revenue", revenue_data.get("daily_revenue", []))

    competitor_data = revenue_data.get("competitor_rates", {})
    competitor_rows = [
        {
            "date": competitor_data.get("date"),
            "competitor_name": competitor.get("name"),
            "standard_king": competitor.get("standard_king"),
            "deluxe_king": competitor.get("deluxe_king"),
            "suite": competitor.get("suite"),
            "occupancy_est_pct": competitor.get("occupancy_est_pct"),
        }
        for competitor in competitor_data.get("competitors", [])
    ]
    insert_rows("competitor_rates", competitor_rows)

    documents_data = load_json("documents.json")
    document_rows = [
        {
            key: value
            for key, value in document.items()
            if key
            in {
                "doc_id",
                "type",
                "filename",
                "vendor",
                "total_amount",
                "payment_status",
                "due_date",
                "notes",
                "tags",
            }
        }
        for document in documents_data.get("documents", [])
    ]
    insert_rows("documents", document_rows)
