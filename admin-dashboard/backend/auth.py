# auth.py - Authentication and Authorization
import jwt
import datetime
from typing import Optional, Dict
from fastapi import HTTPException, status
from pydantic import BaseModel

# Secret key for JWT tokens (in production, use environment variable)
SECRET_KEY = "aerosentry_secret_key_2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# User database (in production, use real database)
users_db = {
    "pilot1": {
        "username": "pilot1",
        "password": "pilot123",  # In production, use hashed passwords
        "role": "pilot",
        "full_name": "John Pilot",
        "license_number": "PPL-12345"
    },
    "pilot2": {
        "username": "pilot2", 
        "password": "pilot123",
        "role": "pilot",
        "full_name": "Jane Aviator",
        "license_number": "CPL-67890"
    },
    "admin": {
        "username": "admin",
        "password": "admin123",
        "role": "admin",
        "full_name": "System Administrator",
        "permissions": ["view_analytics", "manage_users", "generate_reports"]
    }
}

class User(BaseModel):
    username: str
    password: str
    role: str
    full_name: str

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_data: dict

class LoginRequest(BaseModel):
    username: str
    password: str

def authenticate_user(username: str, password: str) -> Optional[User]:
    user = users_db.get(username)
    if user and user["password"] == password:  # In production, use proper password hashing
        return User(
            username=user["username"],
            password=user["password"],
            role=user["role"],
            full_name=user["full_name"]
        )
    return None

def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

def get_user_role(token: str) -> str:
    payload = verify_token(token)
    return payload.get("role", "pilot")