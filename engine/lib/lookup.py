import html
import importlib
import json
import re
import ssl
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin, urlparse
from urllib.request import Request, urlopen

from . import citations

AGENT = "EssayBuilder/1.0"
TIMEOUT = 8
BOOK_TIMEOUT = 14
LIMIT = 3_000_000
DOI = re.compile(r"(10\.\d{4,9}/[^\s\"'<>]+)", re.I)
CROSSREF_TYPES = {
    "journal-article": "article",
    "proceedings-article": "article",
    "posted-content": "article",
    "peer-review": "article",
    "book-chapter": "chapter",
    "book-section": "chapter",
    "book-part": "chapter",
    "reference-entry": "chapter",
    "book": "book",
    "monograph": "book",
    "edited-book": "book",
    "reference-book": "book",
    "book-set": "book",
    "report": "report",
    "standard": "report",
    "dissertation": "thesis",
    "dataset": "dataset",
}
ARTICLE_TYPES = {"scholarlyarticle", "newsarticle", "article", "blogposting", "reportagenewsarticle", "analysisnewsarticle", "techarticle", "report", "liveblogposting"}
VIDEO_HOSTS = ("youtube.com", "youtu.be", "vimeo.com", "dailymotion.com", "ted.com")
SUFFIXES = {"jr", "jr.", "sr", "sr.", "ii", "iii", "iv"}
MONTHS = [m[:3].lower() for m in citations.MONTHS]
FIELDS = ("type", "author", "editor", "date", "title", "container", "publisher", "city", "edition", "volume", "issue", "pages", "url", "doi", "accessed")


class NotFound(Exception):
    pass


def system_context():
    for name in ("truststore", "pip._vendor.truststore"):
        try:
            return importlib.import_module(name).SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        except Exception:
            continue
    return None


def open_url(request, timeout, context=None):
    with urlopen(request, timeout=timeout, context=context) as response:
        body = response.read(LIMIT)
        return body, response.geturl(), response.headers.get_content_charset() or "", response.headers.get_content_type()


def fetch(url, accept="*/*", timeout=TIMEOUT):
    request = Request(url, headers={"User-Agent": AGENT, "Accept": accept})
    try:
        try:
            return open_url(request, timeout)
        except URLError as error:
            context = system_context() if isinstance(error.reason, ssl.SSLCertVerificationError) else None
            if context is None:
                raise
            return open_url(request, timeout, context)
    except HTTPError as error:
        if error.code in {404, 410}:
            raise NotFound("Not found") from error
        if error.code in {401, 403, 429}:
            raise NotFound("The site refused the lookup") from error
        raise NotFound(f"The site answered with error {error.code}") from error
    except TimeoutError as error:
        raise NotFound("Timed out") from error
    except (URLError, OSError) as error:
        reason = getattr(error, "reason", error)
        if isinstance(reason, TimeoutError) or "timed out" in str(reason):
            raise NotFound("Timed out") from error
        raise NotFound("No connection") from error


def fetch_json(url, timeout=TIMEOUT):
    body, _, charset, _ = fetch(url, "application/json", timeout)
    try:
        return json.loads(body.decode(charset or "utf-8", errors="replace"))
    except ValueError as error:
        raise NotFound("Not found") from error


def tidy(text):
    text = html.unescape(re.sub(r"<[^>]+>", "", str(text or "")))
    return re.sub(r"\s+", " ", text).strip()


def iso(parts):
    parts = [int(p) for p in (parts or []) if str(p).strip().lstrip("-").isdigit()]
    if not parts:
        return ""
    return "-".join([f"{parts[0]:04d}"] + [f"{p:02d}" for p in parts[1:3]])


def date_text(text):
    text = tidy(text)
    match = re.search(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", text)
    if match:
        return iso(match.groups())
    match = re.search(r"(\d{4})[-/.](\d{1,2})\b", text)
    if match:
        return iso(match.groups())
    match = re.search(r"\b(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})", text)
    if match and match.group(2)[:3].lower() in MONTHS:
        return iso([match.group(3), MONTHS.index(match.group(2)[:3].lower()) + 1, match.group(1)])
    match = re.search(r"\b([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})", text)
    if match and match.group(1)[:3].lower() in MONTHS:
        return iso([match.group(3), MONTHS.index(match.group(1)[:3].lower()) + 1, match.group(2)])
    match = re.search(r"\b([A-Za-z]{3,})\.?\s+(\d{4})", text)
    if match and match.group(1)[:3].lower() in MONTHS:
        return iso([match.group(2), MONTHS.index(match.group(1)[:3].lower()) + 1])
    match = re.search(r"\b(1[5-9]\d\d|20\d\d)\b", text)
    return match.group(1) if match else ""


def person(name):
    name = re.sub(r"^\s*by\s+", "", tidy(name), flags=re.I).strip(" ,;")
    if not name:
        return ""
    if "," in name:
        family, given = [p.strip() for p in name.split(",", 1)]
        return f"{family}, {given}" if given else family
    parts = name.split()
    if len(parts) == 1:
        return parts[0]
    if parts[-1].lower() in SUFFIXES and len(parts) > 2:
        parts = parts[:-1]
    return f"{parts[-1]}, {' '.join(parts[:-1])}"


def org(name):
    name = tidy(name)
    return "{" + name + "}" if name else ""


def join_people(people):
    seen = []
    for item in people:
        if item and item not in seen:
            seen.append(item)
    return "; ".join(seen)


def kind(query):
    text = query.strip().strip("<>").strip()
    if not text:
        raise NotFound("Paste a DOI, ISBN or link")
    lower = text.lower()
    host = urlparse(text if "://" in text else f"https://{text}").netloc.lower()
    if lower.startswith("doi:") or host.endswith("doi.org") or (not re.match(r"^[a-z]+://", lower) and DOI.match(text)):
        match = DOI.search(text)
        if match:
            return "doi", match.group(1).rstrip(".,;")
    digits = re.sub(r"[\s-]", "", re.sub(r"^isbn(?:-1[03])?:?", "", lower)).upper()
    if re.fullmatch(r"\d{9}[\dX]|\d{13}", digits):
        if not valid_isbn(digits):
            raise NotFound("That ISBN is not valid")
        return "isbn", digits if len(digits) == 13 else to_isbn13(digits)
    if re.match(r"^https?://", lower):
        return "url", text
    if re.match(r"^[\w-]+(\.[\w-]+)+(:\d+)?(/\S*)?$", text) and " " not in text:
        return "url", f"https://{text}"
    raise NotFound("Paste a DOI, ISBN or link")


def valid_isbn(digits):
    if len(digits) == 10:
        total = sum((10 - i) * (10 if c == "X" else int(c)) for i, c in enumerate(digits))
        return total % 11 == 0
    if "X" in digits:
        return False
    total = sum(int(c) * (3 if i % 2 else 1) for i, c in enumerate(digits))
    return total % 10 == 0


def to_isbn13(digits):
    core = "978" + digits[:9]
    check = (10 - sum(int(c) * (3 if i % 2 else 1) for i, c in enumerate(core)) % 10) % 10
    return core + str(check)


def crossref(doi):
    data = fetch_json(f"https://api.crossref.org/works/{quote(doi, safe='/:;()._-')}")
    item = data.get("message") or {}
    if not item:
        raise NotFound("Not found")
    title = tidy((item.get("title") or [""])[0])
    subtitle = tidy((item.get("subtitle") or [""])[0])
    if subtitle and subtitle.lower() not in title.lower():
        title = f"{title}: {subtitle}"
    people = []
    for who in item.get("author") or []:
        if who.get("family"):
            people.append(f"{tidy(who['family'])}, {tidy(who.get('given', ''))}".strip(", "))
        elif who.get("name"):
            people.append(org(who["name"]))
    editors = [f"{tidy(w['family'])}, {tidy(w.get('given', ''))}".strip(", ") for w in item.get("editor") or [] if w.get("family")]
    stamp = ""
    for name in ("published-print", "published-online", "issued", "published", "created"):
        parts = ((item.get(name) or {}).get("date-parts") or [[]])[0]
        if parts and parts[0]:
            stamp = iso(parts)
            break
    source_type = CROSSREF_TYPES.get(item.get("type", ""), "article")
    containers = [tidy(c) for c in item.get("container-title") or [] if tidy(c)]
    return {
        "type": source_type,
        "author": join_people(people),
        "editor": join_people(editors),
        "date": stamp,
        "title": title,
        "container": containers[0] if containers and source_type != "book" else "",
        "publisher": tidy(item.get("publisher", "")) if source_type in {"book", "chapter", "report", "thesis", "dataset"} else "",
        "city": tidy(item.get("publisher-location", "")) if source_type in {"book", "chapter"} else "",
        "volume": tidy(item.get("volume", "")),
        "issue": tidy(item.get("issue", "")),
        "pages": tidy(item.get("page", "")),
        "doi": tidy(item.get("DOI", doi)).lower(),
    }


def open_library(isbn):
    data = fetch_json(f"https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data", BOOK_TIMEOUT)
    book = data.get(f"ISBN:{isbn}") if isinstance(data, dict) else None
    if not book:
        raise NotFound("Not found")
    title = tidy(book.get("title", ""))
    subtitle = tidy(book.get("subtitle", ""))
    names = [person(a.get("name", "")) for a in book.get("authors") or []]
    return {
        "type": "book",
        "author": join_people(names),
        "date": date_text(book.get("publish_date", ""))[:4],
        "title": f"{title}: {subtitle}" if subtitle else title,
        "publisher": tidy(((book.get("publishers") or [{}])[0]).get("name", "")),
        "city": tidy(((book.get("publish_places") or [{}])[0]).get("name", "")),
    }


def google_books(isbn):
    data = fetch_json(f"https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}", BOOK_TIMEOUT)
    items = data.get("items") or []
    if not items:
        raise NotFound("Not found")
    info = items[0].get("volumeInfo") or {}
    title = tidy(info.get("title", ""))
    subtitle = tidy(info.get("subtitle", ""))
    return {
        "type": "book",
        "author": join_people(person(a) for a in info.get("authors") or []),
        "date": date_text(info.get("publishedDate", ""))[:4],
        "title": f"{title}: {subtitle}" if subtitle else title,
        "publisher": tidy(info.get("publisher", "")),
    }


def isbn_lookup(isbn):
    found, failure = {}, None
    with ThreadPoolExecutor(2) as pool:
        jobs = [pool.submit(source, isbn) for source in (open_library, google_books)]
        for job in jobs:
            try:
                result = job.result()
            except NotFound as error:
                failure = failure or error
                continue
            for key, value in result.items():
                if value and not found.get(key):
                    found[key] = value
    if not found.get("title"):
        raise failure or NotFound("Not found")
    return found


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta, self.scripts, self.title, self.canonical = {}, [], "", ""
        self.where, self.buffer = None, []

    def handle_starttag(self, tag, attrs):
        attrs = {key.lower(): (value or "") for key, value in attrs}
        if tag == "meta":
            name = (attrs.get("name") or attrs.get("property") or attrs.get("itemprop") or "").strip().lower()
            content = (attrs.get("content") or "").strip()
            if name and content:
                self.meta.setdefault(name, []).append(content)
        elif tag == "script" and "ld+json" in attrs.get("type", "").lower():
            self.where, self.buffer = "ld", []
        elif tag == "title" and not self.title and self.where is None:
            self.where, self.buffer = "title", []
        elif tag == "link" and "canonical" in attrs.get("rel", "").lower().split() and attrs.get("href"):
            self.canonical = attrs["href"]
        elif tag == "svg":
            self.where = self.where or "svg"

    def handle_endtag(self, tag):
        if self.where == "ld" and tag == "script":
            self.scripts.append("".join(self.buffer))
            self.where = None
        elif self.where == "title" and tag == "title":
            self.title = tidy("".join(self.buffer))
            self.where = None
        elif self.where == "svg" and tag == "svg":
            self.where = None

    def handle_data(self, data):
        if self.where in {"ld", "title"}:
            self.buffer.append(data)

    def first(self, *names):
        for name in names:
            for value in self.meta.get(name, []):
                if tidy(value):
                    return tidy(value)
        return ""


def ld_nodes(scripts):
    found = []

    def walk(node):
        if isinstance(node, list):
            for item in node:
                walk(item)
        elif isinstance(node, dict):
            if "@graph" in node:
                walk(node["@graph"])
            if "@type" in node:
                found.append(node)

    for script in scripts:
        text = script.strip().rstrip(";")
        try:
            walk(json.loads(text))
        except ValueError:
            continue
    return found


def ld_types(node):
    value = node.get("@type", "")
    return {str(v).lower() for v in (value if isinstance(value, list) else [value])}


def ld_name(value):
    if isinstance(value, list):
        return ld_name(value[0]) if value else ""
    if isinstance(value, dict):
        return tidy(value.get("name", ""))
    return tidy(value)


def ld_people(value, index):
    items = value if isinstance(value, list) else [value] if value else []
    people = []
    for item in items:
        if isinstance(item, dict):
            item = index.get(item.get("@id"), item) if not item.get("name") else item
            name = tidy(item.get("name", ""))
            if not name:
                continue
            types = ld_types(item)
            people.append(person(name) if "person" in types or not types else org(name))
        elif isinstance(item, str) and not item.startswith("http"):
            people.append(person(item))
    return people


def split_people(text):
    text = tidy(text)
    if not text or text.startswith("http"):
        return []
    if ";" in text:
        parts = text.split(";")
    elif re.search(r"\s(?:and|&)\s", text):
        parts = re.split(r",\s*|\s+(?:and|&)\s+", text)
    elif "," in text and all(" " in p.strip() for p in text.split(",")):
        parts = text.split(",")
    else:
        parts = [text]
    return [person(p) for p in parts if p.strip()]


def strip_site(title, site):
    if not site:
        return title
    for mark in (" | ", " - ", " – ", " — ", " :: ", " · "):
        if mark in title:
            head, tail = title.rsplit(mark, 1)
            if site.lower() in tail.lower() or tail.lower() in site.lower():
                return head.strip()
    return title


def host_name(url):
    host = urlparse(url).netloc.lower().split(":")[0]
    return host[4:] if host.startswith("www.") else host


def decode(body, charset):
    if not charset:
        match = re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", body[:4000], re.I)
        charset = match.group(1).decode("ascii", "ignore") if match else "utf-8"
    try:
        return body.decode(charset, errors="replace")
    except LookupError:
        return body.decode("utf-8", errors="replace")


def oembed_author(url):
    host = host_name(url)
    if host.endswith("youtube.com") or host == "youtu.be":
        endpoint = "https://www.youtube.com/oembed?format=json&url="
    elif host.endswith("vimeo.com"):
        endpoint = "https://vimeo.com/api/oembed.json?url="
    else:
        return ""
    try:
        return tidy(fetch_json(endpoint + quote(url, safe="")).get("author_name", ""))
    except (NotFound, AttributeError):
        return ""


def web_lookup(url):
    if urlparse(url).scheme not in {"http", "https"}:
        raise NotFound("Paste a DOI, ISBN or link")
    body, final, charset, content = fetch(url, "text/html,application/xhtml+xml")
    if "html" not in content and "xml" not in content:
        raise NotFound("That link is not a web page")
    page = Page()
    try:
        page.feed(decode(body, charset))
        page.close()
    except Exception:
        pass
    doi = page.first("citation_doi", "dc.identifier", "prism.doi", "bepress_citation_doi")
    match = DOI.search(doi or "")
    if match:
        try:
            found = crossref(match.group(1).rstrip(".,;"))
            found["url"] = ""
            return found
        except NotFound:
            pass
    nodes = ld_nodes(page.scripts)
    main = next((n for n in nodes if ld_types(n) & ARTICLE_TYPES), None)
    video = next((n for n in nodes if "videoobject" in ld_types(n)), None)
    web = next((n for n in nodes if ld_types(n) & {"webpage", "website", "book", "creativework", "dataset"}), None)
    node = main or video or web or {}
    host = host_name(final or url)
    wiki = host.endswith("wikipedia.org")
    journal = page.first("citation_journal_title", "citation_conference_title", "prism.publicationname")
    site = journal or page.first("og:site_name", "application-name") or ld_name(node.get("isPartOf")) or ld_name(node.get("publisher"))
    if wiki:
        site = "Wikipedia"
    site = site or host
    title = page.first("citation_title", "dc.title", "og:title") or tidy(node.get("headline") or node.get("name") or "") or page.first("twitter:title") or page.title
    title = strip_site(title, site)
    if re.match(r"^(client challenge|just a moment|attention required|access denied|are you a robot)", title.lower()):
        raise NotFound("The site refused the lookup")
    people = [person(a) for a in page.meta.get("citation_author", []) if tidy(a)]
    index = {n["@id"]: n for n in nodes if isinstance(n.get("@id"), str)}
    people = people or ld_people(node.get("author") or node.get("creator"), index)
    named = split_people(page.first("author", "dc.creator", "parsely-author", "sailthru.author", "byl", "displayauthors", "article:author"))
    named = [org(site) if p == person(site) else p for p in named]
    if named and all(p.startswith("{") for p in people):
        people = named
    people = [p for p in people if "contributors to" not in p.lower() and p.strip("{}")]
    stamp = page.first("citation_publication_date", "citation_date", "citation_online_date", "dc.date", "prism.publicationdate")
    if wiki:
        stamp = stamp or tidy(node.get("dateModified", ""))
    stamp = stamp or tidy(node.get("datePublished") or node.get("uploadDate") or "")
    stamp = stamp or page.first("article:published_time", "og:published_time", "datepublished", "date", "pubdate", "publishdate", "dcterms.date", "dcterms.created", "parsely-pub-date", "uploaddate")
    og_type = page.first("og:type").lower()
    if journal:
        source_type = "article"
    elif video or og_type.startswith("video") or any(host == h or host.endswith("." + h) for h in VIDEO_HOSTS):
        source_type = "video"
    else:
        source_type = "website"
    if source_type == "video" and not people:
        channel = page.first("og:video:director") or ld_name((video or {}).get("author")) or oembed_author(final or url)
        people = [org(channel)] if channel else []
    if len(people) == 1 and people[0].strip("{}").lower() == site.lower():
        people = [org(site)]
    if not title:
        raise NotFound("Not found")
    link = final or url
    if page.canonical:
        canonical = urljoin(link, page.canonical)
        if canonical.startswith("http") and host_name(canonical).split(".")[-2:] == host.split(".")[-2:]:
            link = canonical
    found = {
        "type": source_type,
        "author": join_people(people),
        "date": date_text(stamp),
        "title": title,
        "container": site,
        "url": link,
        "accessed": date.today().isoformat(),
    }
    if source_type == "article":
        found.update(
            volume=page.first("citation_volume", "prism.volume"),
            issue=page.first("citation_issue", "prism.number"),
            pages="-".join(p for p in (page.first("citation_firstpage", "prism.startingpage"), page.first("citation_lastpage", "prism.endingpage")) if p),
            publisher=page.first("citation_publisher", "dc.publisher"),
        )
    return found


def find(query):
    what, value = kind(query)
    if what == "doi":
        found = crossref(value)
    elif what == "isbn":
        found = isbn_lookup(value)
    else:
        found = web_lookup(value)
    return {key: found.get(key, "") for key in FIELDS}


def preview(fields, style="apa"):
    style = citations.ALIASES.get(str(style or "apa").lower(), str(style or "apa").lower())
    if style not in citations.STYLES:
        style = "apa"
    clean = {key: str(value) for key, value in (fields or {}).items() if key in citations.FIELDS and str(value).strip()}
    entry = citations.Entry("preview", clean)
    entry.number = 1
    shown = citations.cite_group([("preview", False, "")], {"preview": entry}, style, {"preview": 1})
    return {"reference": citations.REFERENCE[style](entry), "cite": re.sub(r"<[^>]+>", "", shown)}
