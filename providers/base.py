"""Platform-provider interface.

A Provider encapsulates everything platform-specific for one site (LeetCode,
CSES, …): HTTP, query/scrape details, auth, and normalization into the common
shapes below. It holds NO database or Flask state — routes pass credentials in
and get normalized dicts back, so the same orchestration (sync, dedup, enrich)
works for every platform.

Normalized problem shape returned by fetch_* / list_solved:
    {
        "platform":    "leetcode",
        "external_id": "1",          # the platform's stable problem id (str|None)
        "slug":        "two-sum",    # url slug, or None if the platform has none
        "title":       "Two Sum",
        "difficulty":  "easy"|None,  # normalized to easy/medium/hard, or None
        "description": "<html>",     # may be "" when not fetched
        "tags":        [...],
        "url":         "https://…",
    }

Normalized profile shape returned by fetch_profile:
    {
        "username", "realName", "ranking",
        "solved": {"all", "easy", "medium", "hard"},
        "streak", "totalActiveDays",
        "submissionCalendar": {unix_day: count},
    }
"""

# ── Capability flags ────────────────────────────────────────
# A provider declares only what it can actually do; routes/UI check these
# rather than assuming every platform behaves like LeetCode.
PUBLIC_PROFILE = 'public_profile'      # stats by username, no login
PUBLIC_RECENT = 'public_recent'        # recent accepted submissions by username
AUTH_BACKFILL = 'auth_backfill'        # full solved list with a session
SUBMISSION_CODE = 'submission_code'    # fetch a submission's code
CALENDAR = 'calendar'                  # activity/submission calendar


class Provider:
    id = ''                 # stable key, e.g. "leetcode"
    name = ''               # display name
    base_url = ''
    capabilities = set()
    # (settings-key suffix, human label shown in the login form), e.g.
    # [("session", "LEETCODE_SESSION"), ("csrf", "csrftoken")]
    auth_fields = []

    def has(self, capability):
        return capability in self.capabilities

    def sensitive_setting_keys(self):
        """Settings keys holding this provider's credentials (never exposed)."""
        return {f'{self.id}_{key}' for key, _label in self.auth_fields}

    # ── Platform I/O — override the ones your capabilities declare ──
    def fetch_problem(self, slug):
        """Normalized problem by slug, or None."""
        raise NotImplementedError

    def fetch_problem_by_number(self, number):
        """Normalized problem by the platform's numeric id, or None."""
        raise NotImplementedError

    def fetch_profile(self, username):
        """Normalized public profile, or None if the user doesn't exist."""
        raise NotImplementedError

    def recent_submissions(self, username, limit=20):
        """Recent accepted submissions: [{slug, title, timestamp:int}]."""
        raise NotImplementedError

    def verify_auth(self, creds):
        """Return the logged-in username if creds are valid, else None."""
        raise NotImplementedError

    def list_solved(self, creds):
        """All solved problems as normalized stubs, or None if unauthorized."""
        raise NotImplementedError

    def submissions(self, creds, slug):
        """The user's submissions for one problem, or None if unauthorized."""
        raise NotImplementedError

    def submission_code(self, creds, submission_id):
        """A single submission's code/details, or None if unauthorized."""
        raise NotImplementedError
