from flask import Flask, render_template, request, jsonify, send_from_directory, abort
import json
import os
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from models import Database
from providers import (get_provider, sensitive_setting_keys, PROVIDERS,
                       PUBLIC_PROFILE, PUBLIC_RECENT, AUTH_BACKFILL, SUBMISSION_CODE)

app = Flask(__name__)
VERSION = '1.4.0'

BASE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE, 'config.json')

# Built React SPA (Phase 3). When present, Flask serves it and the classic
# Jinja templates become a fallback for environments without a build.
FRONTEND_DIST = os.path.join(BASE, 'frontend', 'dist')


def _spa_available():
    return os.path.isfile(os.path.join(FRONTEND_DIST, 'index.html'))


def _serve_spa():
    return send_from_directory(FRONTEND_DIST, 'index.html')


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
    db.auto_cleanup_deleted()
    if _spa_available():
        return _serve_spa()
    return render_template('landing.html')


@app.route('/problem/<int:pid>')
def problem_view(pid):
    p = db.get_problem(pid, include_deleted=True)
    if not p:
        return "Problem not found", 404
    is_deleted = bool(p.get('deleted_at'))
    if not is_deleted:
        db.update_last_visited(pid)
    if _spa_available():
        return _serve_spa()  # React Router renders the problem client-side
    return render_template('problem.html', problem=p, is_deleted=is_deleted)


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
    include = request.args.get('include_deleted') == '1'
    p = db.get_problem(pid, include_deleted=include)
    return jsonify(p) if p else (jsonify({'error': 'Not found'}), 404)


@app.route('/api/problems/<int:pid>', methods=['PUT'])
def api_update_problem(pid):
    db.update_problem(pid, request.json)
    return jsonify({'ok': True})


@app.route('/api/problems/<int:pid>', methods=['DELETE'])
def api_delete_problem(pid):
    permanent = request.args.get('permanent') == '1'
    if permanent:
        db.permanently_delete_problem(pid)
    else:
        db.delete_problem(pid)
    return jsonify({'ok': True})


@app.route('/api/problems/<int:pid>/restore', methods=['POST'])
def api_restore_problem(pid):
    db.restore_problem(pid)
    return jsonify({'ok': True})


@app.route('/api/problems/deleted', methods=['GET'])
def api_deleted_problems():
    return jsonify(db.list_deleted_problems())


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


@app.route('/api/problems/<int:pid>/tabs/reorder', methods=['POST'])
def api_reorder_tabs(pid):
    tab_ids = (request.json or {}).get('tab_ids', [])
    db.reorder_tabs(tab_ids)
    return jsonify({'ok': True})


# ── API: Revisions ───────────────────────────────────────────

@app.route('/api/problems/<int:pid>/revise', methods=['POST'])
def api_revise(pid):
    body = request.json or {}
    days = body.get('remind_days')
    db.add_revision(pid, remind_days=int(days) if days is not None else None)
    if days is not None:
        days = int(days)
        if days <= 0:
            db.update_problem(pid, {'remind_date': None, 'remind_days': 0})
        else:
            rd = (date.today() + timedelta(days=days)).isoformat()
            db.update_problem(pid, {'remind_date': rd, 'remind_days': days})
    return jsonify({'ok': True, 'remind_days': days})


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


@app.route('/api/upcoming')
def api_upcoming():
    days = int(request.args.get('days', 7))
    return jsonify(db.get_upcoming_reminders(days))


@app.route('/api/freeze', methods=['GET'])
def api_freeze_status():
    fs = db.get_setting('freeze_start', '')
    return jsonify({'frozen': bool(fs), 'freeze_start': fs or None})


@app.route('/api/freeze', methods=['POST'])
def api_toggle_freeze():
    fs = db.get_setting('freeze_start', '')
    if fs:
        db.unfreeze_reminders(fs)
        db.set_setting('freeze_start', '')
        return jsonify({'frozen': False})
    else:
        now = datetime.now().isoformat()
        db.set_setting('freeze_start', now)
        return jsonify({'frozen': True, 'freeze_start': now})


@app.route('/api/calendar/<int:year>/<int:month>')
def api_calendar(year, month):
    return jsonify(db.get_calendar_data(year, month))


@app.route('/api/contributions')
def api_contributions():
    activity = db.get_contribution_data()
    # Overlay LeetCode's public submission calendar (full-year daily counts).
    # Use max per day so synced problems (already counted locally on their solve
    # date) aren't double-counted, while historical LeetCode-only days fill in.
    raw = db.get_setting(f'{LEETCODE.id}_calendar')
    if raw:
        try:
            for ts, cnt in json.loads(raw).items():
                day = datetime.fromtimestamp(int(ts), timezone.utc).date().isoformat()
                activity[day] = max(activity.get(day, 0), int(cnt))
        except (ValueError, TypeError):
            pass
    return jsonify(activity)


# ── LeetCode integration (via provider abstraction) ─────────

LEETCODE = get_provider('leetcode')

# Credential keys are stored in settings but must never be echoed to the client.
_SENSITIVE_SETTINGS = sensitive_setting_keys()


def _pkey(provider, name):
    """Provider-namespaced settings key, e.g. leetcode_username."""
    return f'{provider.id}_{name}'


def _provider_creds(provider):
    """Read a provider's stored credentials from settings, or None if absent."""
    creds = {key: db.get_setting(_pkey(provider, key))
             for key, _label in provider.auth_fields}
    return creds if creds.get('session') else None


def _resolve_provider(platform):
    """Return (provider, None) or (None, error_response) for an unknown id."""
    provider = get_provider(platform)
    if not provider:
        return None, (jsonify({'error': f'Unknown platform: {platform}'}), 404)
    return provider, None


# ── Provider service layer ──────────────────────────────────
# Platform-agnostic route bodies. Both the generic /api/providers/<platform>/*
# routes and the legacy /api/leetcode/* aliases call these with a provider.

def _svc_fetch_problem_by_number(provider, number):
    try:
        prob = provider.fetch_problem_by_number(number)
        if not prob:
            return jsonify({'error': 'Problem not found'}), 404
        ext = prob.get('external_id')
        return jsonify({
            **prob,
            'source_url': prob['url'],
            'leetcode_number': int(ext) if (ext or '').isdigit() else None,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _svc_profile(provider, username):
    if not provider.has(PUBLIC_PROFILE):
        return jsonify({'error': f'{provider.name} has no public profiles'}), 400
    try:
        profile = provider.fetch_profile(username)
        if not profile:
            return jsonify({'error': 'User not found'}), 404
        return jsonify(profile)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _svc_cached(provider):
    raw = db.get_setting(_pkey(provider, 'profile'))
    return jsonify(json.loads(raw) if raw else {})


def _svc_sync(provider):
    if not provider.has(PUBLIC_RECENT):
        return jsonify({'error': f'{provider.name} has no username sync'}), 400
    body = request.json or {}
    username = (body.get('username') or db.get_setting(_pkey(provider, 'username')) or '').strip()
    if not username:
        return jsonify({'error': 'No username provided'}), 400
    try:
        profile = None
        if provider.has(PUBLIC_PROFILE):
            profile = provider.fetch_profile(username)
            if not profile:
                return jsonify({'error': 'User not found'}), 404

        subs = provider.recent_submissions(username, 20)

        last_ts = int(db.get_setting(_pkey(provider, 'last_sync_ts'), '0') or '0')
        first_sync = last_ts == 0
        max_ts = last_ts
        new_problems, reps = [], []

        # Oldest first so a first-solve is created before a same-batch rep.
        for s in sorted(subs, key=lambda x: x['timestamp']):
            ts = s['timestamp']
            if ts <= last_ts:
                continue
            max_ts = max(max_ts, ts)
            slug = s['slug']
            solved_iso = datetime.fromtimestamp(ts).isoformat()
            day = solved_iso[:10]

            existing = db.get_problem_by_slug(slug, provider.id)
            if existing:
                db.add_revision(existing['id'], revised_at=day)
                reps.append({'id': existing['id'], 'title': existing['title'],
                             'title_slug': slug})
                continue

            # Unknown slug — fetch full metadata (needed to create anyway).
            meta = provider.fetch_problem(slug)
            if not meta:
                continue

            # Guard: a pre-existing problem (possibly with notes) tracked by
            # external id — backfill slug + log rep, don't create a duplicate.
            by_ext = db.get_problem_by_external(provider.id, meta['external_id'])
            if by_ext:
                db.update_problem(by_ext['id'], {'title_slug': slug})
                db.add_revision(by_ext['id'], revised_at=day)
                reps.append({'id': by_ext['id'], 'title': by_ext['title'],
                             'title_slug': slug})
                continue

            pid = db.create_problem({
                'platform': provider.id,
                'external_id': meta['external_id'],
                'leetcode_number': _legacy_number(provider, meta['external_id']),
                'title': meta['title'],
                'title_slug': slug,
                'difficulty': meta['difficulty'] or 'medium',
                'description': meta['description'],
                'tags': meta['tags'],
                'source_url': meta['url'],
                'created_at': solved_iso,
            })
            new_problems.append({'id': pid, 'title': meta['title'],
                                 'title_slug': slug, 'external_id': meta['external_id']})

        db.set_setting(_pkey(provider, 'username'), username)
        if profile is not None:
            db.set_setting(_pkey(provider, 'profile'), json.dumps(profile))
            db.set_setting(_pkey(provider, 'calendar'),
                           json.dumps(profile.get('submissionCalendar', {})))
        db.set_setting(_pkey(provider, 'last_sync_ts'), str(max_ts))
        db.set_setting(_pkey(provider, 'last_sync_at'), datetime.now().isoformat())

        return jsonify({
            'username': username, 'first_sync': first_sync,
            'new': new_problems, 'reps': reps,
            'new_count': len(new_problems), 'rep_count': len(reps),
            'profile': profile,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _svc_auth(provider):
    return jsonify({
        'logged_in': bool(db.get_setting(_pkey(provider, 'session'))),
        'username': db.get_setting(_pkey(provider, 'username')),
    })


def _svc_login(provider):
    if not provider.auth_fields:
        return jsonify({'error': f'{provider.name} has no login'}), 400
    body = request.json or {}
    creds = {key: (body.get(key) or '').strip() for key, _label in provider.auth_fields}
    if not creds.get('session'):
        return jsonify({'error': 'A session token is required'}), 400
    try:
        username = provider.verify_auth(creds)
        if not username:
            return jsonify({'error': 'Invalid or expired session'}), 401
        for key, _label in provider.auth_fields:
            db.set_setting(_pkey(provider, key), creds.get(key, ''))
        db.set_setting(_pkey(provider, 'username'), username)
        return jsonify({'logged_in': True, 'username': username})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _svc_logout(provider):
    for key, _label in provider.auth_fields:
        db.set_setting(_pkey(provider, key), '')
    return jsonify({'logged_in': False})


def _svc_backfill(provider):
    if not provider.has(AUTH_BACKFILL):
        return jsonify({'error': f'{provider.name} has no backfill'}), 400
    creds = _provider_creds(provider)
    if not creds:
        return jsonify({'error': 'Not logged in'}), 401
    try:
        solved = provider.list_solved(creds) or []
        created, skipped = 0, 0
        for prob in solved:
            slug = prob.get('slug')
            existing = ((db.get_problem_by_slug(slug, provider.id) if slug else None)
                        or db.get_problem_by_external(provider.id, prob['external_id']))
            if existing:
                if slug and not existing.get('title_slug'):
                    db.update_problem(existing['id'], {'title_slug': slug})
                skipped += 1
                continue

            db.create_problem({
                'platform': provider.id,
                'external_id': prob['external_id'],
                'leetcode_number': _legacy_number(provider, prob['external_id']),
                'title': prob['title'],
                'title_slug': slug,
                'difficulty': prob['difficulty'] or 'medium',
                'source_url': prob['url'],
                'tags': [],
                'imported': True,          # unknown solve date — kept off the calendar
            })
            created += 1

        # Store the real submission calendar so the activity graph reflects true
        # historical dates instead of piling every import onto today.
        if provider.has(PUBLIC_PROFILE):
            username = db.get_setting(_pkey(provider, 'username'))
            if username:
                try:
                    profile = provider.fetch_profile(username)
                    if profile:
                        db.set_setting(_pkey(provider, 'profile'), json.dumps(profile))
                        db.set_setting(_pkey(provider, 'calendar'),
                                       json.dumps(profile.get('submissionCalendar', {})))
                except Exception:
                    pass

        db.set_setting(_pkey(provider, 'last_backfill_at'), datetime.now().isoformat())
        return jsonify({'created': created, 'skipped': skipped,
                        'solved_total': created + skipped})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _svc_submissions(provider, slug):
    if not provider.has(SUBMISSION_CODE):
        return jsonify({'error': f'{provider.name} has no submissions API'}), 400
    creds = _provider_creds(provider)
    if not creds:
        return jsonify({'error': 'Not logged in'}), 401
    try:
        return jsonify(provider.submissions(creds, slug))
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _svc_submission_code(provider, submission_id):
    if not provider.has(SUBMISSION_CODE):
        return jsonify({'error': f'{provider.name} has no submissions API'}), 400
    creds = _provider_creds(provider)
    if not creds:
        return jsonify({'error': 'Not logged in'}), 401
    try:
        return jsonify(provider.submission_code(creds, submission_id))
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _legacy_number(provider, external_id):
    """Keep the legacy leetcode_number column populated for LeetCode rows."""
    if provider.id == 'leetcode' and (external_id or '').isdigit():
        return int(external_id)
    return None


# ── API: Providers (generic, platform-parameterized) ────────

@app.route('/api/providers')
def api_providers():
    """List registered platforms + capabilities for capability-driven UI."""
    return jsonify([{
        'id': p.id,
        'name': p.name,
        'base_url': p.base_url,
        'capabilities': sorted(p.capabilities),
        'auth_fields': [{'key': k, 'label': l} for k, l in p.auth_fields],
        'logged_in': bool(db.get_setting(_pkey(p, 'session'))),
        'username': db.get_setting(_pkey(p, 'username')),
    } for p in PROVIDERS.values()])


@app.route('/api/providers/<platform>/problem/<int:number>')
def api_provider_problem(platform, number):
    provider, err = _resolve_provider(platform)
    return err or _svc_fetch_problem_by_number(provider, number)


@app.route('/api/providers/<platform>/profile/<username>')
def api_provider_profile(platform, username):
    provider, err = _resolve_provider(platform)
    return err or _svc_profile(provider, username)


@app.route('/api/providers/<platform>/cached')
def api_provider_cached(platform):
    provider, err = _resolve_provider(platform)
    return err or _svc_cached(provider)


@app.route('/api/providers/<platform>/sync', methods=['POST'])
def api_provider_sync(platform):
    provider, err = _resolve_provider(platform)
    return err or _svc_sync(provider)


@app.route('/api/providers/<platform>/auth')
def api_provider_auth(platform):
    provider, err = _resolve_provider(platform)
    return err or _svc_auth(provider)


@app.route('/api/providers/<platform>/login', methods=['POST'])
def api_provider_login(platform):
    provider, err = _resolve_provider(platform)
    return err or _svc_login(provider)


@app.route('/api/providers/<platform>/logout', methods=['POST'])
def api_provider_logout(platform):
    provider, err = _resolve_provider(platform)
    return err or _svc_logout(provider)


@app.route('/api/providers/<platform>/backfill', methods=['POST'])
def api_provider_backfill(platform):
    provider, err = _resolve_provider(platform)
    return err or _svc_backfill(provider)


@app.route('/api/providers/<platform>/submissions/<slug>')
def api_provider_submissions(platform, slug):
    provider, err = _resolve_provider(platform)
    return err or _svc_submissions(provider, slug)


@app.route('/api/providers/<platform>/submission/<sid>')
def api_provider_submission(platform, sid):
    provider, err = _resolve_provider(platform)
    return err or _svc_submission_code(provider, sid)


# ── API: LeetCode aliases (back-compat; delegate to services) ─

@app.route('/api/leetcode/<int:number>')
def api_fetch_leetcode(number):
    return _svc_fetch_problem_by_number(LEETCODE, number)


@app.route('/api/leetcode/profile/<username>')
def api_leetcode_profile(username):
    return _svc_profile(LEETCODE, username)


@app.route('/api/leetcode/cached')
def api_leetcode_cached():
    return _svc_cached(LEETCODE)


@app.route('/api/leetcode/sync', methods=['POST'])
def api_leetcode_sync():
    return _svc_sync(LEETCODE)


@app.route('/api/leetcode/auth')
def api_leetcode_auth():
    return _svc_auth(LEETCODE)


@app.route('/api/leetcode/login', methods=['POST'])
def api_leetcode_login():
    return _svc_login(LEETCODE)


@app.route('/api/leetcode/logout', methods=['POST'])
def api_leetcode_logout():
    return _svc_logout(LEETCODE)


@app.route('/api/leetcode/backfill', methods=['POST'])
def api_leetcode_backfill():
    return _svc_backfill(LEETCODE)


@app.route('/api/leetcode/submissions/<slug>')
def api_leetcode_submissions(slug):
    return _svc_submissions(LEETCODE, slug)


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
    provider = get_provider(p.get('platform') or 'leetcode')
    if not provider:
        return jsonify({'enriched': False, 'reason': 'no_provider', 'problem': p})
    try:
        meta = provider.fetch_problem(slug)
        if not meta:
            return jsonify({'enriched': False, 'reason': 'not_found', 'problem': p})
        updates = {'description': meta['description']}
        if meta['tags'] and not p.get('tags'):
            updates['tags'] = meta['tags']
        if meta['difficulty']:
            updates['difficulty'] = meta['difficulty']
        db.update_problem(pid, updates)
        return jsonify({'enriched': True, 'problem': db.get_problem(pid)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/leetcode/submission/<int:sid>')
def api_leetcode_submission_code(sid):
    return _svc_submission_code(LEETCODE, sid)


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


@app.route('/api/disk-usage')
def api_disk_usage():
    data_dir = config['data_dir']
    total_size = 0
    file_count = 0
    for dirpath, _dirnames, filenames in os.walk(data_dir):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            try:
                total_size += os.path.getsize(fp)
                file_count += 1
            except OSError:
                pass
    return jsonify({
        'total_bytes': total_size,
        'total_mb': round(total_size / (1024 * 1024), 2),
        'file_count': file_count,
        'data_dir': data_dir,
    })


# ── SPA fallback (must stay last: it matches any unregistered path) ─────
# Serves the built React assets (/assets/…, /favicon.png) and hands any other
# non-API path to index.html so React Router can handle client-side routes.

@app.route('/<path:path>')
def spa_catch_all(path):
    if path.startswith('api/') or not _spa_available():
        abort(404)
    full = os.path.join(FRONTEND_DIST, path)
    if os.path.isfile(full):
        return send_from_directory(FRONTEND_DIST, path)
    return _serve_spa()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=True, port=port)
