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
