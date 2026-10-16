#!/opt/mupibox-tidal/bin/python
# TIDAL for the box (unofficial: python-tidal, "tidalapi", signs in the way TIDAL's own apps do - TIDAL's developer
# platform gives other apps 30-second previews only). A small service on the box itself (127.0.0.1:5011) that the
# app's server asks: sign in with a code (link.tidal.com, the TIDAL password never comes to the box), the state of
# the sign-in, sign out; searching (albums, artists, playlists), an artist's albums, the tracks of an album or a
# playlist - and /stream/<track>, which the player's mpv plays: it sends mpv on to the track's address at TIDAL, asked
# for at that moment (they run out after a while). Only plain streams: one TIDAL sends encrypted (DRM) is refused,
# the box does not decrypt anything.
#
# Runs as root (mupi_tidal.service, the Python of /opt/mupibox-tidal, which mupibox/tidal_setup.sh sets up). The
# sign-in is kept in /etc/mupibox/tidal/session.json, readable by root only; TIDAL renews the access with every
# refresh and changes the refresh token then too, so it is written again whenever it changed.

import datetime
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import tidalapi

HOST = "127.0.0.1"
PORT = 5011
STATE_DIR = "/etc/mupibox/tidal"
SESSION_FILE = os.path.join(STATE_DIR, "session.json")

# (connect, read) in seconds for every request to TIDAL: tidalapi sets none, and a request TIDAL never answered held
# this service - and everything waiting for it - for good
TIMEOUT = (10, 30)


def new_session():
    """A tidalapi session whose requests (the API, the sign-in, the renewal) all have a time limit."""
    s = tidalapi.Session()
    send = s.request_session.request

    def request(method, url, **kw):
        kw.setdefault("timeout", TIMEOUT)
        return send(method, url, **kw)

    s.request_session.request = request
    return s


def log(msg):
    print(f"{time.strftime('%d.%m.%Y, %H:%M:%S')}: [tidal] {msg}", flush=True)


# guards the state below - never held while TIDAL is asked something (a slow answer held every other request)
lock = threading.RLock()
session = new_session()
# the sign-in being made: the code shown in the app, until it is confirmed, runs out or is given up. It has a session
# of its own: only a sign-in confirmed while it is still the one being made becomes the box's (one given up and
# confirmed on the phone later is dropped)
pending = None
# the number of the latest sign-in attempt (see start_login)
login_round = 0
last_error = ""
saved_tokens = None


class GivenUp(Exception):
    """A sign-in given up (cancelled, signed out) while TIDAL was still asked for its code."""


def tokens_now():
    exp = session.expiry_time
    return {
        "token_type": session.token_type,
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expiry_time": exp.isoformat() if isinstance(exp, datetime.datetime) else None,
    }


def save_session():
    """Writes the sign-in next to the file and swaps it in (root only, 600) - also when TIDAL renewed it."""
    global saved_tokens
    t = tokens_now()
    if not t["access_token"] or t == saved_tokens:
        return
    os.makedirs(STATE_DIR, mode=0o700, exist_ok=True)
    tmp = SESSION_FILE + ".new"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(t, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, SESSION_FILE)
    saved_tokens = t


def load_session():
    global saved_tokens
    try:
        with open(SESSION_FILE) as f:
            t = json.load(f)
    except (OSError, ValueError):
        return
    exp = None
    if t.get("expiry_time"):
        try:
            exp = datetime.datetime.fromisoformat(t["expiry_time"])
        except ValueError:
            exp = None
    try:
        ok = session.load_oauth_session(t.get("token_type", "Bearer"), t.get("access_token", ""), t.get("refresh_token"), exp)
    except Exception as e:  # tidalapi raises different errors for a refused or expired sign-in
        log(f"the saved sign-in does not work any more: {e}")
        return
    saved_tokens = t
    log("signed in again with the saved sign-in" if ok else "the saved sign-in was not accepted")
    save_session()


def signed_in(s):
    try:
        return bool(s.check_login())
    except Exception:
        return False


def status():
    # (asked outside the lock: see lock)
    s = session
    logged = signed_in(s)
    with lock:
        if logged and s is session:
            save_session()
        out = {"logged_in": logged, "error": last_error or None}
        if logged and s.user is not None:
            out["country"] = getattr(s, "country_code", None)
        if pending is not None:
            left = pending["expires_at"] - time.time()
            if left <= 0:
                out["pending"] = None
            else:
                out["pending"] = {"code": pending["code"], "url": pending["url"], "expires_in": int(left)}
        return out


def start_login():
    """Asks TIDAL for a code; a thread waits until it is confirmed on link.tidal.com (or runs out)."""
    global pending, last_error, login_round
    with lock:
        if pending is not None and pending["expires_at"] > time.time():
            return {"code": pending["code"], "url": pending["url"], "expires_in": int(pending["expires_at"] - time.time())}
        # this attempt's number, taken before TIDAL is asked: a cancel, a sign-out or a newer start meanwhile count
        # it out, also while its code is not there yet
        login_round += 1
        mine_round = login_round
    # (TIDAL is asked for the code outside the lock, with a session of the sign-in's own)
    own = new_session()
    login, future = own.login_oauth()
    url = login.verification_uri_complete
    if not url.startswith("http"):
        url = "https://" + url
    mine = {"code": login.user_code, "url": url, "expires_at": time.time() + login.expires_in, "future": future, "session": own}
    with lock:
        if mine_round != login_round:
            future.cancel()
            log("a sign-in given up while its code was asked for - dropped")
            # (a newer start's code, if it is there already; else nothing to show)
            if pending is not None and pending["expires_at"] > time.time():
                return {"code": pending["code"], "url": pending["url"], "expires_in": int(pending["expires_at"] - time.time())}
            raise GivenUp()
        pending = mine
        last_error = ""
        log("sign-in started, waiting for the code to be confirmed")

    def wait(fut, mine):
        global pending, last_error, session
        try:
            fut.result()
            with lock:
                # given up (cancelled, signed out, a new code) before it was confirmed: not the box's sign-in
                if pending is not mine:
                    log("a sign-in given up before was confirmed - dropped")
                    return
                session = mine["session"]
                save_session()
                log("signed in to TIDAL")
        except Exception as e:
            with lock:
                if pending is mine:
                    last_error = "expired" if "expired" in str(e).lower() or isinstance(e, TimeoutError) else "failed"
                log(f"sign-in not finished: {e}")
        finally:
            with lock:
                if pending is mine:
                    pending = None

    threading.Thread(target=wait, args=(future, mine), daemon=True).start()
    return {"code": mine["code"], "url": mine["url"], "expires_in": int(login.expires_in)}


def cancel_login():
    global pending, login_round
    with lock:
        # (also an attempt whose code TIDAL has not sent yet: see start_login)
        login_round += 1
        if pending is not None:
            pending["future"].cancel()
            pending = None
            log("sign-in given up")


def logout():
    global session, saved_tokens, pending, last_error
    with lock:
        cancel_login()
        session = new_session()
        saved_tokens = None
        last_error = ""
        try:
            os.remove(SESSION_FILE)
        except FileNotFoundError:
            pass
        log("signed out, the saved sign-in is deleted")


# --- Searching, browsing, playing ---

class NotSignedIn(Exception):
    pass


class Refused(Exception):
    pass


def ready():
    """The session for a request to TIDAL - signed in, or NotSignedIn. (Without asking TIDAL first, as /status does:
    every track would wait for one more request; an access that ran out is renewed by tidalapi on the request.)"""
    s = session
    if s.user is None or not s.access_token:
        raise NotSignedIn()
    return s


def renewed():
    # (tidalapi renews the access by itself when it ran out - kept then, see save_session)
    with lock:
        save_session()


def image(obj, size):
    try:
        return obj.image(size)
    except Exception:  # no picture (tidalapi raises for that), or not in that size
        return None


def year_of(album):
    try:
        return album.year or (album.release_date.year if album.release_date else None)
    except Exception:
        return None


def date_of(album):
    """The release date as YYYY-MM-DD (or the year only, or '')."""
    for attr in ("release_date", "tidal_release_date"):
        try:
            d = getattr(album, attr, None)
            if d:
                return d.strftime("%Y-%m-%d")
        except Exception:
            pass
    y = year_of(album)
    return str(y) if y else ""


def album_json(a):
    return {
        "kind": "album",
        "id": str(a.id),
        "name": a.name,
        "artist": a.artist.name if a.artist else None,
        "artist_id": str(a.artist.id) if a.artist else None,
        "tracks": a.num_tracks,
        "year": year_of(a),
        "date": date_of(a),
        # ALBUM, EP or SINGLE (the app's artist view filters by it)
        "single": str(getattr(a, "type", "") or "").upper() in ("EP", "SINGLE"),
        "cover": image(a, 640),
        "thumb": image(a, 160),
    }


def artist_json(a):
    return {"kind": "artist", "id": str(a.id), "name": a.name, "cover": image(a, 320), "thumb": image(a, 160)}


def playlist_json(p):
    return {
        "kind": "playlist",
        "id": str(p.id),
        "name": p.name,
        "artist": getattr(getattr(p, "creator", None), "name", None) or "TIDAL",
        "tracks": p.num_tracks,
        "cover": image(p, 480),
        "thumb": image(p, 160),
    }


def search(q, limit):
    s = ready()
    r = s.search(q, models=[tidalapi.Album, tidalapi.Artist, tidalapi.Playlist], limit=limit)
    renewed()
    return {
        "albums": [album_json(a) for a in r.get("albums", [])],
        "artists": [artist_json(a) for a in r.get("artists", [])],
        "playlists": [playlist_json(p) for p in r.get("playlists", [])],
    }


def paged(fetch, most=1000, step=100):
    """All items of a list TIDAL hands out in pages (up to 100 each), at most `most`."""
    out = []
    while len(out) < most:
        part = fetch(step, len(out))
        out.extend(part)
        if len(part) < step:
            break
    return out[:most]


def artist_albums(artist_id):
    s = ready()
    artist = s.artist(artist_id)
    seen = set()
    out = []
    # albums first, then EPs and singles (an audio drama's episodes come as albums, songs often as singles). TIDAL
    # lists one album several times (its versions in other qualities, Dolby Atmos, explicit and clean): one of them is
    # kept - the same name with the same number of tracks is the same album for the box.
    # One of the two lists failing fails it all (tried once more first): a list without the albums numbered the singles
    # from 1, and a range saved for the albums ("1-1": the oldest album) took a single instead.
    for fetch in (artist.get_albums, artist.get_ep_singles):
        for attempt in (1, 2):
            try:
                items = paged(lambda limit, offset: fetch(limit=limit, offset=offset), most=500, step=50)
                break
            except Exception as e:
                log(f"albums of artist {artist_id} (attempt {attempt}): {e}")
                if attempt == 2:
                    raise
                time.sleep(1)
        for a in items:
            key = ((a.name or "").strip().casefold(), a.num_tracks)
            if a.id in seen or key in seen:
                continue
            seen.add(a.id)
            seen.add(key)
            out.append(album_json(a))
    renewed()
    # The position of each by its release (1 = the oldest), as the range of a Spotify subscription counts; the list
    # itself newest first
    for i, al in enumerate(sorted(out, key=lambda x: (x["date"] or "9999", x["name"].casefold()))):
        al["position"] = i + 1
    out.sort(key=lambda x: (x["date"] or "", x["name"].casefold()), reverse=True)
    return {"artist": artist.name, "albums": out}


def narrowed(result, q):
    """An entry of a whole artist with a range (from, to: positions) and albums left out (exclude: ids): only what
    is in it. Without them: all, each marked (in_range, excluded) for the app's editor."""
    def num(v):
        try:
            n = int(v)
            return n if n >= 1 else None
        except (TypeError, ValueError):
            return None
    lo, hi = num(q.get("from")), num(q.get("to"))
    excluded = {x for x in (q.get("exclude") or "").split(",") if x.isdigit()}
    for al in result["albums"]:
        al["in_range"] = (lo is None or al["position"] >= lo) and (hi is None or al["position"] <= hi)
        al["excluded"] = al["id"] in excluded
    if q.get("all") == "1":
        return result
    return {**result, "albums": [al for al in result["albums"] if al["in_range"] and not al["excluded"]]}


def track_json(t, number):
    return {
        "id": str(t.id),
        "number": number,
        "name": t.full_name if getattr(t, "version", None) else t.name,
        "artist": t.artist.name if t.artist else None,
        "duration": t.duration,
    }


def tracks(kind, item_id):
    """The tracks of an album or a playlist that TIDAL lets play here (others are left out)."""
    s = ready()
    if kind == "playlist":
        p = s.playlist(item_id)
        items = paged(lambda limit, offset: p.tracks(limit=limit, offset=offset))
        head = playlist_json(p)
    else:
        a = s.album(item_id)
        items = paged(lambda limit, offset: a.tracks(limit=limit, offset=offset))
        head = album_json(a)
    playable = [t for t in items if isinstance(t, tidalapi.media.Track) and getattr(t, "available", True) is not False]
    renewed()
    head["list"] = [track_json(t, i + 1) for i, t in enumerate(playable)]
    return head


def stream_url(track_id):
    """The address of the track at TIDAL, plain (no DRM) and as one file - else Refused."""
    s = ready()
    s.audio_quality = tidalapi.Quality.low_320k
    track = s.track(track_id)
    manifest = track.get_stream().get_stream_manifest()
    renewed()
    if manifest.is_encrypted:
        raise Refused("encrypted")
    urls = manifest.get_urls()
    if len(urls) != 1:
        raise Refused("segmented")
    return urls[0]


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        parts = [p for p in url.path.split("/") if p]
        try:
            if url.path == "/status":
                return self._send(200, status())
            if url.path == "/search":
                text = q.get("q", "").strip()[:100]
                if not text:
                    return self._send(400, {"error": "no_query"})
                limit = max(1, min(50, int(q.get("limit", "20") or 20)))
                return self._send(200, search(text, limit))
            if len(parts) == 3 and parts[0] == "artist" and parts[2] == "albums" and parts[1].isdigit():
                return self._send(200, narrowed(artist_albums(parts[1]), q))
            if url.path == "/tracks" and q.get("kind") in ("album", "playlist") and q.get("id"):
                item_id = q["id"]
                if not all(c.isalnum() or c == "-" for c in item_id) or len(item_id) > 64:
                    return self._send(400, {"error": "bad_id"})
                return self._send(200, tracks(q["kind"], item_id))
            if len(parts) == 2 and parts[0] == "stream" and parts[1].isdigit():
                target = stream_url(parts[1])
                self.send_response(302)
                self.send_header("Location", target)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
        except NotSignedIn:
            return self._send(401, {"error": "not_signed_in"})
        except Refused as e:
            log(f"{url.path}: not played ({e})")
            return self._send(409, {"error": "not_playable", "reason": str(e)})
        except Exception as e:  # TIDAL not reachable, not found, refused, ...
            log(f"{url.path}: {e}")
            code = 404 if "404" in str(e) or "not found" in str(e).lower() else 502
            return self._send(code, {"error": "tidal_failed", "message": str(e)[:200]})
        self._send(404, {"error": "not_found"})

    def do_POST(self):
        try:
            if self.path == "/login/start":
                return self._send(200, start_login())
            if self.path == "/login/cancel":
                cancel_login()
                return self._send(200, {"ok": True})
            if self.path == "/logout":
                logout()
                return self._send(200, {"ok": True})
        except GivenUp:
            return self._send(409, {"error": "given_up"})
        except Exception as e:  # TIDAL not reachable, refused, ...
            log(f"{self.path}: {e}")
            return self._send(502, {"error": "tidal_failed", "message": str(e)[:200]})
        self._send(404, {"error": "not_found"})

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    load_session()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    log(f"listening on {HOST}:{PORT}")
    server.serve_forever()
