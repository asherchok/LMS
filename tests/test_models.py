import json
from datetime import date, timedelta

from models import Database


class TestDatabaseInit:
    def test_creates_tables(self, tmp_path):
        db = Database(str(tmp_path / 'test.db'))
        import sqlite3
        conn = sqlite3.connect(str(tmp_path / 'test.db'))
        tables = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        conn.close()
        assert {'problems', 'tabs', 'revisions', 'settings'}.issubset(tables)

    def test_creates_parent_directory(self, tmp_path):
        nested = tmp_path / 'a' / 'b'
        Database(str(nested / 'test.db'))
        assert nested.exists()


class TestProblems:
    def test_create_and_get(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        p = tmp_db.get_problem(pid)
        assert p['title'] == 'Two Sum'
        assert p['difficulty'] == 'easy'
        assert p['tags'] == ['Array', 'Hash Table']
        assert p['leetcode_number'] == 1

    def test_create_makes_default_tab(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tabs = tmp_db.get_tabs(pid)
        assert len(tabs) == 1
        assert tabs[0]['title'] == 'Approach 1'

    def test_get_nonexistent_returns_none(self, tmp_db):
        assert tmp_db.get_problem(999) is None

    def test_update(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tmp_db.update_problem(pid, {'title': 'Three Sum', 'difficulty': 'medium'})
        p = tmp_db.get_problem(pid)
        assert p['title'] == 'Three Sum'
        assert p['difficulty'] == 'medium'

    def test_update_tags(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tmp_db.update_problem(pid, {'tags': ['DP']})
        p = tmp_db.get_problem(pid)
        assert p['tags'] == ['DP']

    def test_update_empty_does_nothing(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tmp_db.update_problem(pid, {})
        assert tmp_db.get_problem(pid)['title'] == 'Two Sum'

    def test_delete(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tmp_db.delete_problem(pid)
        assert tmp_db.get_problem(pid) is None

    def test_delete_cascades_tabs(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tmp_db.create_tab(pid, 'Extra')
        tmp_db.delete_problem(pid)
        assert tmp_db.get_tabs(pid) == []

    def test_list_all(self, tmp_db, sample_problem):
        tmp_db.create_problem(sample_problem)
        tmp_db.create_problem({**sample_problem, 'title': 'Merge Intervals', 'difficulty': 'medium'})
        result = tmp_db.list_problems()
        assert len(result) == 2

    def test_list_filter_by_search(self, tmp_db, sample_problem):
        tmp_db.create_problem(sample_problem)
        tmp_db.create_problem({**sample_problem, 'title': 'Merge Intervals'})
        result = tmp_db.list_problems(search='Merge')
        assert len(result) == 1
        assert result[0]['title'] == 'Merge Intervals'

    def test_list_filter_by_tag(self, tmp_db, sample_problem):
        tmp_db.create_problem(sample_problem)
        tmp_db.create_problem({**sample_problem, 'title': 'Climbing Stairs', 'tags': ['DP']})
        result = tmp_db.list_problems(tag='DP')
        assert len(result) == 1
        assert result[0]['title'] == 'Climbing Stairs'

    def test_list_filter_by_difficulty(self, tmp_db, sample_problem):
        tmp_db.create_problem(sample_problem)
        tmp_db.create_problem({**sample_problem, 'title': 'Hard Problem', 'difficulty': 'hard'})
        result = tmp_db.list_problems(difficulty='easy')
        assert len(result) == 1
        assert result[0]['title'] == 'Two Sum'

    def test_list_ordered_newest_first(self, tmp_db, sample_problem):
        tmp_db.create_problem(sample_problem)
        tmp_db.create_problem({**sample_problem, 'title': 'Second'})
        result = tmp_db.list_problems()
        assert result[0]['title'] == 'Second'


class TestTabs:
    def test_create_and_get(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tid = tmp_db.create_tab(pid, 'Brute Force')
        tabs = tmp_db.get_tabs(pid)
        assert len(tabs) == 2  # default + new
        assert any(t['title'] == 'Brute Force' for t in tabs)

    def test_update_title(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tid = tmp_db.create_tab(pid, 'Draft')
        tmp_db.update_tab(tid, {'title': 'Final'})
        tabs = tmp_db.get_tabs(pid)
        assert any(t['title'] == 'Final' for t in tabs)

    def test_update_content(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tabs = tmp_db.get_tabs(pid)
        tid = tabs[0]['id']
        blocks = [{'type': 'code', 'lang': 'python', 'content': 'x = 1'}]
        tmp_db.update_tab(tid, {'content': blocks})
        updated = tmp_db.get_tabs(pid)
        assert updated[0]['content'] == blocks

    def test_delete(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tid = tmp_db.create_tab(pid, 'Temp')
        tmp_db.delete_tab(tid)
        tabs = tmp_db.get_tabs(pid)
        assert not any(t['id'] == tid for t in tabs)


class TestRevisions:
    def test_add_and_get(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tmp_db.add_revision(pid)
        revs = tmp_db.get_revisions(pid)
        assert len(revs) == 1
        assert revs[0]['problem_id'] == pid

    def test_increments_count(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tmp_db.add_revision(pid)
        tmp_db.add_revision(pid)
        p = tmp_db.get_problem(pid)
        assert p['revision_count'] == 2

    def test_revision_date_is_today(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tmp_db.add_revision(pid)
        revs = tmp_db.get_revisions(pid)
        assert revs[0]['revised_at'] == date.today().isoformat()


class TestReminders:
    def test_returns_due_reminders(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        tmp_db.update_problem(pid, {'remind_date': yesterday})
        reminders = tmp_db.get_reminders()
        assert len(reminders) == 1
        assert reminders[0]['id'] == pid

    def test_excludes_future_reminders(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        tmp_db.update_problem(pid, {'remind_date': tomorrow})
        assert tmp_db.get_reminders() == []

    def test_includes_today(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        tmp_db.update_problem(pid, {'remind_date': date.today().isoformat()})
        assert len(tmp_db.get_reminders()) == 1


class TestStats:
    def test_difficulty_counts(self, tmp_db, sample_problem):
        tmp_db.create_problem(sample_problem)  # easy
        tmp_db.create_problem({**sample_problem, 'title': 'P2', 'difficulty': 'hard'})
        counts = tmp_db.get_difficulty_counts()
        assert counts['easy'] == 1
        assert counts['hard'] == 1

    def test_tag_counts(self, tmp_db, sample_problem):
        tmp_db.create_problem(sample_problem)  # Array, Hash Table
        tmp_db.create_problem({**sample_problem, 'title': 'P2', 'tags': ['Array', 'DP']})
        counts = tmp_db.get_tag_counts()
        assert counts['Array'] == 2
        assert counts['Hash Table'] == 1
        assert counts['DP'] == 1


class TestCalendar:
    def test_returns_created_problems_for_month(self, tmp_db, sample_problem):
        pid = tmp_db.create_problem(sample_problem)
        today = date.today()
        data = tmp_db.get_calendar_data(today.year, today.month)
        assert today.isoformat() in data
        entries = data[today.isoformat()]
        assert any(e['id'] == pid for e in entries)

    def test_empty_month_returns_empty(self, tmp_db):
        data = tmp_db.get_calendar_data(2020, 1)
        assert data == {}


class TestContributions:
    def test_returns_activity_dict(self, tmp_db, sample_problem):
        tmp_db.create_problem(sample_problem)
        data = tmp_db.get_contribution_data()
        assert isinstance(data, dict)
        assert date.today().isoformat() in data

    def test_empty_db_returns_empty(self, tmp_db):
        assert tmp_db.get_contribution_data() == {}


class TestSettings:
    def test_set_and_get(self, tmp_db):
        tmp_db.set_setting('lang', 'python')
        assert tmp_db.get_setting('lang') == 'python'

    def test_get_default(self, tmp_db):
        assert tmp_db.get_setting('missing', 'fallback') == 'fallback'

    def test_get_all(self, tmp_db):
        tmp_db.set_setting('a', '1')
        tmp_db.set_setting('b', '2')
        all_s = tmp_db.get_all_settings()
        assert all_s == {'a': '1', 'b': '2'}

    def test_upsert(self, tmp_db):
        tmp_db.set_setting('key', 'old')
        tmp_db.set_setting('key', 'new')
        assert tmp_db.get_setting('key') == 'new'
