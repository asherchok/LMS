from flask import Flask, render_template, request, jsonify
import json
import os
from datetime import date, timedelta
from models import Database

app = Flask(__name__)

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
    return jsonify(db.get_contribution_data())


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
    return jsonify(load_config())


@app.route('/api/config', methods=['PUT'])
def api_update_config():
    global config, db
    config.update(request.json)
    save_config(config)
    config = load_config()
    os.makedirs(config['data_dir'], exist_ok=True)
    db = Database(os.path.join(config['data_dir'], 'lms.db'))
    return jsonify({'ok': True})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=True, port=port)
