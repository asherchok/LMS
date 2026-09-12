"""Provider registry.

Register a platform here and the generic routes/UI pick it up. Adding CSES,
Codeforces, etc. is a matter of implementing base.Provider and adding it below.
"""

from .base import (Provider, PUBLIC_PROFILE, PUBLIC_RECENT, AUTH_BACKFILL,
                   SUBMISSION_CODE, CALENDAR)
from .leetcode import LeetCodeProvider

PROVIDERS = {p.id: p for p in (
    LeetCodeProvider(),
)}


def get_provider(provider_id):
    return PROVIDERS.get(provider_id)


def sensitive_setting_keys():
    """Union of every provider's credential setting keys."""
    keys = set()
    for p in PROVIDERS.values():
        keys |= p.sensitive_setting_keys()
    return keys


__all__ = ['Provider', 'PROVIDERS', 'get_provider', 'sensitive_setting_keys',
           'PUBLIC_PROFILE', 'PUBLIC_RECENT', 'AUTH_BACKFILL',
           'SUBMISSION_CODE', 'CALENDAR']
