import firebase_admin
from firebase_admin import credentials, firestore

import os

CREDENTIAL_PATH = os.path.join(os.path.dirname(__file__), "work-from-home-75108-firebase-adminsdk-fbsvc-73f34e61a2.json")

def get_db():
    if not firebase_admin._apps:
        cred = credentials.Certificate(CREDENTIAL_PATH)
        firebase_admin.initialize_app(cred)
    return firestore.client()
