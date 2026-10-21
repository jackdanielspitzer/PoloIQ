"""HTTP fetching with an on-disk cache and polite pacing.

Pages for seasons that are over never change, so they are cached forever; anything for the
current season is re-fetched once the cached copy is older than `max_age` seconds.
"""
import gzip
import hashlib
import http.client
import json
import os
import time
import urllib.error
import urllib.request

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 PoloIQ-ingest")
_last_request = [0.0]


def _cache_path(url):
    h = hashlib.sha1(url.encode()).hexdigest()
    return os.path.join(CACHE_DIR, h[:2], h)


def get(url, max_age=None, retries=5, pace=0.5):
    """Return the response body as text. max_age=None means cache forever."""
    path = _cache_path(url)
    if os.path.exists(path):
        if max_age is None or time.time() - os.path.getmtime(path) < max_age:
            with open(path, encoding="utf-8") as f:
                return f.read()
    last_err = None
    for attempt in range(retries):
        wait = pace - (time.time() - _last_request[0])
        if wait > 0:
            time.sleep(wait)
        _last_request[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*", "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=40) as r:
                gz = (r.headers.get("Content-Encoding") or "").lower() == "gzip"
                try:
                    raw = r.read()
                    if gz:
                        raw = gzip.decompress(raw)
                except http.client.IncompleteRead as e:
                    # the proxy sometimes cuts big pages short. Resume the rest with a Range request so the
                    # whole page (including the data script at its end) is intact; fall back to the partial body.
                    if gz:
                        raise  # a cut-off gzip stream is unusable: retry the whole request
                    raw = e.partial
                    try:
                        raw = _resume(url, e.partial)
                    except Exception:
                        pass
                body = raw.decode("utf-8", errors="replace")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(body)
            return body
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last_err = e
        except Exception as e:  # network hiccup: back off and retry
            last_err = e
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"fetch failed: {url}: {last_err}")


def get_json(url, max_age=None):
    body = get(url, max_age=max_age)
    if body is None:
        return None
    try:
        return json.loads(body)
    except ValueError:
        # a truncated copy was cached earlier: drop it and fetch again
        p = _cache_path(url)
        if os.path.exists(p):
            os.remove(p)
        body = get(url, max_age=max_age)
        return None if body is None else json.loads(body)


def _resume(url, partial, tries=4):
    """Finish a truncated download by requesting the missing byte range."""
    data = partial
    for _ in range(tries):
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*", "Range": f"bytes={len(data)}-"})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                if r.status != 206:
                    raise RuntimeError("no range support")
                try:
                    data += r.read()
                    return data
                except http.client.IncompleteRead as e2:
                    data += e2.partial
        except urllib.error.HTTPError as e3:
            if e3.code == 416:
                return data
            raise
    return data


def get_bytes(url, retries=6, pace=0.4):
    """Binary fetch (PDFs) with an on-disk cache; resumes with Range requests when the proxy cuts a body short."""
    path = _cache_path(url) + ".bin"
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read()
    data = b""
    total = None
    for attempt in range(retries):
        wait = pace - (time.time() - _last_request[0])
        if wait > 0:
            time.sleep(wait)
        _last_request[0] = time.time()
        headers = {"User-Agent": UA, "Accept": "*/*"}
        if data:
            headers["Range"] = f"bytes={len(data)}-"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=40) as r:
                if data and r.status != 206:
                    data = b""  # server ignored Range; start over
                try:
                    data += r.read()
                except http.client.IncompleteRead as e:
                    data += e.partial
                    continue
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "wb") as f:
                f.write(data)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 416 and data:
                break
        except Exception:
            pass
        time.sleep(1.5 * (attempt + 1))
    if data:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        return data
    raise RuntimeError(f"fetch failed: {url}")
