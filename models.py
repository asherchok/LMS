import sqlite3
import json
import os
from datetime import datetime, date, timedelta
from contextlib import contextmanager


class Database:
    def __init__(self, db_path):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path) or '.', exist_ok=True)
        self._init_db()

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self):
        with self._conn() as c:
            c.executescript("""
                CREATE TABLE IF NOT EXISTS problems (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    leetcode_number INTEGER,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    difficulty TEXT DEFAULT 'medium',
                    elo_rating INTEGER,
                    source_url TEXT,
                    tags TEXT DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    last_visited_at TEXT,
                    remind_date TEXT,
                    revision_count INTEGER DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS tabs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    problem_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS revisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    problem_id INTEGER NOT NULL,
                    revised_at TEXT NOT NULL,
                    FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            """)
            # Migrations
            cols = [r['name'] for r in c.execute("PRAGMA table_info(problems)").fetchall()]
            if 'title_slug' not in cols:
                c.execute("ALTER TABLE problems ADD COLUMN title_slug TEXT")
            if 'imported' not in cols:
                c.execute("ALTER TABLE problems ADD COLUMN imported INTEGER DEFAULT 0")
            if 'platform' not in cols:
                c.execute("ALTER TABLE problems ADD COLUMN platform TEXT DEFAULT 'leetcode'")
            if 'external_id' not in cols:
                c.execute("ALTER TABLE problems ADD COLUMN external_id TEXT")
                c.execute(
                    "UPDATE problems SET external_id = CAST(leetcode_number AS TEXT) "
                    "WHERE external_id IS NULL AND leetcode_number IS NOT NULL"
                )
            if 'deleted_at' not in cols:
                c.execute("ALTER TABLE problems ADD COLUMN deleted_at TEXT")
            if 'remind_days' not in cols:
                c.execute("ALTER TABLE problems ADD COLUMN remind_days INTEGER")

            tab_cols = [r['name'] for r in c.execute("PRAGMA table_info(tabs)").fetchall()]
            if 'sort_order' not in tab_cols:
                c.execute("ALTER TABLE tabs ADD COLUMN sort_order INTEGER DEFAULT 0")
                c.execute("UPDATE tabs SET sort_order = id WHERE sort_order = 0")

    # --- Settings ---

    def get_setting(self, key, default=None):
        with self._conn() as c:
            row = c.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
            return row['value'] if row else default

    def set_setting(self, key, value):
        with self._conn() as c:
            c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)", (key, value))

    def get_all_settings(self):
        with self._conn() as c:
            rows = c.execute("SELECT key, value FROM settings").fetchall()
            return {r['key']: r['value'] for r in rows}

    # --- Problems ---

    def create_problem(self, data):
        now = datetime.now().isoformat()
        # created_at may be overridden (e.g. LeetCode solve timestamp on sync)
        created = data.get('created_at') or now
        platform = data.get('platform', 'leetcode')
        # external_id is the canonical per-platform id; derive it from the
        # legacy leetcode_number when a caller hasn't set it explicitly.
        external_id = data.get('external_id')
        if external_id is None and data.get('leetcode_number') is not None:
            external_id = str(data['leetcode_number'])
        with self._conn() as c:
            cur = c.execute(
                """INSERT INTO problems
                   (leetcode_number, title, description, difficulty, elo_rating,
                    source_url, tags, title_slug, imported, platform, external_id,
                    created_at, last_visited_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    data.get('leetcode_number'),
                    data['title'],
                    data.get('description', ''),
                    data.get('difficulty', 'medium'),
                    data.get('elo_rating'),
                    data.get('source_url'),
                    json.dumps(data.get('tags', [])),
                    data.get('title_slug'),
                    1 if data.get('imported') else 0,
                    platform,
                    external_id,
                    created, now,
                ),
            )
            pid = cur.lastrowid
            c.execute(
                "INSERT INTO tabs (problem_id,title,content,created_at,updated_at) VALUES (?,?,?,?,?)",
                (pid, 'Approach 1', '[]', now, now),
            )
            return pid

    def get_problem(self, pid, include_deleted=False):
        with self._conn() as c:
            row = c.execute("SELECT * FROM problems WHERE id=?", (pid,)).fetchone()
            if row:
                d = dict(row)
                d['tags'] = json.loads(d['tags'])
                if d.get('deleted_at') and not include_deleted:
                    return None
                return d
        return None

    def _row_to_problem(self, row):
        if not row:
            return None
        d = dict(row)
        d['tags'] = json.loads(d['tags'])
        return d

    def get_problem_by_slug(self, slug, platform=None):
        if not slug:
            return None
        q = "SELECT * FROM problems WHERE title_slug=?"
        params = [slug]
        if platform is not None:
            q += " AND platform=?"
            params.append(platform)
        with self._conn() as c:
            return self._row_to_problem(c.execute(q, params).fetchone())

    def get_problem_by_external(self, platform, external_id):
        """Canonical multi-platform lookup by (platform, external_id)."""
        if external_id is None:
            return None
        with self._conn() as c:
            return self._row_to_problem(c.execute(
                "SELECT * FROM problems WHERE platform=? AND external_id=?",
                (platform, str(external_id)),
            ).fetchone())

    def get_problem_by_number(self, number):
        """Legacy LeetCode-only lookup; prefer get_problem_by_external."""
        if number is None:
            return None
        with self._conn() as c:
            return self._row_to_problem(c.execute(
                "SELECT * FROM problems WHERE leetcode_number=?", (number,)
            ).fetchone())

    def update_problem(self, pid, data):
        sets, vals = [], []
        for k in ('leetcode_number', 'title', 'description', 'difficulty',
                   'elo_rating', 'source_url', 'remind_date', 'last_visited_at',
                   'title_slug', 'imported', 'created_at', 'platform', 'external_id',
                   'deleted_at', 'remind_days'):
            if k in data:
                sets.append(f"{k}=?")
                vals.append(data[k])
        if 'tags' in data:
            sets.append("tags=?")
            vals.append(json.dumps(data['tags']))
        if not sets:
            return
        vals.append(pid)
        with self._conn() as c:
            c.execute(f"UPDATE problems SET {','.join(sets)} WHERE id=?", vals)

    def delete_problem(self, pid):
        with self._conn() as c:
            c.execute("UPDATE problems SET deleted_at=? WHERE id=?",
                      (datetime.now().isoformat(), pid))

    def permanently_delete_problem(self, pid):
        with self._conn() as c:
            c.execute("DELETE FROM problems WHERE id=?", (pid,))

    def restore_problem(self, pid):
        with self._conn() as c:
            c.execute("UPDATE problems SET deleted_at=NULL WHERE id=?", (pid,))

    def list_deleted_problems(self):
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM problems WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
            ).fetchall()
            return [dict(r) | {'tags': json.loads(r['tags'])} for r in rows]

    def auto_cleanup_deleted(self, days=7):
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        with self._conn() as c:
            c.execute("DELETE FROM problems WHERE deleted_at IS NOT NULL AND deleted_at<?",
                      (cutoff,))

    def list_problems(self, search=None, tag=None, difficulty=None):
        q = "SELECT * FROM problems"
        conds, params = ["deleted_at IS NULL"], []
        if search:
            conds.append("(title LIKE ? OR description LIKE ? OR tags LIKE ?)")
            params += [f"%{search}%"] * 3
        if tag:
            conds.append("tags LIKE ?")
            params.append(f'%"{tag}"%')
        if difficulty:
            conds.append("difficulty=?")
            params.append(difficulty)
        q += " WHERE " + " AND ".join(conds)
        q += " ORDER BY created_at DESC"
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
            return [dict(r) | {'tags': json.loads(r['tags'])} for r in rows]

    # --- Tabs ---

    def get_tabs(self, pid):
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM tabs WHERE problem_id=? ORDER BY sort_order ASC, created_at ASC",
                (pid,),
            ).fetchall()
            return [dict(r) | {'content': json.loads(r['content'])} for r in rows]

    def create_tab(self, pid, title):
        now = datetime.now().isoformat()
        with self._conn() as c:
            max_order = c.execute(
                "SELECT COALESCE(MAX(sort_order),0) FROM tabs WHERE problem_id=?", (pid,)
            ).fetchone()[0]
            cur = c.execute(
                "INSERT INTO tabs (problem_id,title,content,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?)",
                (pid, title, '[]', max_order + 1, now, now),
            )
            return cur.lastrowid

    def reorder_tabs(self, tab_ids):
        with self._conn() as c:
            for i, tid in enumerate(tab_ids):
                c.execute("UPDATE tabs SET sort_order=? WHERE id=?", (i, tid))

    def update_tab(self, tid, data):
        now = datetime.now().isoformat()
        sets, vals = ["updated_at=?"], [now]
        if 'title' in data:
            sets.append("title=?")
            vals.append(data['title'])
        if 'content' in data:
            sets.append("content=?")
            vals.append(json.dumps(data['content']))
        vals.append(tid)
        with self._conn() as c:
            c.execute(f"UPDATE tabs SET {','.join(sets)} WHERE id=?", vals)

    def delete_tab(self, tid):
        with self._conn() as c:
            c.execute("DELETE FROM tabs WHERE id=?", (tid,))

    # --- Revisions ---

    def add_revision(self, pid, revised_at=None, remind_days=None):
        day = revised_at or date.today().isoformat()
        now = datetime.now().isoformat()
        with self._conn() as c:
            c.execute("INSERT INTO revisions (problem_id,revised_at) VALUES (?,?)", (pid, day))
            updates = {'revision_count': None, 'last_visited_at': now}
            c.execute(
                "UPDATE problems SET revision_count=revision_count+1, last_visited_at=? WHERE id=?",
                (now, pid),
            )
            if remind_days is not None:
                c.execute("UPDATE problems SET remind_days=? WHERE id=?", (remind_days, pid))

    def get_revisions(self, pid):
        with self._conn() as c:
            return [dict(r) for r in c.execute(
                "SELECT * FROM revisions WHERE problem_id=? ORDER BY revised_at DESC", (pid,)
            ).fetchall()]

    # --- Stats ---

    def get_difficulty_counts(self):
        with self._conn() as c:
            rows = c.execute(
                "SELECT difficulty, COUNT(*) as count FROM problems WHERE deleted_at IS NULL GROUP BY difficulty"
            ).fetchall()
            return {r['difficulty']: r['count'] for r in rows}

    def get_tag_counts(self):
        with self._conn() as c:
            rows = c.execute("SELECT tags FROM problems WHERE deleted_at IS NULL").fetchall()
            counts = {}
            for r in rows:
                for t in json.loads(r['tags']):
                    counts[t] = counts.get(t, 0) + 1
            return counts

    def get_reminders(self, dfr_days=None):
        today = date.today().isoformat()
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM problems WHERE deleted_at IS NULL AND remind_date IS NOT NULL AND remind_date<=? ORDER BY remind_date",
                (today,),
            ).fetchall()
            return [dict(r) | {'tags': json.loads(r['tags'])} for r in rows]

    def get_upcoming_reminders(self, days=7):
        today = date.today()
        future = (today + timedelta(days=days)).isoformat()
        today_str = today.isoformat()
        with self._conn() as c:
            rows = c.execute(
                """SELECT * FROM problems
                   WHERE deleted_at IS NULL AND remind_date IS NOT NULL
                   AND remind_date>? AND remind_date<=?
                   ORDER BY remind_date""",
                (today_str, future),
            ).fetchall()
            return [dict(r) | {'tags': json.loads(r['tags'])} for r in rows]

    def get_calendar_data(self, year, month):
        start = f"{year}-{month:02d}-01"
        end = f"{year + (1 if month == 12 else 0)}-{(month % 12) + 1:02d}-01"
        with self._conn() as c:
            created = c.execute(
                """SELECT * FROM problems
                   WHERE deleted_at IS NULL
                   AND created_at>=? AND created_at<?
                   AND (imported IS NULL OR imported=0)""",
                (start, end),
            ).fetchall()
            revisions = c.execute(
                """SELECT r.revised_at, r.problem_id, p.title, p.leetcode_number,
                          p.last_visited_at, p.difficulty, p.revision_count
                   FROM revisions r JOIN problems p ON r.problem_id=p.id
                   WHERE p.deleted_at IS NULL AND r.revised_at>=? AND r.revised_at<?""",
                (start, end),
            ).fetchall()
        days = {}
        for r in created:
            d = dict(r)
            day = d['created_at'][:10]
            days.setdefault(day, []).append({
                'id': d['id'], 'leetcode_number': d['leetcode_number'],
                'title': d['title'], 'type': 'created',
                'difficulty': d['difficulty'],
                'last_visited_at': d['last_visited_at'],
            })
        for r in revisions:
            d = dict(r)
            day = d['revised_at']
            is_first_revision = (d.get('revision_count', 0) == 1)
            entry = {
                'id': d['problem_id'], 'leetcode_number': d['leetcode_number'],
                'title': d['title'], 'type': 'revised',
                'difficulty': d.get('difficulty', 'medium'),
                'first_revision': is_first_revision,
                'last_visited_at': d['last_visited_at'],
            }
            if day not in days or not any(e['id'] == entry['id'] for e in days[day]):
                days.setdefault(day, []).append(entry)

        with self._conn() as c:
            upcoming = c.execute(
                """SELECT id, leetcode_number, title, difficulty, remind_date,
                          last_visited_at
                   FROM problems
                   WHERE deleted_at IS NULL AND remind_date IS NOT NULL
                   AND remind_date>=? AND remind_date<?""",
                (start, end),
            ).fetchall()
        today_str = date.today().isoformat()
        for r in upcoming:
            d = dict(r)
            day = d['remind_date']
            if day <= today_str:
                continue
            if day in days and any(e['id'] == d['id'] for e in days[day]):
                continue
            days.setdefault(day, []).append({
                'id': d['id'], 'leetcode_number': d['leetcode_number'],
                'title': d['title'], 'type': 'upcoming',
                'difficulty': d['difficulty'],
                'last_visited_at': d['last_visited_at'],
            })
        return days

    def get_contribution_data(self):
        start = (date.today() - timedelta(days=365)).isoformat()
        with self._conn() as c:
            created = c.execute(
                """SELECT DATE(created_at) as day, COUNT(*) as n FROM problems
                   WHERE DATE(created_at)>=? AND (imported IS NULL OR imported=0)
                   GROUP BY day""",
                (start,),
            ).fetchall()
            revised = c.execute(
                "SELECT revised_at as day, COUNT(*) as n FROM revisions WHERE revised_at>=? GROUP BY day",
                (start,),
            ).fetchall()
        activity = {}
        for r in created:
            activity[r['day']] = activity.get(r['day'], 0) + r['n']
        for r in revised:
            activity[r['day']] = activity.get(r['day'], 0) + r['n']
        return activity

    def update_last_visited(self, pid):
        with self._conn() as c:
            c.execute("UPDATE problems SET last_visited_at=? WHERE id=?",
                      (datetime.now().isoformat(), pid))
