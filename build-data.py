"""Extract the public directory fields from the Lomdim Yachad workbook.

No contact names, phone numbers, email addresses or activity notes are exported.
"""

from collections import Counter
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "רשימה מאוחדת בתי ספר וקהילות (1).xlsx"
OUTPUT = Path(__file__).resolve().parent / "data.js"
PUBLIC_OUTPUT = Path(__file__).resolve().parent / "public-data.js"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_rows():
    with zipfile.ZipFile(SOURCE) as archive:
        shared_xml = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = [
            "".join(node.text or "" for node in item.findall(".//m:t", NS))
            for item in shared_xml.findall("m:si", NS)
        ]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        for row in sheet.findall(".//m:sheetData/m:row", NS):
            values = {}
            for cell in row.findall("m:c", NS):
                col = re.match(r"[A-Z]+", cell.attrib["r"]).group()
                value = cell.find("m:v", NS)
                if value is None:
                    text = "".join(node.text or "" for node in cell.findall(".//m:t", NS))
                elif cell.attrib.get("t") == "s":
                    text = shared[int(value.text)]
                else:
                    text = value.text or ""
                values[col] = str(text).strip()
            yield values


def region(raw):
    if raw == "צפון":
        return "צפון"
    if raw in {"מרכז", "שרון"}:
        return "מרכז"
    if raw in {"ירושלים", "שומרון", "בנימין", "גוש עציון", "אפרת"}:
        return "ירושלים ויו״ש"
    if raw == "דרום":
        return "דרום"
    return "לא סווג"


def contact_lines(raw):
    """Split a contact field without discarding any substantive line."""
    return [
        line.strip()
        for line in str(raw or "").splitlines()
        if line.strip() and not re.fullmatch(r"[-–—\s]+", line.strip())
    ]


def extract_contacts(row):
    names = contact_lines(row.get("I", ""))
    contacts = [{"name": name, "role": [], "phone": [], "email": []} for name in names]
    unassigned = {"role": [], "phone": [], "email": []}
    for column, field in (("J", "role"), ("K", "phone"), ("L", "email")):
        values = contact_lines(row.get(column, ""))
        if len(names) == 1:
            contacts[0][field] = values
        elif names and len(values) == len(names):
            for contact, value in zip(contacts, values):
                contact[field] = [value]
        else:
            # A shorter/longer column has no reliable person-to-detail mapping.
            unassigned[field] = values
    return contacts, unassigned


SCHOOL_CORRECTIONS = {
    # The workbook also has a matching, identified record for each of these.
    "בית ספר האלה": {"symbol": "410266", "city": "נחושה", "region": "דרום"},
    "בית ספר קרוב": {"symbol": "450056", "city": "נחם", "region": "דרום"},
    "לביא": {"symbol": "362228", "city": "צור הדסה", "region": "ירושלים ויו״ש"},
    "נוה צוף": {"symbol": "111963", "city": "נוה צוף", "region": "ירושלים ויו״ש"},
}

SCHOOL_CORRECTIONS_BY_SYMBOL = {
    # Source row has the institution name in the city column and "----" as name.
    "114058": {"name": "ממ״ד אריאל – גבעת התמר", "city": "אפרת", "region": "ירושלים ויו״ש"},
}

COMMUNITY_REGION_BY_CITY = {
    "בית גמליאל": "מרכז",
    "גבעת וושינגטון": "מרכז",
    "כפר תפוח": "ירושלים ויו״ש",
    "מבוא דותן": "ירושלים ויו״ש",
    "מושב זרועה": "דרום",
    "מרכז שפירא": "דרום",
    "ראשון לציון": "מרכז",
    "רחובות": "מרכז",
}


rows = list(read_rows())
assert rows and rows[0]["A"] == "סמל מוסד"
items = []
for index, row in enumerate(rows[1:], 2):
    name = row.get("F", "")
    raw_type = row.get("C", "")
    if raw_type == "פרטי" and not name and not row.get("E", "") and not row.get("D", ""):
        # Keep the source intact; omit its empty directory entry only.
        continue
    kind = "school" if raw_type in {'בי"ס', 'בי״ס', 'בי"ס/קהילה'} else "community"
    correction = (SCHOOL_CORRECTIONS_BY_SYMBOL.get(row.get("A", "")) or SCHOOL_CORRECTIONS.get(name)) if kind == "school" else None
    contacts, unassigned = extract_contacts(row)
    entry_region = correction["region"] if correction else region(row.get("D", ""))
    if kind == "community" and entry_region == "לא סווג":
        entry_region = COMMUNITY_REGION_BY_CITY.get(row.get("E", ""), entry_region)
    items.append({
        "id": index,
        "kind": kind,
        "name": correction.get("name", name) if correction else name,
        "symbol": (correction.get("symbol", row.get("A", "")) if correction else row.get("A", "")) if kind == "school" else "",
        "city": correction["city"] if correction else row.get("E", ""),
        "region": entry_region,
        "sourceRegion": row.get("D", ""),
        "type": raw_type,
        "contacts": contacts,
        "unassignedContactDetails": unassigned,
    })

OUTPUT.write_text(
    "window.LOMDIM_DIRECTORY = " + json.dumps(items, ensure_ascii=False, separators=(",", ":")) + ";\nwindow.LOMDIM_DIRECTORY_SOURCE = 'local';\n",
    encoding="utf-8",
)
public_schools = [
    {key: item[key] for key in ("id", "kind", "name", "symbol", "city", "region", "sourceRegion", "type")}
    for item in items if item["kind"] == "school"
]
PUBLIC_OUTPUT.write_text(
    "window.LOMDIM_DIRECTORY = " + json.dumps(public_schools, ensure_ascii=False, separators=(",", ":")) + ";\nwindow.LOMDIM_DIRECTORY_SOURCE = 'public-schools';\n",
    encoding="utf-8",
)
print("source rows:", len(rows) - 1)
print("exported:", len(items))
print("public schools:", len(public_schools))
print("types:", dict(Counter(item["kind"] for item in items)))
print("unsorted regions:", dict(Counter(item["sourceRegion"] for item in items if item["region"] == "לא סווג")))
