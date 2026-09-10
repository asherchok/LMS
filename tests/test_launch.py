import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestLoadConfig:
    def test_missing_file_defaults(self, tmp_path, monkeypatch):
        import app as app_module
        monkeypatch.setattr(app_module, 'CONFIG_PATH', str(tmp_path / 'nope.json'))
        monkeypatch.setattr(app_module, 'BASE', str(tmp_path))
        cfg = app_module.load_config()
        assert os.path.normpath(cfg['data_dir']) == os.path.join(str(tmp_path), 'data')

    def test_relative_dir_resolved(self, tmp_path, monkeypatch):
        cfg_path = tmp_path / 'config.json'
        cfg_path.write_text(json.dumps({'data_dir': './mydata'}))
        import app as app_module
        monkeypatch.setattr(app_module, 'CONFIG_PATH', str(cfg_path))
        monkeypatch.setattr(app_module, 'BASE', str(tmp_path))
        cfg = app_module.load_config()
        assert os.path.isabs(cfg['data_dir'])
        assert os.path.normpath(cfg['data_dir']) == os.path.join(str(tmp_path), 'mydata')

    def test_absolute_dir_kept(self, tmp_path, monkeypatch):
        abs_dir = str(tmp_path / 'absolute')
        cfg_path = tmp_path / 'config.json'
        cfg_path.write_text(json.dumps({'data_dir': abs_dir}))
        import app as app_module
        monkeypatch.setattr(app_module, 'CONFIG_PATH', str(cfg_path))
        monkeypatch.setattr(app_module, 'BASE', str(tmp_path))
        cfg = app_module.load_config()
        assert cfg['data_dir'] == abs_dir


class TestVenvOk:
    def test_returns_false_when_missing(self, tmp_path, monkeypatch):
        import launch
        monkeypatch.setattr(launch, 'VENV', str(tmp_path / 'nonexistent'))
        assert launch.venv_ok() is False
