import io
import json
import os
from datetime import date, timedelta
from unittest.mock import patch, MagicMock


PROBLEM = {
    'leetcode_number': 1,
    'title': 'Two Sum',
    'description': 'Given an array...',
    'difficulty': 'easy',
    'tags': ['Array', 'Hash Table'],
}


def create_problem(client, data=None):
    resp = client.post('/api/problems', json=data or PROBLEM)
    assert resp.status_code == 201
    return resp.get_json()['id']


class TestPageRoutes:
    def test_landing(self, app_client):
        client, _ = app_client
        resp = client.get('/')
        assert resp.status_code == 200
        assert b'LeetCode Management System' in resp.data

    def test_problem_view(self, app_client):
        client, _ = app_client
        pid = create_problem(client)
        resp = client.get(f'/problem/{pid}')
        assert resp.status_code == 200

    def test_problem_view_404(self, app_client):
        client, _ = app_client
        resp = client.get('/problem/999')
        assert resp.status_code == 404


class TestProblemsAPI:
    def test_create(self, app_client):
        client, _ = app_client
        resp = client.post('/api/problems', json=PROBLEM)
        assert resp.status_code == 201
        assert 'id' in resp.get_json()

    def test_get(self, app_client):
        client, _ = app_client
        pid = create_problem(client)
        resp = client.get(f'/api/problems/{pid}')
        data = resp.get_json()
        assert data['title'] == 'Two Sum'
        assert data['tags'] == ['Array', 'Hash Table']

    def test_get_404(self, app_client):
        client, _ = app_client
        resp = client.get('/api/problems/999')
        assert resp.status_code == 404

    def test_update(self, app_client):
        client, _ = app_client
        pid = create_problem(client)
        resp = client.put(f'/api/problems/{pid}', json={'title': 'Three Sum'})
        assert resp.get_json()['ok']
        data = client.get(f'/api/problems/{pid}').get_json()
        assert data['title'] == 'Three Sum'

    def test_delete(self, app_client):
        client, _ = app_client
        pid = create_problem(client)
        resp = client.delete(f'/api/problems/{pid}')
        assert resp.get_json()['ok']
        assert client.get(f'/api/problems/{pid}').status_code == 404

    def test_list_all(self, app_client):
        client, _ = app_client
        create_problem(client)
        create_problem(client, {**PROBLEM, 'title': 'Merge Intervals'})
        resp = client.get('/api/problems')
        assert len(resp.get_json()) == 2

    def test_list_filter_search(self, app_client):
        client, _ = app_client
        create_problem(client)
        create_problem(client, {**PROBLEM, 'title': 'Merge Intervals'})
        resp = client.get('/api/problems?search=Merge')
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]['title'] == 'Merge Intervals'

    def test_list_filter_tag(self, app_client):
        client, _ = app_client
        create_problem(client)
        create_problem(client, {**PROBLEM, 'title': 'DP Problem', 'tags': ['DP']})
        resp = client.get('/api/problems?tag=DP')
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]['title'] == 'DP Problem'

    def test_list_filter_difficulty(self, app_client):
        client, _ = app_client
        create_problem(client)
        create_problem(client, {**PROBLEM, 'title': 'Hard', 'difficulty': 'hard'})
        resp = client.get('/api/problems?difficulty=easy')
        data = resp.get_json()
        assert len(data) == 1


class TestTabsAPI:
    def test_get_tabs(self, app_client):
        client, _ = app_client
        pid = create_problem(client)
        resp = client.get(f'/api/problems/{pid}/tabs')
        tabs = resp.get_json()
        assert len(tabs) == 1
        assert tabs[0]['title'] == 'Approach 1'

    def test_create_tab(self, app_client):
        client, _ = app_client
        pid = create_problem(client)
        resp = client.post(f'/api/problems/{pid}/tabs', json={'title': 'Brute Force'})
        assert resp.status_code == 201
        tabs = client.get(f'/api/problems/{pid}/tabs').get_json()
        assert len(tabs) == 2

    def test_create_tab_default_title(self, app_client):
        client, _ = app_client
        pid = create_problem(client)
        resp = client.post(f'/api/problems/{pid}/tabs', json={})
        assert resp.status_code == 201
        tabs = client.get(f'/api/problems/{pid}/tabs').get_json()
        assert any(t['title'] == 'New Approach' for t in tabs)

    def test_update_tab(self, app_client):
        client, _ = app_client
        pid = create_problem(client)
        tabs = client.get(f'/api/problems/{pid}/tabs').get_json()
        tid = tabs[0]['id']
        blocks = [{'type': 'code', 'lang': 'python', 'content': 'print(1)'}]
        resp = client.put(f'/api/tabs/{tid}', json={'content': blocks})
        assert resp.get_json()['ok']
        updated = client.get(f'/api/problems/{pid}/tabs').get_json()
        assert updated[0]['content'] == blocks

    def test_delete_tab(self, app_client):
        client, _ = app_client
        pid = create_problem(client)
        tid = client.post(f'/api/problems/{pid}/tabs', json={'title': 'Temp'}).get_json()['id']
        client.delete(f'/api/tabs/{tid}')
        tabs = client.get(f'/api/problems/{pid}/tabs').get_json()
        assert not any(t['id'] == tid for t in tabs)


class TestRevisionsAPI:
    def test_revise(self, app_client):
        client, _ = app_client
        pid = create_problem(client)
        resp = client.post(f'/api/problems/{pid}/revise', json={})
        assert resp.get_json()['ok']

    def test_revise_with_reminder(self, app_client):
        client, _ = app_client
        pid = create_problem(client)
        client.post(f'/api/problems/{pid}/revise', json={'remind_days': 7})
        p = client.get(f'/api/problems/{pid}').get_json()
        expected = (date.today() + timedelta(days=7)).isoformat()
        assert p['remind_date'] == expected

    def test_get_revisions(self, app_client):
        client, _ = app_client
        pid = create_problem(client)
        client.post(f'/api/problems/{pid}/revise', json={})
        client.post(f'/api/problems/{pid}/revise', json={})
        resp = client.get(f'/api/problems/{pid}/revisions')
        assert len(resp.get_json()) == 2


class TestStatsAPI:
    def test_stats(self, app_client):
        client, _ = app_client
        create_problem(client)
        resp = client.get('/api/stats')
        data = resp.get_json()
        assert 'difficulty_counts' in data
        assert 'tag_counts' in data
        assert data['difficulty_counts']['easy'] == 1

    def test_reminders(self, app_client):
        client, _ = app_client
        pid = create_problem(client)
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        client.put(f'/api/problems/{pid}', json={'remind_date': yesterday})
        resp = client.get('/api/reminders')
        assert len(resp.get_json()) == 1

    def test_calendar(self, app_client):
        client, _ = app_client
        create_problem(client)
        today = date.today()
        resp = client.get(f'/api/calendar/{today.year}/{today.month}')
        data = resp.get_json()
        assert today.isoformat() in data

    def test_contributions(self, app_client):
        client, _ = app_client
        create_problem(client)
        resp = client.get('/api/contributions')
        data = resp.get_json()
        assert date.today().isoformat() in data


class TestSettingsAPI:
    def test_get_settings(self, app_client):
        client, _ = app_client
        resp = client.get('/api/settings')
        assert resp.status_code == 200
        assert isinstance(resp.get_json(), dict)

    def test_put_settings(self, app_client):
        client, _ = app_client
        client.put('/api/settings', json={'default_language': 'python'})
        resp = client.get('/api/settings')
        assert resp.get_json()['default_language'] == 'python'


class TestConfigAPI:
    def test_get_config_includes_version(self, app_client):
        client, mod = app_client
        resp = client.get('/api/config')
        data = resp.get_json()
        assert data['version'] == mod.VERSION
        assert 'data_dir' in data

    def test_put_config_updates_data_dir(self, app_client):
        client, mod = app_client
        import tempfile, os
        new_dir = tempfile.mkdtemp()
        resp = client.put('/api/config', json={'data_dir': new_dir})
        assert resp.get_json()['ok']
        cfg = client.get('/api/config').get_json()
        assert cfg['data_dir'] == new_dir


class TestLeetCodeFetch:
    def test_fetch_success(self, app_client):
        client, _ = app_client
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            'data': {
                'problemsetQuestionList': {
                    'questions': [{
                        'frontendQuestionId': '1',
                        'title': 'Two Sum',
                        'titleSlug': 'two-sum',
                        'difficulty': 'Easy',
                        'topicTags': [{'name': 'Array'}, {'name': 'Hash Table'}],
                        'content': '<p>Given an array...</p>',
                    }]
                }
            }
        }
        with patch('requests.post', return_value=mock_resp):
            resp = client.get('/api/leetcode/1')
        data = resp.get_json()
        assert data['title'] == 'Two Sum'
        assert data['difficulty'] == 'easy'
        assert 'Array' in data['tags']

    def test_fetch_not_found(self, app_client):
        client, _ = app_client
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            'data': {'problemsetQuestionList': {'questions': []}}
        }
        with patch('requests.post', return_value=mock_resp):
            resp = client.get('/api/leetcode/99999')
        assert resp.status_code == 404

    def test_fetch_error(self, app_client):
        client, _ = app_client
        with patch('requests.post', side_effect=Exception('network error')):
            resp = client.get('/api/leetcode/1')
        assert resp.status_code == 500
        assert 'network error' in resp.get_json()['error']


# ── LeetCode profile + sync (public-by-username) ────────────

MATCHED_USER = {
    'username': 'neetcode',
    'profile': {'realName': 'Neet', 'ranking': 12345, 'reputation': 1},
    'submitStatsGlobal': {'acSubmissionNum': [
        {'difficulty': 'All', 'count': 2},
        {'difficulty': 'Easy', 'count': 1},
        {'difficulty': 'Medium', 'count': 1},
        {'difficulty': 'Hard', 'count': 0},
    ]},
    'userCalendar': {'streak': 3, 'totalActiveDays': 10,
                     'submissionCalendar': '{"1700000000": 2}'},
}

QUESTIONS = {
    'two-sum': {'questionFrontendId': '1', 'title': 'Two Sum', 'difficulty': 'Easy',
                'topicTags': [{'name': 'Array'}], 'content': '<p>two sum</p>'},
    'add-two-numbers': {'questionFrontendId': '2', 'title': 'Add Two Numbers',
                        'difficulty': 'Medium', 'topicTags': [{'name': 'Linked List'}],
                        'content': '<p>add</p>'},
}


def make_lc_post(recent, matched_user=MATCHED_USER, questions=QUESTIONS):
    """Fake requests.post that dispatches on the GraphQL query string."""
    def fake_post(url, json=None, **kwargs):
        q, v = json['query'], json['variables']
        m = MagicMock()
        if 'matchedUser' in q:
            m.json.return_value = {'data': {'matchedUser': matched_user}}
        elif 'recentAcSubmissionList' in q:
            m.json.return_value = {'data': {'recentAcSubmissionList': recent}}
        elif 'question(titleSlug' in q:
            m.json.return_value = {'data': {'question': questions.get(v['slug'])}}
        else:
            m.json.return_value = {'data': {}}
        return m
    return fake_post


class TestLeetCodeProfile:
    def test_profile_success(self, app_client):
        client, _ = app_client
        with patch('requests.post', side_effect=make_lc_post([])):
            resp = client.get('/api/leetcode/profile/neetcode')
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['username'] == 'neetcode'
        assert data['solved']['all'] == 2
        assert data['streak'] == 3
        assert data['submissionCalendar'] == {'1700000000': 2}

    def test_profile_not_found(self, app_client):
        client, _ = app_client

        def no_user(url, json=None, **kwargs):
            m = MagicMock()
            m.json.return_value = {'data': {'matchedUser': None}}
            return m
        with patch('requests.post', side_effect=no_user):
            resp = client.get('/api/leetcode/profile/ghost')
        assert resp.status_code == 404


class TestLeetCodeSync:
    def test_initial_sync_creates_problems(self, app_client):
        client, app_module = app_client
        recent = [
            {'title': 'Two Sum', 'titleSlug': 'two-sum', 'timestamp': '1700000100'},
            {'title': 'Add Two Numbers', 'titleSlug': 'add-two-numbers', 'timestamp': '1700000200'},
        ]
        with patch('requests.post', side_effect=make_lc_post(recent)):
            resp = client.post('/api/leetcode/sync', json={'username': 'neetcode'})
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['new_count'] == 2
        assert data['rep_count'] == 0
        # Problem created with slug + real solve date as created_at.
        p = app_module.db.get_problem_by_slug('two-sum')
        assert p is not None
        assert p['leetcode_number'] == 1
        assert p['created_at'].startswith('2023-11-14')  # ts 1700000100

    def test_rep_detected_for_existing_slug(self, app_client):
        client, app_module = app_client
        pid = app_module.db.create_problem(
            {'title': 'Two Sum', 'title_slug': 'two-sum', 'leetcode_number': 1})
        recent = [{'title': 'Two Sum', 'titleSlug': 'two-sum', 'timestamp': '1700000100'}]
        with patch('requests.post', side_effect=make_lc_post(recent)):
            resp = client.post('/api/leetcode/sync', json={'username': 'neetcode'})
        data = resp.get_json()
        assert data['new_count'] == 0
        assert data['rep_count'] == 1
        assert len(app_module.db.get_revisions(pid)) == 1

    def test_dedup_by_number_protects_notes(self, app_client):
        client, app_module = app_client
        # Pre-existing problem tracked by number only (no slug), with notes.
        pid = app_module.db.create_problem({'title': 'Two Sum', 'leetcode_number': 1})
        tabs = app_module.db.get_tabs(pid)
        app_module.db.update_tab(tabs[0]['id'], {'content': [{'note': 'my solution'}]})

        recent = [{'title': 'Two Sum', 'titleSlug': 'two-sum', 'timestamp': '1700000100'}]
        with patch('requests.post', side_effect=make_lc_post(recent)):
            resp = client.post('/api/leetcode/sync', json={'username': 'neetcode'})
        data = resp.get_json()
        # No duplicate created; treated as a rep of the existing problem.
        assert data['new_count'] == 0
        assert data['rep_count'] == 1
        assert app_module.db.get_problem_by_slug('two-sum')['id'] == pid
        # Notes preserved.
        assert app_module.db.get_tabs(pid)[0]['content'] == [{'note': 'my solution'}]

    def test_watermark_skips_already_synced(self, app_client):
        client, app_module = app_client
        recent = [{'title': 'Two Sum', 'titleSlug': 'two-sum', 'timestamp': '1700000100'}]
        with patch('requests.post', side_effect=make_lc_post(recent)):
            client.post('/api/leetcode/sync', json={'username': 'neetcode'})
            resp = client.post('/api/leetcode/sync', json={'username': 'neetcode'})
        data = resp.get_json()
        assert data['new_count'] == 0
        assert data['rep_count'] == 0

    def test_calendar_merged_into_contributions(self, app_client):
        client, _ = app_client
        with patch('requests.post', side_effect=make_lc_post([])):
            client.post('/api/leetcode/sync', json={'username': 'neetcode'})
        resp = client.get('/api/contributions')
        data = resp.get_json()
        # ts 1700000000 → 2023-11-14 (UTC), count 2 from submissionCalendar.
        assert data.get('2023-11-14') == 2

    def test_sync_requires_username(self, app_client):
        client, _ = app_client
        resp = client.post('/api/leetcode/sync', json={})
        assert resp.status_code == 400


# ── LeetCode account / auth (v2) ────────────────────────────

def problems_all_payload(status_map):
    """Build a /api/problems/all/ style payload. status_map: {slug: 'ac'|None}."""
    meta = {
        'two-sum': (1, 'Two Sum', 1),
        'add-two-numbers': (2, 'Add Two Numbers', 2),
        'median-two-sorted': (4, 'Median of Two Sorted Arrays', 3),
    }
    pairs = []
    for slug, (num, title, level) in meta.items():
        pairs.append({
            'stat': {'question__title': title, 'question__title_slug': slug,
                     'frontend_question_id': num},
            'difficulty': {'level': level},
            'status': status_map.get(slug),
            'paid_only': False,
        })
    return {'stat_status_pairs': pairs}


def signed_in_post(username='votrubac'):
    def fake_post(url, json=None, **kwargs):
        m = MagicMock()
        m.json.return_value = {'data': {'userStatus': {'username': username, 'isSignedIn': True}}}
        return m
    return fake_post


class TestLeetCodeAccount:
    def _login(self, client):
        with patch('requests.post', side_effect=signed_in_post()):
            return client.post('/api/leetcode/login',
                               json={'session': 'sess-token', 'csrf': 'csrf-token'})

    def test_login_success(self, app_client):
        client, app_module = app_client
        resp = self._login(client)
        assert resp.status_code == 200
        assert resp.get_json()['username'] == 'votrubac'
        # Token persisted server-side...
        assert app_module.db.get_setting('leetcode_session') == 'sess-token'

    def test_login_rejects_invalid_session(self, app_client):
        client, _ = app_client

        def not_signed_in(url, json=None, **kwargs):
            m = MagicMock()
            m.json.return_value = {'data': {'userStatus': {'username': '', 'isSignedIn': False}}}
            return m
        with patch('requests.post', side_effect=not_signed_in):
            resp = client.post('/api/leetcode/login', json={'session': 'bad'})
        assert resp.status_code == 401

    def test_token_never_exposed_via_settings(self, app_client):
        client, _ = app_client
        self._login(client)
        settings = client.get('/api/settings').get_json()
        assert 'leetcode_session' not in settings
        assert 'leetcode_csrf' not in settings
        # But auth state is reported without the token.
        auth = client.get('/api/leetcode/auth').get_json()
        assert auth['logged_in'] is True
        assert auth['username'] == 'votrubac'

    def test_settings_put_cannot_set_token(self, app_client):
        client, app_module = app_client
        client.put('/api/settings', json={'leetcode_session': 'injected'})
        assert app_module.db.get_setting('leetcode_session') in (None, '')

    def test_backfill_requires_login(self, app_client):
        client, _ = app_client
        resp = client.post('/api/leetcode/backfill')
        assert resp.status_code == 401

    def test_backfill_imports_only_solved(self, app_client):
        client, app_module = app_client
        self._login(client)
        payload = problems_all_payload(
            {'two-sum': 'ac', 'add-two-numbers': 'ac', 'median-two-sorted': None})
        mock_get = MagicMock()
        mock_get.json.return_value = payload
        with patch('requests.get', return_value=mock_get):
            resp = client.post('/api/leetcode/backfill')
        data = resp.get_json()
        assert data['created'] == 2                 # only the two AC problems
        assert data['solved_total'] == 2
        assert app_module.db.get_problem_by_slug('two-sum') is not None
        assert app_module.db.get_problem_by_slug('median-two-sorted') is None  # unsolved skipped

    def test_backfill_dedups_and_backfills_slug(self, app_client):
        client, app_module = app_client
        self._login(client)
        # Pre-existing problem tracked by number only (no slug), with notes.
        pid = app_module.db.create_problem({'title': 'Two Sum', 'leetcode_number': 1})
        tabs = app_module.db.get_tabs(pid)
        app_module.db.update_tab(tabs[0]['id'], {'content': [{'note': 'mine'}]})

        payload = problems_all_payload({'two-sum': 'ac'})
        mock_get = MagicMock()
        mock_get.json.return_value = payload
        with patch('requests.get', return_value=mock_get):
            resp = client.post('/api/leetcode/backfill')
        data = resp.get_json()
        assert data['created'] == 0 and data['skipped'] == 1     # no duplicate
        assert app_module.db.get_problem_by_slug('two-sum')['id'] == pid  # slug backfilled
        assert app_module.db.get_tabs(pid)[0]['content'] == [{'note': 'mine'}]  # notes kept

    def test_imported_problems_stay_off_calendar(self, app_client):
        client, app_module = app_client
        self._login(client)
        payload = problems_all_payload({'two-sum': 'ac', 'add-two-numbers': 'ac'})
        mock_get = MagicMock()
        mock_get.json.return_value = payload
        with patch('requests.get', return_value=mock_get):
            client.post('/api/leetcode/backfill')
        # They exist and count toward stats...
        assert len(app_module.db.list_problems()) == 2
        # ...but do NOT appear on today's calendar or spike the activity graph.
        today = date.today()
        cal = client.get(f'/api/calendar/{today.year}/{today.month}').get_json()
        assert all(len(v) == 0 for v in cal.values())
        contrib = client.get('/api/contributions').get_json()
        assert contrib.get(today.isoformat(), 0) == 0

    def test_logout_clears_session(self, app_client):
        client, app_module = app_client
        self._login(client)
        client.post('/api/leetcode/logout')
        assert client.get('/api/leetcode/auth').get_json()['logged_in'] is False
        assert not app_module.db.get_setting('leetcode_session')


class TestProviderRoutes:
    def test_list_providers(self, app_client):
        client, _ = app_client
        data = client.get('/api/providers').get_json()
        lc = next(p for p in data if p['id'] == 'leetcode')
        assert lc['name'] == 'LeetCode'
        assert 'auth_backfill' in lc['capabilities']
        assert {'key': 'session', 'label': 'LEETCODE_SESSION'} in lc['auth_fields']
        assert lc['logged_in'] is False

    def test_unknown_platform_404(self, app_client):
        client, _ = app_client
        assert client.get('/api/providers/hackerrank/profile/x').status_code == 404
        assert client.post('/api/providers/hackerrank/sync').status_code == 404

    def test_generic_profile_matches_alias(self, app_client):
        client, _ = app_client
        with patch('requests.post', side_effect=make_lc_post([])):
            generic = client.get('/api/providers/leetcode/profile/neetcode').get_json()
            alias = client.get('/api/leetcode/profile/neetcode').get_json()
        assert generic == alias
        assert generic['username'] == 'neetcode'

    def test_generic_sync_creates_problems(self, app_client):
        client, app_module = app_client
        recent = [{'title': 'Two Sum', 'titleSlug': 'two-sum', 'timestamp': '1700000100'}]
        with patch('requests.post', side_effect=make_lc_post(recent)):
            resp = client.post('/api/providers/leetcode/sync', json={'username': 'neetcode'})
        assert resp.get_json()['new_count'] == 1
        assert app_module.db.get_problem_by_external('leetcode', '1') is not None

    def test_generic_login_and_backfill(self, app_client):
        client, app_module = app_client
        with patch('requests.post', side_effect=signed_in_post()):
            login = client.post('/api/providers/leetcode/login',
                                json={'session': 'sess', 'csrf': 'c'})
        assert login.get_json()['username'] == 'votrubac'
        mock_get = MagicMock()
        mock_get.json.return_value = problems_all_payload({'two-sum': 'ac'})
        with patch('requests.get', return_value=mock_get):
            bf = client.post('/api/providers/leetcode/backfill')
        assert bf.get_json()['created'] == 1

    def test_capability_gating(self, app_client, monkeypatch):
        client, app_module = app_client
        # Temporarily strip a capability and confirm the route rejects it.
        from providers import get_provider, PUBLIC_RECENT
        lc = get_provider('leetcode')
        monkeypatch.setattr(lc, 'capabilities', lc.capabilities - {PUBLIC_RECENT})
        resp = client.post('/api/providers/leetcode/sync', json={'username': 'x'})
        assert resp.status_code == 400


class TestEnrichProblem:
    def test_enrich_fills_empty_description(self, app_client):
        client, app_module = app_client
        pid = app_module.db.create_problem(
            {'title': 'Two Sum', 'title_slug': 'two-sum', 'leetcode_number': 1,
             'imported': True})
        with patch('requests.post', side_effect=make_lc_post([])):
            resp = client.post(f'/api/problems/{pid}/enrich')
        data = resp.get_json()
        assert data['enriched'] is True
        assert 'two sum' in data['problem']['description']
        assert 'Array' in data['problem']['tags']

    def test_enrich_never_overwrites_existing(self, app_client):
        client, app_module = app_client
        pid = app_module.db.create_problem(
            {'title': 'Two Sum', 'title_slug': 'two-sum',
             'description': 'MY OWN NOTES', 'leetcode_number': 1})
        with patch('requests.post', side_effect=make_lc_post([])):
            resp = client.post(f'/api/problems/{pid}/enrich')
        data = resp.get_json()
        assert data['enriched'] is False
        assert data['problem']['description'] == 'MY OWN NOTES'

    def test_enrich_noop_without_slug(self, app_client):
        client, app_module = app_client
        pid = app_module.db.create_problem({'title': 'Manual', 'leetcode_number': None})
        resp = client.post(f'/api/problems/{pid}/enrich')
        assert resp.get_json()['enriched'] is False


class TestFileUpload:
    def test_upload_file(self, app_client):
        client, _ = app_client
        data = {'file': (io.BytesIO(b'fake image data'), 'test.png')}
        resp = client.post('/api/upload', content_type='multipart/form-data', data=data)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['url'].startswith('/api/files/')
        assert body['filename'].endswith('.png')

    def test_upload_no_file(self, app_client):
        client, _ = app_client
        resp = client.post('/api/upload', content_type='multipart/form-data', data={})
        assert resp.status_code == 400
        assert resp.get_json()['error'] == 'No file'

    def test_serve_uploaded_file(self, app_client):
        client, _ = app_client
        data = {'file': (io.BytesIO(b'hello world'), 'doc.txt')}
        upload = client.post('/api/upload', content_type='multipart/form-data', data=data)
        url = upload.get_json()['url']
        resp = client.get(url)
        assert resp.status_code == 200
        assert resp.data == b'hello world'

    def test_serve_nonexistent_file(self, app_client):
        client, _ = app_client
        resp = client.get('/api/files/nonexistent.txt')
        assert resp.status_code == 404

    def test_upload_generates_unique_names(self, app_client):
        client, _ = app_client
        names = set()
        for _ in range(3):
            data = {'file': (io.BytesIO(b'x'), 'same.png')}
            resp = client.post('/api/upload', content_type='multipart/form-data', data=data)
            names.add(resp.get_json()['filename'])
        assert len(names) == 3


class TestVideoThumbnail:
    def test_youtube_url_extracts_id(self, app_client):
        client, _ = app_client
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'fake jpeg'
        with patch('requests.get', return_value=mock_resp):
            resp = client.post('/api/video-thumbnail',
                               json={'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'})
        body = resp.get_json()
        assert body['type'] == 'youtube'
        assert body['video_id'] == 'dQw4w9WgXcQ'
        assert body['thumbnail'].startswith('/api/files/')

    def test_youtube_thumbnail_cached_locally(self, app_client):
        client, mod = app_client
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'jpeg data'
        with patch('requests.get', return_value=mock_resp):
            client.post('/api/video-thumbnail',
                        json={'url': 'https://youtu.be/dQw4w9WgXcQ'})
        thumb_path = os.path.join(mod._files_dir(), 'thumb_dQw4w9WgXcQ.jpg')
        assert os.path.exists(thumb_path)
        with open(thumb_path, 'rb') as f:
            assert f.read() == b'jpeg data'

    def test_youtube_thumbnail_fetch_failure(self, app_client):
        client, _ = app_client
        with patch('requests.get', side_effect=Exception('timeout')):
            resp = client.post('/api/video-thumbnail',
                               json={'url': 'https://www.youtube.com/watch?v=abc12345678'})
        body = resp.get_json()
        assert body['type'] == 'youtube'
        assert body['video_id'] == 'abc12345678'
        assert body['thumbnail'] is None

    def test_non_youtube_url(self, app_client):
        client, _ = app_client
        resp = client.post('/api/video-thumbnail',
                           json={'url': 'https://example.com/video.mp4'})
        body = resp.get_json()
        assert body['type'] == 'url'
        assert body['video_id'] is None
        assert body['thumbnail'] is None

    def test_youtu_be_short_url(self, app_client):
        client, _ = app_client
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'img'
        with patch('requests.get', return_value=mock_resp):
            resp = client.post('/api/video-thumbnail',
                               json={'url': 'https://youtu.be/xyzABCDE123'})
        body = resp.get_json()
        assert body['video_id'] == 'xyzABCDE123'
        assert body['type'] == 'youtube'

    def test_embed_url(self, app_client):
        client, _ = app_client
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b'img'
        with patch('requests.get', return_value=mock_resp):
            resp = client.post('/api/video-thumbnail',
                               json={'url': 'https://www.youtube.com/embed/dQw4w9WgXcQ'})
        body = resp.get_json()
        assert body['video_id'] == 'dQw4w9WgXcQ'
