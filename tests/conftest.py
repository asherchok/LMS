import json
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models import Database


@pytest.fixture
def tmp_db(tmp_path):
    return Database(str(tmp_path / 'test.db'))


@pytest.fixture
def sample_problem():
    return {
        'leetcode_number': 1,
        'title': 'Two Sum',
        'description': '<p>Given an array...</p>',
        'difficulty': 'easy',
        'elo_rating': 1200,
        'source_url': 'https://leetcode.com/problems/two-sum/',
        'tags': ['Array', 'Hash Table'],
    }


@pytest.fixture
def app_client(tmp_path):
    config_path = tmp_path / 'config.json'
    data_dir = tmp_path / 'data'
    data_dir.mkdir()
    config_path.write_text(json.dumps({'data_dir': str(data_dir)}))

    import app as app_module
    app_module.CONFIG_PATH = str(config_path)
    app_module.config = app_module.load_config()
    os.makedirs(app_module.config['data_dir'], exist_ok=True)
    app_module.db = Database(os.path.join(app_module.config['data_dir'], 'lms.db'))
    app_module.app.config['TESTING'] = True

    with app_module.app.test_client() as client:
        yield client, app_module
