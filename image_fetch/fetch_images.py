"""
Fetch player image URLs from TheSportsDB (free key 123) for players in new_players.json
and generate update_images.sql for Supabase.

Usage:
    python fetch_images.py new_players.json

Needs only Python 3 (standard library). Takes ~6-8 minutes because the free tier
allows ~30 requests/minute. Progress is cached in image_cache.json, so you can
stop and re-run it safely.

Outputs:
    update_images.sql  - UPDATE statements for players where an image was found
    not_found.txt      - players with no exact match / no image (fill manually)
"""
import json, sys, time, os, unicodedata
import urllib.request, urllib.parse

API = "https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p="
CACHE_FILE = "image_cache.json"
DELAY = 2.3  # seconds between requests (free tier: 30/min)


def norm(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().replace(".", "").replace("'", "").replace("-", " ").strip()


def ascii_name(s):
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def search(query):
    url = API + urllib.parse.quote(query.replace(" ", "_"))
    for _ in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                data = json.load(r)
                return data.get("player") or []
        except Exception:
            time.sleep(8)  # back off (rate limit or hiccup)
    return []


def pick_image(name, results):
    soccer = [p for p in results if p.get("strSport") == "Soccer"]
    exact = [p for p in soccer if norm(p.get("strPlayer", "")) == norm(name)]
    for p in exact:
        img = p.get("strCutout") or p.get("strThumb")
        if img:
            return img
    return None


def sql_str(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "new_players.json"
    players = json.load(open(src, encoding="utf-8"))
    cache = json.load(open(CACHE_FILE, encoding="utf-8")) if os.path.exists(CACHE_FILE) else {}

    names = sorted({p["name"] for p in players})
    for i, name in enumerate(names, 1):
        if name in cache:
            continue
        results = search(name)
        img = pick_image(name, results)
        if not img and ascii_name(name) != name:
            time.sleep(DELAY)
            img = pick_image(name, search(ascii_name(name)))
        cache[name] = img
        json.dump(cache, open(CACHE_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"[{i}/{len(names)}] {name}: {img or 'NOT FOUND'}")
        time.sleep(DELAY)

    lines, missing = [], []
    for p in players:
        img = cache.get(p["name"])
        if img:
            lines.append(
                f"UPDATE players_player SET image_url = {sql_str(img)} "
                f"WHERE name = {sql_str(p['name'])} AND category = {sql_str(p['category'])} "
                f"AND (image_url IS NULL OR image_url = '');"
            )
        else:
            missing.append(f"{p['name']} ({p['category']})")

    open("update_images.sql", "w", encoding="utf-8").write("\n".join(lines) + "\n")
    open("not_found.txt", "w", encoding="utf-8").write("\n".join(missing) + "\n")
    print(f"\nDone. {len(lines)} updates -> update_images.sql, {len(missing)} not found -> not_found.txt")


if __name__ == "__main__":
    main()