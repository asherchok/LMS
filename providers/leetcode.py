"""LeetCode provider — unofficial GraphQL + REST, public and session-based."""

import json

import requests

from .base import (Provider, PUBLIC_PROFILE, PUBLIC_RECENT, AUTH_BACKFILL,
                   SUBMISSION_CODE, CALENDAR)

GRAPHQL = 'https://leetcode.com/graphql'
HEADERS = {
    'Content-Type': 'application/json',
    'Referer': 'https://leetcode.com',
    'User-Agent': 'Mozilla/5.0',
}
# LeetCode difficulty level (from /api/problems/all/) → normalized label
_DIFFICULTY = {1: 'easy', 2: 'medium', 3: 'hard'}

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

_Q_BY_NUMBER = """
query($categorySlug:String,$limit:Int,$skip:Int,$filters:QuestionListFilterInput){
  problemsetQuestionList:questionList(categorySlug:$categorySlug,limit:$limit,skip:$skip,filters:$filters){
    questions:data{frontendQuestionId:questionFrontendId title titleSlug difficulty topicTags{name} content}
  }
}"""

_Q_USERSTATUS = "query { userStatus { username isSignedIn } }"

_Q_SUBLIST = """
query submissions($slug: String!, $offset: Int!, $limit: Int!) {
  submissionList(questionSlug: $slug, offset: $offset, limit: $limit) {
    hasNext
    submissions { id statusDisplay lang timestamp runtime memory }
  }
}"""

_Q_SUBDETAIL = """
query submissionDetails($id: Int!) {
  submissionDetails(submissionId: $id) {
    code lang { name } runtime memory timestamp
  }
}"""


class LeetCodeProvider(Provider):
    id = 'leetcode'
    name = 'LeetCode'
    base_url = 'https://leetcode.com'
    capabilities = {PUBLIC_PROFILE, PUBLIC_RECENT, AUTH_BACKFILL,
                    SUBMISSION_CODE, CALENDAR}
    auth_fields = [('session', 'LEETCODE_SESSION'), ('csrf', 'csrftoken')]

    # ── low-level helpers ──────────────────────────────────
    def _post(self, query, variables, headers=None):
        resp = requests.post(
            GRAPHQL,
            json={'query': query, 'variables': variables},
            headers=headers or HEADERS,
            timeout=20,
        )
        return resp.json()

    def _cookie_headers(self, creds):
        """Headers carrying the session cookie, or None if no session."""
        session = (creds or {}).get('session')
        if not session:
            return None
        csrf = (creds or {}).get('csrf')
        cookie = f'LEETCODE_SESSION={session}'
        headers = dict(HEADERS)
        if csrf:
            cookie += f'; csrftoken={csrf}'
            headers['x-csrftoken'] = csrf
        headers['Cookie'] = cookie
        return headers

    def _normalize(self, external_id, slug, title, difficulty, content, tags):
        return {
            'platform': self.id,
            'external_id': str(external_id) if external_id is not None else None,
            'slug': slug,
            'title': title,
            'difficulty': difficulty.lower() if difficulty else None,
            'description': content or '',
            'tags': tags or [],
            'url': f'{self.base_url}/problems/{slug}/' if slug else self.base_url,
        }

    # ── public ─────────────────────────────────────────────
    def fetch_problem(self, slug):
        q = (self._post(_Q_QUESTION, {'slug': slug}).get('data') or {}).get('question')
        if not q:
            return None
        return self._normalize(
            q['questionFrontendId'], slug, q['title'], q.get('difficulty'),
            q.get('content'), [t['name'] for t in q.get('topicTags', [])])

    def fetch_problem_by_number(self, number):
        data = self._post(_Q_BY_NUMBER, {
            'categorySlug': '', 'limit': 50, 'skip': 0,
            'filters': {'searchKeywords': str(number)},
        })
        questions = ((data.get('data') or {}).get('problemsetQuestionList') or {}).get('questions', [])
        for q in questions:
            if q['frontendQuestionId'] == str(number):
                return self._normalize(
                    number, q['titleSlug'], q['title'], q.get('difficulty'),
                    q.get('content'), [t['name'] for t in q.get('topicTags', [])])
        return None

    def fetch_profile(self, username):
        mu = (self._post(_Q_PROFILE, {'username': username}).get('data') or {}).get('matchedUser')
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
            'solved': counts,
            'streak': cal.get('streak'),
            'totalActiveDays': cal.get('totalActiveDays'),
            'submissionCalendar': sub_cal,
        }

    def recent_submissions(self, username, limit=20):
        data = self._post(_Q_RECENT, {'username': username, 'limit': limit})
        subs = (data.get('data') or {}).get('recentAcSubmissionList') or []
        return [{'slug': s['titleSlug'], 'title': s.get('title'),
                 'timestamp': int(s['timestamp'])} for s in subs]

    # ── auth ───────────────────────────────────────────────
    def verify_auth(self, creds):
        headers = self._cookie_headers(creds)
        if not headers:
            return None
        status = (self._post(_Q_USERSTATUS, {}, headers=headers).get('data') or {}).get('userStatus') or {}
        return status.get('username') if status.get('isSignedIn') else None

    def list_solved(self, creds):
        headers = self._cookie_headers(creds)
        if not headers:
            return None
        resp = requests.get(f'{self.base_url}/api/problems/all/', headers=headers, timeout=30)
        pairs = resp.json().get('stat_status_pairs', [])
        solved = []
        for p in pairs:
            if p.get('status') != 'ac':
                continue
            stat = p['stat']
            try:
                number = int(stat['frontend_question_id'])
            except (TypeError, ValueError):
                number = None
            solved.append(self._normalize(
                number, stat['question__title_slug'], stat['question__title'],
                _DIFFICULTY.get((p.get('difficulty') or {}).get('level')), '', []))
        return solved

    def submissions(self, creds, slug):
        headers = self._cookie_headers(creds)
        if not headers:
            return None
        data = self._post(_Q_SUBLIST, {'slug': slug, 'offset': 0, 'limit': 20}, headers=headers)
        return (data.get('data') or {}).get('submissionList') or {'hasNext': False, 'submissions': []}

    def submission_code(self, creds, submission_id):
        headers = self._cookie_headers(creds)
        if not headers:
            return None
        data = self._post(_Q_SUBDETAIL, {'id': int(submission_id)}, headers=headers)
        return (data.get('data') or {}).get('submissionDetails') or {}
