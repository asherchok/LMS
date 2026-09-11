from flask import Flask, render_template, request, jsonify, send_from_directory
import json
import os
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from models import Database

app = Flask(__name__)
VERSION = '1.4.0'

BASE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE, 'config.json')


def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            cfg = json.load(f)
    else:
        cfg = {}
    d = cfg.get('data_dir', './data')
    if not os.path.isabs(d):
        d = os.path.join(BASE, d)
    cfg['data_dir'] = d
    return cfg


def save_config(cfg):
    with open(CONFIG_PATH, 'w') as f:
        json.dump(cfg, f, indent=2)


config = load_config()
os.makedirs(config['data_dir'], exist_ok=True)
db = Database(os.path.join(config['data_dir'], 'lms.db'))


# ── Page routes ──────────────────────────────────────────────

@app.route('/')
def landing():
    return render_template('landing.html')


@app.route('/problem/<int:pid>')
def problem_view(pid):
    p = db.get_problem(pid)
    if not p:
        return "Problem not found", 404
    db.update_last_visited(pid)
    return render_template('problem.html', problem=p)


# ── API: Problems ────────────────────────────────────────────

@app.route('/api/problems', methods=['GET'])
def api_list_problems():
    return jsonify(db.list_problems(
        search=request.args.get('search'),
        tag=request.args.get('tag'),
        difficulty=request.args.get('difficulty'),
    ))


@app.route('/api/problems', methods=['POST'])
def api_create_problem():
    pid = db.create_problem(request.json)
    return jsonify({'id': pid}), 201


@app.route('/api/problems/<int:pid>', methods=['GET'])
def api_get_problem(pid):
    p = db.get_problem(pid)
    return jsonify(p) if p else (jsonify({'error': 'Not found'}), 404)


@app.route('/api/problems/<int:pid>', methods=['PUT'])
def api_update_problem(pid):
    db.update_problem(pid, request.json)
    return jsonify({'ok': True})


@app.route('/api/problems/<int:pid>', methods=['DELETE'])
def api_delete_problem(pid):
    db.delete_problem(pid)
    return jsonify({'ok': True})


# ── API: Tabs ────────────────────────────────────────────────

@app.route('/api/problems/<int:pid>/tabs', methods=['GET'])
def api_get_tabs(pid):
    return jsonify(db.get_tabs(pid))


@app.route('/api/problems/<int:pid>/tabs', methods=['POST'])
def api_create_tab(pid):
    title = (request.json or {}).get('title', 'New Approach')
    return jsonify({'id': db.create_tab(pid, title)}), 201


@app.route('/api/tabs/<int:tid>', methods=['PUT'])
def api_update_tab(tid):
    db.update_tab(tid, request.json)
    return jsonify({'ok': True})


@app.route('/api/tabs/<int:tid>', methods=['DELETE'])
def api_delete_tab(tid):
    db.delete_tab(tid)
    return jsonify({'ok': True})


# ── API: Revisions ───────────────────────────────────────────

@app.route('/api/problems/<int:pid>/revise', methods=['POST'])
def api_revise(pid):
    db.add_revision(pid)
    body = request.json or {}
    if body.get('remind_days'):
        rd = (date.today() + timedelta(days=int(body['remind_days']))).isoformat()
        db.update_problem(pid, {'remind_date': rd})
    return jsonify({'ok': True})


@app.route('/api/problems/<int:pid>/revisions', methods=['GET'])
def api_get_revisions(pid):
    return jsonify(db.get_revisions(pid))


# ── API: Stats / Calendar ───────────────────────────────────

@app.route('/api/stats')
def api_stats():
    return jsonify({
        'difficulty_counts': db.get_difficulty_counts(),
        'tag_counts': db.get_tag_counts(),
    })


@app.route('/api/reminders')
def api_reminders():
    return jsonify(db.get_reminders())


@app.route('/api/calendar/<int:year>/<int:month>')
def api_calendar(year, month):
    return jsonify(db.get_calendar_data(year, month))


@app.route('/api/contributions')
def api_contributions():
    activity = db.get_contribution_data()
    # Overlay LeetCode's public submission calendar (full-year daily counts).
    # Use max per day so synced problems (already counted locally on their solve
    # date) aren't double-counted, while historical LeetCode-only days fill in.
    raw = db.get_setting('leetcode_calendar')
    if raw:
        try:
            for ts, cnt in json.loads(raw).items():
                day = datetime.fromtimestamp(int(ts), timezone.utc).date().isoformat()
                activity[day] = max(activity.get(day, 0), int(cnt))
        except (ValueError, TypeError):
            pass
    return jsonify(activity)


# ── LeetCode GraphQL helpers ────────────────────────────────

LEETCODE_GRAPHQL = 'https://leetcode.com/graphql'
LEETCODE_HEADERS = {
    'Content-Type': 'application/json',
    'Referer': 'https://leetcode.com',
    'User-Agent': 'Mozilla/5.0',
}

_Q_PROFILE = """
query userProfile($username: String!) {
  matchedUser(username: $username) {
    username
    profile { realName ranking reputation }
    submitStatsGlobal { acSubmissionNum { difficulty count } }
    userCalendar { streak totalActiveDays submissionCalendar }
  }
}"""

_Q_RECENT = """
query recentAc($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    title titleSlug timestamp
  }
}"""

_Q_QUESTION = """
query question($slug: String!) {
  question(titleSlug: $slug) {
    questionFrontendId title difficulty topicTags { name } content
  }
}"""

_Q_USERSTATUS = "query { userStatus { username isSignedIn } }"

_Q_SUBLIST = """
query submissions($slug: String!, $offset: Int!, $limit: Int!) {
  submissionList(questionSlug: $slug, offset: $offset, limit: $limit) {
    hasNext
    submissions { id statusDisplay lang timestamp runtime memory }
  }
}"""

_Q_SUBDETAIL = """
query submissionDetails($id: Int!) {
  submissionDetails(submissionId: $id) {
    code lang { name } runtime memory timestamp
  }
}"""

# LeetCode difficulty level (from /api/problems/all/) → our difficulty label
_LC_DIFFICULTY = {1: 'easy', 2: 'medium', 3: 'hard'}

# Credential keys are stored in settings but must never be echoed to the client.
_SENSITIVE_SETTINGS = {'leetcode_session', 'leetcode_csrf'}


def _lc_post(query, variables):
    import requests as http
    resp = http.post(
        LEETCODE_GRAPHQL,
        json={'query': query, 'variables': variables},
        headers=LEETCODE_HEADERS,
        timeout=15,
    )
    return resp.json()


def _lc_cookie_headers(session, csrf):
    """Build request headers carrying the LeetCode session cookie."""
    cookie = f'LEETCODE_SESSION={session}'
    headers = dict(LEETCODE_HEADERS)
    if csrf:
        cookie += f'; csrftoken={csrf}'
        headers['x-csrftoken'] = csrf
    headers['Cookie'] = cookie
    return headers


def _lc_auth_headers():
    """Headers for the logged-in user, or None if no session is stored."""
    session = db.get_setting('leetcode_session')
    if not session:
        return None
    return _lc_cookie_headers(session, db.get_setting('leetcode_csrf'))


def _lc_post_auth(query, variables):
    import requests as http
    headers = _lc_auth_headers()
    resp = http.post(
        LEETCODE_GRAPHQL,
        json={'query': query, 'variables': variables},
        headers=headers,
        timeout=20,
    )
    return resp.json()


def _fetch_profile(username):
    """Public profile snapshot: solved counts, ranking, streak, calendar."""
    data = _lc_post(_Q_PROFILE, {'username': username})
    mu = (data.get('data') or {}).get('matchedUser')
    if not mu:
        return None
    counts = {
        x['difficulty'].lower(): x['count']
        for x in (mu.get('submitStatsGlobal') or {}).get('acSubmissionNum', [])
    }
    cal = mu.get('userCalendar') or {}
    try:
        sub_cal = json.loads(cal.get('submissionCalendar') or '{}')
    except (ValueError, TypeError):
        sub_cal = {}
    return {
        'username': mu.get('username'),
        'realName': (mu.get('profile') or {}).get('realName'),
        'ranking': (mu.get('profile') or {}).get('ranking'),
        'solved': counts,                     # keys: all, easy, medium, hard
        'streak': cal.get('streak'),
        'totalActiveDays': cal.get('totalActiveDays'),
        'submissionCalendar': sub_cal,        # {unix_day: count}
    }


# ── API: LeetCode fetch ─────────────────────────────────────

@app.route('/api/leetcode/<int:number>')
def api_fetch_leetcode(number):
    try:
        import requests as http
        resp = http.post(
            'https://leetcode.com/graphql',
            json={
                'query': """query($categorySlug:String,$limit:Int,$skip:Int,$filters:QuestionListFilterInput){
                    problemsetQuestionList:questionList(categorySlug:$categorySlug,limit:$limit,skip:$skip,filters:$filters){
                        questions:data{frontendQuestionId:questionFrontendId title titleSlug difficulty topicTags{name} content}
                    }}""",
                'variables': {
                    'categorySlug': '', 'limit': 50, 'skip': 0,
                    'filters': {'searchKeywords': str(number)},
                },
            },
            headers={'Content-Type': 'application/json', 'Referer': 'https://leetcode.com'},
            timeout=10,
        )
        questions = resp.json().get('data', {}).get('problemsetQuestionList', {}).get('questions', [])
        for q in questions:
            if q['frontendQuestionId'] == str(number):
                return jsonify({
                    'leetcode_number': number,
                    'title': q['title'],
                    'description': q.get('content', ''),
                    'difficulty': q['difficulty'].lower(),
                    'tags': [t['name'] for t in q.get('topicTags', [])],
                    'source_url': f"https://leetcode.com/problems/{q['titleSlug']}/",
                })
        return jsonify({'error': 'Problem not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/leetcode/profile/<username>')
def api_leetcode_profile(username):
    """Live public profile fetch (stats + submission calendar) by username."""
    try:
        profile = _fetch_profile(username)
        if not profile:
            return jsonify({'error': 'User not found'}), 404
        return jsonify(profile)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/leetcode/cached')
def api_leetcode_cached():
    """Last-synced profile snapshot stored locally (empty dict if none)."""
    raw = db.get_setting('leetcode_profile')
    return jsonify(json.loads(raw) if raw else {})


@app.route('/api/leetcode/sync', methods=['POST'])
def api_leetcode_sync():
    """Incrementally import a user's recent accepted submissions.

    Public-by-username only pulls the last ~20 accepted submissions. We use a
    stored high-water-mark timestamp so each sync processes only submissions
    newer than the previous run — new problems are created, re-submissions of
    already-tracked problems are logged as revisions (reps). Existing problems
    (matched by title_slug or leetcode_number) are never duplicated and their
    notes/tabs are never touched.
    """
    body = request.json or {}
    username = (body.get('username') or db.get_setting('leetcode_username') or '').strip()
    if not username:
        return jsonify({'error': 'No username provided'}), 400

    try:
        profile = _fetch_profile(username)
        if not profile:
            return jsonify({'error': 'User not found'}), 404

        data = _lc_post(_Q_RECENT, {'username': username, 'limit': 20})
        subs = (data.get('data') or {}).get('recentAcSubmissionList') or []

        last_ts = int(db.get_setting('leetcode_last_sync_ts', '0') or '0')
        first_sync = last_ts == 0
        max_ts = last_ts
        new_problems, reps = [], []

        # Oldest first so a first-solve is created before a same-batch rep.
        for s in sorted(subs, key=lambda x: int(x['timestamp'])):
            ts = int(s['timestamp'])
            if ts <= last_ts:
                continue
            max_ts = max(max_ts, ts)
            slug = s['titleSlug']
            solved_iso = datetime.fromtimestamp(ts).isoformat()
            day = solved_iso[:10]

            existing = db.get_problem_by_slug(slug)
            if existing:
                db.add_revision(existing['id'], revised_at=day)
                reps.append({'id': existing['id'], 'title': existing['title'],
                             'title_slug': slug})
                continue

            # Unknown slug — fetch full metadata (needed to create anyway).
            meta = (_lc_post(_Q_QUESTION, {'slug': slug}).get('data') or {}).get('question')
            if not meta:
                continue
            number = int(meta['questionFrontendId'])

            # Guard: a pre-existing problem (e.g. created before slugs existed,
            # possibly with notes) tracked by number — backfill slug + log rep,
            # don't create a duplicate.
            by_num = db.get_problem_by_number(number)
            if by_num:
                db.update_problem(by_num['id'], {'title_slug': slug})
                db.add_revision(by_num['id'], revised_at=day)
                reps.append({'id': by_num['id'], 'title': by_num['title'],
                             'title_slug': slug})
                continue

            pid = db.create_problem({
                'leetcode_number': number,
                'title': meta['title'],
                'title_slug': slug,
                'difficulty': meta['difficulty'].lower(),
                'description': meta.get('content') or '',
                'tags': [t['name'] for t in meta.get('topicTags', [])],
                'source_url': f'https://leetcode.com/problems/{slug}/',
                'created_at': solved_iso,
            })
            new_problems.append({'id': pid, 'title': meta['title'],
                                 'title_slug': slug, 'leetcode_number': number})

        # Persist username, profile snapshot, calendar, and watermark.
        db.set_setting('leetcode_username', username)
        db.set_setting('leetcode_profile', json.dumps(profile))
        db.set_setting('leetcode_calendar', json.dumps(profile['submissionCalendar']))
        db.set_setting('leetcode_last_sync_ts', str(max_ts))
        db.set_setting('leetcode_last_sync_at', datetime.now().isoformat())

        return jsonify({
            'username': username,
            'first_sync': first_sync,
            'new': new_problems,
            'reps': reps,
            'new_count': len(new_problems),
            'rep_count': len(reps),
            'profile': profile,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── API: LeetCode account (v2 — authenticated) ──────────────

@app.route('/api/leetcode/auth')
def api_leetcode_auth():
    """Login state — never returns the token itself."""
    return jsonify({
        'logged_in': bool(db.get_setting('leetcode_session')),
        'username': db.get_setting('leetcode_username'),
    })


@app.route('/api/leetcode/login', methods=['POST'])
def api_leetcode_login():
    """Store + verify a LEETCODE_SESSION (and csrftoken) copied from the browser."""
    body = request.json or {}
    session = (body.get('session') or '').strip()
    csrf = (body.get('csrf') or '').strip()
    if not session:
        return jsonify({'error': 'LEETCODE_SESSION is required'}), 400
    try:
        import requests as http
        resp = http.post(
            LEETCODE_GRAPHQL,
            json={'query': _Q_USERSTATUS, 'variables': {}},
            headers=_lc_cookie_headers(session, csrf),
            timeout=15,
        )
        status = (resp.json().get('data') or {}).get('userStatus') or {}
        if not status.get('isSignedIn'):
            return jsonify({'error': 'Invalid or expired session'}), 401
        db.set_setting('leetcode_session', session)
        db.set_setting('leetcode_csrf', csrf)
        if status.get('username'):
            db.set_setting('leetcode_username', status['username'])
        return jsonify({'logged_in': True, 'username': status.get('username')})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/leetcode/logout', methods=['POST'])
def api_leetcode_logout():
    db.set_setting('leetcode_session', '')
    db.set_setting('leetcode_csrf', '')
    return jsonify({'logged_in': False})


@app.route('/api/leetcode/backfill', methods=['POST'])
def api_leetcode_backfill():
    """Import ONLY the logged-in user's solved problems (status == 'ac').

    A single authenticated request to /api/problems/all/ returns every problem
    with the user's per-problem status; we keep the solved ones and create a
    problem row for each that isn't already tracked. Existing rows (matched by
    slug or number) are never duplicated and their notes/tabs are untouched.
    """
    headers = _lc_auth_headers()
    if not headers:
        return jsonify({'error': 'Not logged in'}), 401
    try:
        import requests as http
        resp = http.get('https://leetcode.com/api/problems/all/', headers=headers, timeout=30)
        pairs = resp.json().get('stat_status_pairs', [])
        created, skipped = 0, 0
        for p in pairs:
            if p.get('status') != 'ac':          # solved only
                continue
            stat = p['stat']
            slug = stat['question__title_slug']
            try:
                number = int(stat['frontend_question_id'])
            except (TypeError, ValueError):
                number = None

            existing = db.get_problem_by_slug(slug) or db.get_problem_by_number(number)
            if existing:
                if not existing.get('title_slug'):
                    db.update_problem(existing['id'], {'title_slug': slug})
                skipped += 1
                continue

            db.create_problem({
                'leetcode_number': number,
                'title': stat['question__title'],
                'title_slug': slug,
                'difficulty': _LC_DIFFICULTY.get((p.get('difficulty') or {}).get('level'), 'medium'),
                'source_url': f'https://leetcode.com/problems/{slug}/',
                'tags': [],
                'imported': True,          # unknown solve date — kept off the calendar
            })
            created += 1

        # Store the real submission calendar so the activity graph reflects true
        # historical dates instead of piling every import onto today.
        username = db.get_setting('leetcode_username')
        if username:
            try:
                profile = _fetch_profile(username)
                if profile:
                    db.set_setting('leetcode_profile', json.dumps(profile))
                    db.set_setting('leetcode_calendar', json.dumps(profile['submissionCalendar']))
            except Exception:
                pass

        db.set_setting('leetcode_last_backfill_at', datetime.now().isoformat())
        return jsonify({'created': created, 'skipped': skipped,
                        'solved_total': created + skipped})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/leetcode/submissions/<slug>')
def api_leetcode_submissions(slug):
    """The logged-in user's recent submissions for one problem (on-demand)."""
    if not _lc_auth_headers():
        return jsonify({'error': 'Not logged in'}), 401
    try:
        data = _lc_post_auth(_Q_SUBLIST, {'slug': slug, 'offset': 0, 'limit': 20})
        return jsonify((data.get('data') or {}).get('submissionList') or
                       {'hasNext': False, 'submissions': []})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/problems/<int:pid>/enrich', methods=['POST'])
def api_enrich_problem(pid):
    """Lazily fill an imported problem's description/tags from LeetCode.

    Public query (no login needed). Only fills fields that are still empty so
    it never overwrites anything the user has written.
    """
    p = db.get_problem(pid)
    if not p:
        return jsonify({'error': 'Not found'}), 404
    slug = p.get('title_slug')
    if not slug:
        return jsonify({'enriched': False, 'reason': 'no_slug', 'problem': p})
    if (p.get('description') or '').strip():
        return jsonify({'enriched': False, 'reason': 'already_filled', 'problem': p})
    try:
        q = (_lc_post(_Q_QUESTION, {'slug': slug}).get('data') or {}).get('question')
        if not q:
            return jsonify({'enriched': False, 'reason': 'not_found', 'problem': p})
        updates = {'description': q.get('content') or ''}
        tags = [t['name'] for t in q.get('topicTags', [])]
        if tags and not p.get('tags'):
            updates['tags'] = tags
        if q.get('difficulty'):
            updates['difficulty'] = q['difficulty'].lower()
        db.update_problem(pid, updates)
        return jsonify({'enriched': True, 'problem': db.get_problem(pid)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/leetcode/submission/<int:sid>')
def api_leetcode_submission_code(sid):
    """The actual submitted code for one submission (on-demand)."""
    if not _lc_auth_headers():
        return jsonify({'error': 'Not logged in'}), 401
    try:
        data = _lc_post_auth(_Q_SUBDETAIL, {'id': sid})
        return jsonify((data.get('data') or {}).get('submissionDetails') or {})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── API: Settings ────────────────────────────────────────────

@app.route('/api/settings', methods=['GET'])
def api_get_settings():
    # Never expose credential tokens to the browser.
    return jsonify({k: v for k, v in db.get_all_settings().items()
                    if k not in _SENSITIVE_SETTINGS})


@app.route('/api/settings', methods=['PUT'])
def api_update_settings():
    for k, v in (request.json or {}).items():
        if k in _SENSITIVE_SETTINGS:
            continue  # credentials only set via /api/leetcode/login
        db.set_setting(k, v)
    return jsonify({'ok': True})


# ── API: Config ──────────────────────────────────────────────

@app.route('/api/config', methods=['GET'])
def api_get_config():
    cfg = load_config()
    cfg['version'] = VERSION
    return jsonify(cfg)


@app.route('/api/config', methods=['PUT'])
def api_update_config():
    global config, db
    config.update(request.json)
    save_config(config)
    config = load_config()
    os.makedirs(config['data_dir'], exist_ok=True)
    db = Database(os.path.join(config['data_dir'], 'lms.db'))
    return jsonify({'ok': True})



# ── API: File uploads ──────────────────────────────────────

def _files_dir():
    d = os.path.join(config['data_dir'], 'files')
    os.makedirs(d, exist_ok=True)
    return d


@app.route('/api/upload', methods=['POST'])
def api_upload():
    f = request.files.get('file')
    if not f or not f.filename:
        return jsonify({'error': 'No file'}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    name = f"{uuid.uuid4().hex}{ext}"
    f.save(os.path.join(_files_dir(), name))
    return jsonify({'url': f'/api/files/{name}', 'filename': name})


@app.route('/api/files/<filename>')
def api_serve_file(filename):
    return send_from_directory(_files_dir(), filename)


def _extract_youtube_id(url):
    m = re.search(
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})', url
    )
    return m.group(1) if m else None


@app.route('/api/video-thumbnail', methods=['POST'])
def api_video_thumbnail():
    url = (request.json or {}).get('url', '')
    vid = _extract_youtube_id(url)
    if vid:
        thumb_url = f'https://img.youtube.com/vi/{vid}/hqdefault.jpg'
        try:
            import requests as http
            resp = http.get(thumb_url, timeout=5)
            if resp.status_code == 200:
                name = f'thumb_{vid}.jpg'
                path = os.path.join(_files_dir(), name)
                if not os.path.exists(path):
                    with open(path, 'wb') as out:
                        out.write(resp.content)
                return jsonify({
                    'thumbnail': f'/api/files/{name}',
                    'type': 'youtube',
                    'video_id': vid,
                })
        except Exception:
            pass
        return jsonify({'thumbnail': None, 'type': 'youtube', 'video_id': vid})
    return jsonify({'thumbnail': None, 'type': 'url', 'video_id': None})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=True, port=port)
