import unittest
from unittest.mock import Mock, patch

from backend.config import firebase
from fastapi.testclient import TestClient
from backend.main import app


class FirebaseTokenVerificationTests(unittest.TestCase):
    def test_missing_firebase_admin_rejects_token(self):
        with patch.object(firebase, "firebase_auth", None):
            self.assertIsNone(firebase.verify_firebase_token("unsigned.token.value"))

    def test_valid_token_uses_admin_verification(self):
        decoded = {"uid": "user-123"}
        auth = Mock()
        auth.verify_id_token.return_value = decoded

        with patch.object(firebase, "firebase_auth", auth):
            self.assertEqual(firebase.verify_firebase_token("signed-token"), decoded)

        auth.verify_id_token.assert_called_once_with("signed-token")

    def test_invalid_token_is_rejected(self):
        auth = Mock()
        auth.verify_id_token.side_effect = ValueError("invalid token")

        with patch.object(firebase, "firebase_auth", auth):
            self.assertIsNone(firebase.verify_firebase_token("invalid-token"))


class APIAuthenticationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_endpoint_is_available(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "healthy")

    def test_user_sync_requires_authentication(self):
        response = self.client.post("/api/v1/auth/sync")
        self.assertEqual(response.status_code, 401)

    def test_outfit_generation_requires_authentication(self):
        response = self.client.post(
            "/api/v1/outfits/suggest",
            json={"prompt": "A casual outfit"},
        )
        self.assertEqual(response.status_code, 401)

    def test_garment_analysis_requires_authentication(self):
        response = self.client.post(
            "/api/v1/garments/analyze",
            files={"image": ("garment.jpg", b"image", "image/jpeg")},
        )
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
