from flask import Flask, render_template, request, jsonify, send_from_directory
import json
import os
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from models import Database

app = Flask(__name__)
VERSION = '1.3.0'

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


def _lc_post(query, variables):
    import requests as http
    resp = http.post(
        LEETCODE_GRAPHQL,
        json={'query': query, 'variables': variables},
        headers=LEETCODE_HEADERS,
        timeout=15,
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


# ── API: Settings ────────────────────────────────────────────

@app.route('/api/settings', methods=['GET'])
def api_get_settings():
    return jsonify(db.get_all_settings())


@app.route('/api/settings', methods=['PUT'])
def api_update_settings():
    for k, v in (request.json or {}).items():
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
