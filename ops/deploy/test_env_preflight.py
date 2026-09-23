import io
import unittest

from env_preflight import REQUIRED, compare, report

# Variable NAMES of the live MAIN container on 2026-09-23 (values are fake).
MAIN_NAMES = """ANDROID_APP_PACKAGE_NAME ANDROID_APP_SHA_256_FINGERPRINT ANTHROPIC_API_KEY APPLE_BUNDLE_ID
APPLE_IPD_ID APPLE_KEY_ID APPLE_PRIVATE_KEY_BASE64 APPLE_TEAM_ID BUN_INSTALL_BIN
BUN_RUNTIME_TRANSPILER_CACHE_PATH FACEBOOK_APP_SECRET FOUNDER_WELCOME_ENABLED GOOGLE_CLIENT_SECRET
ICAL_FEED_ALLOWLIST ICAL_FEED_ENABLED ICAL_FEED_SECRET MARKETPLACE_ID ONBOARD_NUDGE_ENABLED OTP_TIME_STEP
PATH PAYOUT_SMS_ENABLED PORT RABBITMQ_MARKETPLACE_SUBSCRIBER_HOST RABBITMQ_MARKETPLACE_SUBSCRIBER_PASSWORD
RABBITMQ_MARKETPLACE_SUBSCRIBER_USERNAME REPLY_TO_ACCEPT_ENABLED SHARETRIBE_INTEGRATION_SDK_CLIENT_ID
SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET SHARETRIBE_SDK_CLIENT_SECRET SMS_ALARM_PHONE
SMS_NOTIFICATIONS_ENABLED SMS_POLL_INTERVAL_MS STRIPE_SECRET_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_URL
SWIMPLY_RESYNC_ENABLED TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_MESSAGING_SERVICE_SID TWILIO_PHONE_NUMBER
VITE_APPLE_CLIENT_ID VITE_CSP VITE_ENV VITE_FACEBOOK_APP_ID VITE_GOOGLE_CLIENT_ID VITE_GOOGLE_MAPS_API_KEY
VITE_HERO_BACKGROUND_VIDEO_URL VITE_INTERCOM_APP_ID VITE_JH_WISHLIST_FEATURE_ENABLE_BOOKMARK_OWN_LISTING
VITE_JH_WISHLIST_FEATURE_ENABLE_USER_NAV_ITEM VITE_LEGACY_BROWSER_SUPPORT VITE_MARKETPLACE_NAME
VITE_MARKETPLACE_ROOT_URL VITE_OTP_WINDOW VITE_SHARETRIBE_SDK_CLIENT_ID VITE_SHARETRIBE_USING_SSL
VITE_STRIPE_PUBLISHABLE_KEY""".split()
# Names build/.env lacked on 2026-09-23 (the c197 hazard, still present).
BUILD_ENV_LACKS = """ANTHROPIC_API_KEY BUN_INSTALL_BIN BUN_RUNTIME_TRANSPILER_CACHE_PATH FOUNDER_WELCOME_ENABLED
ICAL_FEED_ALLOWLIST ICAL_FEED_ENABLED ICAL_FEED_SECRET ONBOARD_NUDGE_ENABLED PATH PAYOUT_SMS_ENABLED
REPLY_TO_ACCEPT_ENABLED SMS_ALARM_PHONE SMS_NOTIFICATIONS_ENABLED SMS_POLL_INTERVAL_MS STRIPE_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY SUPABASE_URL SWIMPLY_RESYNC_ENABLED TWILIO_MESSAGING_SERVICE_SID
VITE_SHARETRIBE_USING_SSL""".split()

MAIN = {n: f"value-of-{n}" for n in MAIN_NAMES}


def without(env, *names):
    return {k: v for k, v in env.items() if k not in names}


class EnvPreflightTest(unittest.TestCase):
    def test_every_required_name_exists_in_live_main(self):
        self.assertEqual([n for n in REQUIRED if n not in MAIN], [])

    def test_complete_env_passes(self):
        r = compare(MAIN, dict(MAIN))
        self.assertTrue(r["ok"], r)

    def test_one_missing_required_variable_fails(self):
        r = compare(MAIN, without(MAIN, "STRIPE_SECRET_KEY"))
        self.assertFalse(r["ok"])
        self.assertEqual(r["missing"], ["STRIPE_SECRET_KEY"])
        self.assertEqual(r["required_missing_in_candidate"], ["STRIPE_SECRET_KEY"])

    def test_one_missing_non_required_flag_still_fails_on_parity(self):
        r = compare(MAIN, without(MAIN, "SWIMPLY_RESYNC_ENABLED"))
        self.assertFalse(r["ok"])
        self.assertEqual(r["missing"], ["SWIMPLY_RESYNC_ENABLED"])

    def test_multiple_missing_variables_fail_and_are_all_named(self):
        gone = ("SUPABASE_URL", "TWILIO_AUTH_TOKEN", "VITE_SHARETRIBE_USING_SSL", "ICAL_FEED_ENABLED")
        r = compare(MAIN, without(MAIN, *gone))
        self.assertFalse(r["ok"])
        self.assertEqual(r["missing"], sorted(gone))

    def test_extra_harmless_variables_pass_and_are_listed(self):
        cand = dict(MAIN, DEBUG_BANNER="0", NEW_FEATURE_FLAG="false")
        r = compare(MAIN, cand)
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["extra"], ["DEBUG_BANNER", "NEW_FEATURE_FLAG"])

    def test_empty_value_counts_as_missing(self):
        r = compare(MAIN, dict(MAIN, STRIPE_SECRET_KEY=""))
        self.assertFalse(r["ok"])
        self.assertEqual(r["empty"], ["STRIPE_SECRET_KEY"])

    def test_candidate_from_build_env_alone_fails(self):
        r = compare(MAIN, without(MAIN, *BUILD_ENV_LACKS))
        self.assertFalse(r["ok"])
        self.assertIn("STRIPE_SECRET_KEY", r["missing"])
        self.assertIn("VITE_SHARETRIBE_USING_SSL", r["missing"])
        self.assertEqual(len(r["missing"]), 17)  # the 20 minus PATH and the two BUN_* image names

    def test_image_provided_names_are_not_required(self):
        r = compare(MAIN, without(MAIN, "PATH", "BUN_INSTALL_BIN", "BUN_RUNTIME_TRANSPILER_CACHE_PATH"))
        self.assertTrue(r["ok"], r)

    def test_main_missing_a_required_name_fails_closed(self):
        broken_main = without(MAIN, "STRIPE_SECRET_KEY")
        r = compare(broken_main, dict(broken_main))
        self.assertFalse(r["ok"])
        self.assertEqual(r["required_missing_in_main"], ["STRIPE_SECRET_KEY"])

    def test_report_prints_names_never_values(self):
        buf = io.StringIO()
        report(compare(MAIN, without(MAIN, "STRIPE_SECRET_KEY")), out=buf)
        text = buf.getvalue()
        self.assertIn("STRIPE_SECRET_KEY", text)
        self.assertNotIn("value-of-", text)


if __name__ == "__main__":
    unittest.main()
