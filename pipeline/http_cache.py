"""GET JSON with an on-disk cache, so reruns cost zero API calls."""
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from .config import CACHE_DIR

_last_call = 0.0


def get_json(url: str, params: dict | None = None, min_interval: float = 0.3):
    """Return parsed JSON for url+params, or None on 404. Cached forever in cache/."""
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    path = CACHE_DIR / f"{hashlib.sha1(url.encode()).hexdigest()}.json"
    if path.exists():
        return json.loads(path.read_text())

    global _last_call
    wait = min_interval - (time.monotonic() - _last_call)
    if wait > 0:
        time.sleep(wait)  # polite rate limit (openFDA: 240 req/min without a key)
    _last_call = time.monotonic()

    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "clinical-trial-lens/0.1"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as err:
        if err.code != 404:
            raise
        data = None  # openFDA answers 404 for "no matches"; cache that too

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))
    return data
