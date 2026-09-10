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
        with self._conn() as c:
            cur = c.execute(
                """INSERT INTO problems
                   (leetcode_number, title, description, difficulty, elo_rating,
                    source_url, tags, created_at, last_visited_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    data.get('leetcode_number'),
                    data['title'],
                    data.get('description', ''),
                    data.get('difficulty', 'medium'),
                    data.get('elo_rating'),
                    data.get('source_url'),
                    json.dumps(data.get('tags', [])),
                    now, now,
                ),
            )
            pid = cur.lastrowid
            c.execute(
                "INSERT INTO tabs (problem_id,title,content,created_at,updated_at) VALUES (?,?,?,?,?)",
                (pid, 'Approach 1', '[]', now, now),
            )
            return pid

    def get_problem(self, pid):
        with self._conn() as c:
            row = c.execute("SELECT * FROM problems WHERE id=?", (pid,)).fetchone()
            if row:
                d = dict(row)
                d['tags'] = json.loads(d['tags'])
                return d
        return None

    def update_problem(self, pid, data):
        sets, vals = [], []
        for k in ('leetcode_number', 'title', 'description', 'difficulty',
                   'elo_rating', 'source_url', 'remind_date', 'last_visited_at'):
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
            c.execute("DELETE FROM problems WHERE id=?", (pid,))

    def list_problems(self, search=None, tag=None, difficulty=None):
        q = "SELECT * FROM problems"
        conds, params = [], []
        if search:
            conds.append("(title LIKE ? OR description LIKE ? OR tags LIKE ?)")
            params += [f"%{search}%"] * 3
        if tag:
            conds.append("tags LIKE ?")
            params.append(f'%"{tag}"%')
        if difficulty:
            conds.append("difficulty=?")
            params.append(difficulty)
        if conds:
            q += " WHERE " + " AND ".join(conds)
        q += " ORDER BY created_at DESC"
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
            return [dict(r) | {'tags': json.loads(r['tags'])} for r in rows]

    # --- Tabs ---

    def get_tabs(self, pid):
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM tabs WHERE problem_id=? ORDER BY created_at ASC", (pid,)
            ).fetchall()
            return [dict(r) | {'content': json.loads(r['content'])} for r in rows]

    def create_tab(self, pid, title):
        now = datetime.now().isoformat()
        with self._conn() as c:
            cur = c.execute(
                "INSERT INTO tabs (problem_id,title,content,created_at,updated_at) VALUES (?,?,?,?,?)",
                (pid, title, '[]', now, now),
            )
            return cur.lastrowid

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

    def add_revision(self, pid):
        today = date.today().isoformat()
        now = datetime.now().isoformat()
        with self._conn() as c:
            c.execute("INSERT INTO revisions (problem_id,revised_at) VALUES (?,?)", (pid, today))
            c.execute(
                "UPDATE problems SET revision_count=revision_count+1, last_visited_at=? WHERE id=?",
                (now, pid),
            )

    def get_revisions(self, pid):
        with self._conn() as c:
            return [dict(r) for r in c.execute(
                "SELECT * FROM revisions WHERE problem_id=? ORDER BY revised_at DESC", (pid,)
            ).fetchall()]

    # --- Stats ---

    def get_difficulty_counts(self):
        with self._conn() as c:
            rows = c.execute(
                "SELECT difficulty, COUNT(*) as count FROM problems GROUP BY difficulty"
            ).fetchall()
            return {r['difficulty']: r['count'] for r in rows}

    def get_tag_counts(self):
        with self._conn() as c:
            rows = c.execute("SELECT tags FROM problems").fetchall()
            counts = {}
            for r in rows:
                for t in json.loads(r['tags']):
                    counts[t] = counts.get(t, 0) + 1
            return counts

    def get_reminders(self):
        today = date.today().isoformat()
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM problems WHERE remind_date IS NOT NULL AND remind_date<=? ORDER BY remind_date",
                (today,),
            ).fetchall()
            return [dict(r) | {'tags': json.loads(r['tags'])} for r in rows]

    def get_calendar_data(self, year, month):
        start = f"{year}-{month:02d}-01"
        end = f"{year + (1 if month == 12 else 0)}-{(month % 12) + 1:02d}-01"
        with self._conn() as c:
            created = c.execute(
                "SELECT * FROM problems WHERE created_at>=? AND created_at<?", (start, end)
            ).fetchall()
            revisions = c.execute(
                """SELECT r.revised_at, r.problem_id, p.title, p.leetcode_number, p.last_visited_at
                   FROM revisions r JOIN problems p ON r.problem_id=p.id
                   WHERE r.revised_at>=? AND r.revised_at<?""",
                (start, end),
            ).fetchall()
        days = {}
        for r in created:
            d = dict(r)
            day = d['created_at'][:10]
            days.setdefault(day, []).append({
                'id': d['id'], 'leetcode_number': d['leetcode_number'],
                'title': d['title'], 'type': 'created', 'last_visited_at': d['last_visited_at'],
            })
        for r in revisions:
            d = dict(r)
            day = d['revised_at']
            entry = {
                'id': d['problem_id'], 'leetcode_number': d['leetcode_number'],
                'title': d['title'], 'type': 'revised', 'last_visited_at': d['last_visited_at'],
            }
            if day not in days or not any(e['id'] == entry['id'] for e in days[day]):
                days.setdefault(day, []).append(entry)
        return days

    def get_contribution_data(self):
        start = (date.today() - timedelta(days=365)).isoformat()
        with self._conn() as c:
            created = c.execute(
                "SELECT DATE(created_at) as day, COUNT(*) as n FROM problems WHERE DATE(created_at)>=? GROUP BY day",
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
