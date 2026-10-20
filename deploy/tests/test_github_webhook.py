import hashlib
import hmac
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("github_webhook", Path(__file__).resolve().parents[1] / "github_webhook.py")
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)


class WebhookValidationTests(unittest.TestCase):
    secret = "unit-test-only-secret-with-at-least-32-characters"

    def request(self, event="push", **changes):
        data = {"repository": {"full_name": "franz-9527/grow"}, "ref": "refs/heads/main", "deleted": False}
        data.update(changes)
        body = json.dumps(data).encode()
        signature = "sha256=" + hmac.new(self.secret.encode(), body, hashlib.sha256).hexdigest()
        return receiver.validate(body, signature, event, self.secret, "franz-9527/grow")

    def test_main_push(self):
        self.assertEqual(self.request(), "deploy")

    def test_ignores_branches_deletion_and_other_events(self):
        self.assertEqual(self.request(ref="refs/heads/feature"), "ignore")
        self.assertEqual(self.request(deleted=True), "ignore")
        self.assertEqual(self.request(event="issues"), "ignore")

    def test_rejects_other_repository(self):
        with self.assertRaises(ValueError):
            self.request(repository={"full_name": "other/grow"})

    def test_ping(self):
        self.assertEqual(self.request(event="ping"), "ping")

    def test_rejects_missing_wrong_and_tampered_signatures(self):
        body = b'{"repository":{"full_name":"franz-9527/grow"}}'
        for signature in ("", "sha256=wrong", "sha256=" + "0" * 64):
            with self.assertRaises(ValueError):
                receiver.validate(body, signature, "push", self.secret, "franz-9527/grow")
        signature = "sha256=" + hmac.new(self.secret.encode(), body, hashlib.sha256).hexdigest()
        with self.assertRaises(ValueError):
            receiver.validate(body + b" ", signature, "push", self.secret, "franz-9527/grow")


if __name__ == "__main__":
    unittest.main()
