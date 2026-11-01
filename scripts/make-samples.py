"""
Writes the sample plans in public/samples: invented floors, drawn the way a surveyor or an architect
delivers them, for trying the import without a real file.

Each plan is in millimetres. Rooms are closed outlines on A-ROOM with their name as text inside them on
A-TEXT; the floor's outline is on A-FLOOR and an apartment's or a shop's outline on A-UNIT, so the
rooms layer holds rooms only. No room sits inside another.

    python3 scripts/make-samples.py
"""

from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "samples"


def rect(x, y, w, h):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def dxf(floor, rooms, units=()):
    """floor: (w, h). rooms: [(name, points, label_at)]. units: [points]."""
    out = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1027", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"]

    def poly(layer, pts):
        out.extend(["0", "LWPOLYLINE", "8", layer, "90", str(len(pts)), "70", "1"])
        for x, y in pts:
            out.extend(["10", str(x), "20", str(y)])

    poly("A-FLOOR", rect(0, 0, *floor))
    for pts in units:
        poly("A-UNIT", pts)
    for _, pts, _ in rooms:
        poly("A-ROOM", pts)
    for name, _, (x, y) in rooms:
        out.extend(["0", "TEXT", "8", "A-TEXT", "10", str(x), "20", str(y), "40", "300", "1", name])
    out.extend(["0", "ENDSEC", "0", "EOF"])
    return "\n".join(out) + "\n"


def boxes(spec):
    """[(name, x, y, w, h)] → rooms labelled at their centre."""
    return [(n, rect(x, y, w, h), (x + w // 2, y + h // 2)) for n, x, y, w, h in spec]


def check(name, floor, rooms):
    """Every room inside the floor, and no two rectangles overlapping."""
    fw, fh = floor
    rects = []
    for n, pts, _ in rooms:
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        assert min(xs) >= 0 and min(ys) >= 0 and max(xs) <= fw and max(ys) <= fh, (name, n, "outside the floor")
        if len(pts) == 4:
            rects.append((n, min(xs), min(ys), max(xs), max(ys)))
    for i, a in enumerate(rects):
        for b in rects[i + 1 :]:
            assert a[3] <= b[1] or b[3] <= a[1] or a[4] <= b[2] or b[4] <= a[2], (name, a[0], b[0], "overlap")


PLANS = {}

# ------------------------------------------------------------------ hotels

# A pool bar: the pool, the deck wrapped around it on three sides, the bar and what serves it.
pool_deck = [(0, 0), (2000, 0), (2000, 6000), (14500, 6000), (14500, 0), (16500, 0), (16500, 10000), (0, 10000)]
PLANS["hotel-pool-bar"] = (
    (26500, 15000),
    [("בריכה", rect(2000, 0, 12500, 6000), (8250, 3000)), ("דק בריכה", pool_deck, (8250, 8000))]
    + boxes(
        [
            ("בר בריכה", 16500, 4000, 6000, 6000),
            ("מטבחון בר", 22500, 4000, 4000, 6000),
            ("מחסן בר וקרח", 22500, 0, 4000, 4000),
            ("שירותים גברים", 16500, 0, 3000, 4000),
            ("שירותים נשים", 19500, 0, 3000, 4000),
            ("פינת ישיבה מוצלת", 0, 10000, 16500, 5000),
            ("מקלחות חוץ", 16500, 10000, 4000, 3000),
        ]
    ),
    [],
)

PLANS["hotel-spa"] = (
    (24000, 12000),
    boxes(
        [
            ("קבלת ספא", 0, 0, 6000, 5000),
            ("חדר מנוחה", 6000, 0, 8000, 5000),
            ("סאונה", 14000, 0, 3000, 3000),
            ("חמאם", 17000, 0, 3000, 3000),
            ("מקלחות", 14000, 3000, 6000, 2000),
            ("מחסן מגבות וכביסה", 20000, 0, 4000, 5000),
            ("מסדרון ספא", 0, 5000, 24000, 2000),
            ("חדר טיפולים 1", 0, 7000, 3500, 5000),
            ("חדר טיפולים 2", 3500, 7000, 3500, 5000),
            ("חדר טיפולים 3", 7000, 7000, 3500, 5000),
            ("חדר טיפולים זוגי", 10500, 7000, 5000, 5000),
            ("חדר טכני ספא", 15500, 7000, 2500, 2500),
            ("מקלחת חדר זוגי", 15500, 9500, 2500, 2500),
            ("מלתחות גברים", 18000, 7000, 3000, 5000),
            ("מלתחות נשים", 21000, 7000, 3000, 5000),
        ]
    ),
    [],
)


def guest_room(x, number):
    """A 4 m bay: the bathroom by the corridor door, the room wrapped around it."""
    room = [(x, 0), (x + 4000, 0), (x + 4000, 8000), (x + 2200, 8000), (x + 2200, 5500), (x, 5500)]
    return [(f"חדר אירוח {number}", room, (x + 2000, 2500)), (f"חדר רחצה {number}", rect(x, 5500, 2200, 2500), (x + 1100, 6750))]


PLANS["hotel-guest-rooms"] = (
    (20000, 9800),
    [r for i, n in enumerate((101, 102, 103, 104)) for r in guest_room(i * 4000, n)]
    + boxes([("מסדרון קומה", 0, 8000, 20000, 1800), ("חדר משק בית", 16000, 0, 4000, 4000), ("מחסן מצעים", 16000, 4000, 4000, 4000)]),
    [],
)

PLANS["hotel-lobby"] = (
    (27000, 18000),
    boxes(
        [
            ("לובי", 0, 0, 14000, 10000),
            ("בר לובי", 14000, 0, 8000, 6000),
            ("מטבחון בר לובי", 22000, 0, 5000, 3000),
            ("מחסן בר לובי", 22000, 3000, 5000, 3000),
            ("דלפק קבלה", 14000, 6000, 6000, 4000),
            ("משרד קבלה", 20000, 6000, 4000, 4000),
            ("חדר מזוודות", 24000, 6000, 3000, 4000),
            ("טרקלין", 0, 10000, 14000, 8000),
            ("שירותים ציבוריים גברים", 14000, 10000, 4000, 4000),
            ("שירותים ציבוריים נשים", 18000, 10000, 4000, 4000),
            ("שירותי נכים", 22000, 10000, 2500, 4000),
            ("מסדרון שירות", 14000, 14000, 13000, 4000),
        ]
    ),
    [],
)

# ------------------------------------------------------------------ real estate

APARTMENT = [
    ("סלון ופינת אוכל", 0, 0, 7000, 6000),
    ("מטבח", 7000, 0, 5000, 4000),
    ("מרפסת שירות", 7000, 4000, 5000, 2000),
    ("חדר שינה הורים", 0, 6000, 4500, 4000),
    ("חדר רחצה הורים", 0, 10000, 2500, 2000),
    ("שירותי אורחים", 2500, 10000, 2000, 2000),
    ('ממ"ד', 4500, 6000, 3000, 3000),
    ("מסדרון דירה", 4500, 9000, 3000, 3000),
    ("חדר שינה", 7500, 6000, 4500, 3500),
    ("חדר רחצה", 7500, 9500, 4500, 2500),
]


def mirrored(spec, width, suffix):
    return [(f"{n} {suffix}", width - x - w, y, w, h) for n, x, y, w, h in spec]


PLANS["re-typical-floor"] = (
    (30000, 12000),
    boxes(
        [(f"{n} דירה 1", x, y, w, h) for n, x, y, w, h in APARTMENT]
        + [("חדר מדרגות", 12000, 0, 3000, 6000), ("פיר מעלית", 15000, 0, 3000, 3000), ("פיר אינסטלציה", 15000, 3000, 3000, 3000), ("לובי קומתי", 12000, 6000, 6000, 6000)]
        + mirrored(APARTMENT, 30000, "דירה 2")
    ),
    [rect(0, 0, 12000, 12000), rect(18000, 0, 12000, 12000)],
)

PLANS["re-retail-ground-floor"] = (
    (30000, 15000),
    boxes(
        [
            ("ארקדה", 0, 0, 30000, 3000),
            ("חנות 1", 0, 3000, 8000, 9000),
            ("מחסן חנות 1", 0, 12000, 5000, 3000),
            ("שירותים חנות 1", 5000, 12000, 3000, 3000),
            ("חנות 2", 8000, 3000, 8000, 9000),
            ("מחסן חנות 2", 8000, 12000, 5000, 3000),
            ("שירותים חנות 2", 13000, 12000, 3000, 3000),
            ("בית קפה - אזור ישיבה", 16000, 3000, 8000, 9000),
            ("מטבח בית קפה", 16000, 12000, 5000, 3000),
            ("שירותים בית קפה", 21000, 12000, 3000, 3000),
            ("לובי כניסה למגורים", 24000, 3000, 6000, 7000),
            ("חדר אשפה", 24000, 10000, 3000, 5000),
            ("חדר מונים", 27000, 10000, 3000, 5000),
        ]
    ),
    [rect(0, 3000, 8000, 12000), rect(8000, 3000, 8000, 12000), rect(16000, 3000, 8000, 12000)],
)

PLANS["re-office-floor"] = (
    (32000, 16000),
    boxes(
        [
            ("אופן ספייס", 0, 0, 20000, 10000),
            ("חדר ישיבות גדול", 20000, 0, 7000, 5000),
            ("חדר ישיבות קטן", 27000, 0, 5000, 5000),
            ("מטבחון משרד", 20000, 5000, 6000, 5000),
            ("חדר שרתים", 26000, 5000, 3000, 5000),
            ("מחסן", 29000, 5000, 3000, 5000),
            ("קבלה", 0, 10000, 8000, 6000),
            ("שירותים גברים", 8000, 10000, 4000, 6000),
            ("שירותים נשים", 12000, 10000, 4000, 6000),
            ("שירותי נכים", 16000, 10000, 3000, 6000),
            ("חדר מנהל", 19000, 10000, 6000, 6000),
            ("חדר מדרגות ומעליות", 25000, 10000, 7000, 6000),
        ]
    ),
    [],
)

if __name__ == "__main__":
    for name, (floor, rooms, units) in PLANS.items():
        check(name, floor, rooms)
        (OUT / f"{name}.dxf").write_text(dxf(floor, rooms, units), encoding="utf-8")
        print(f"{name}.dxf  {len(rooms)} rooms")
