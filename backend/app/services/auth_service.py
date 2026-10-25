import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from backend.app.db.connection import transaction, fetch_one, fetch_all, execute_query
from backend.app.config import Config

# In-memory session store mapping session_token -> {user_id, email, role, volunteer_profile_id, expires_at}
_ACTIVE_SESSIONS = {}

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def hash_otp(otp_str: str) -> str:
    return hashlib.sha256(otp_str.strip().encode("utf-8")).hexdigest()

def create_session(user_id: int, email: str, role: str, volunteer_profile_id: int = None) -> str:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=2)
    _ACTIVE_SESSIONS[token] = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "volunteer_profile_id": volunteer_profile_id,
        "expires_at": expires
    }
    return token

def get_session(token: str):
    if not token or token not in _ACTIVE_SESSIONS:
        return None
    session_data = _ACTIVE_SESSIONS[token]
    if datetime.now(timezone.utc) > session_data["expires_at"]:
        del _ACTIVE_SESSIONS[token]
        return None
    return session_data

def invalidate_session(token: str):
    if token in _ACTIVE_SESSIONS:
        del _ACTIVE_SESSIONS[token]

def authenticate_user(email: str, password: str):
    norm_email = email.strip().lower()
    with transaction() as conn:
        user = fetch_one(conn, "SELECT * FROM users WHERE LOWER(email) = %s", (norm_email,))
        if not user:
            return None, "Invalid email or password."
        if user["status"] != "active":
            return None, f"Account is {user['status']}. Please activate your account or contact the Convener."
        if not user["password_hash"] or not check_password_hash(user["password_hash"], password):
            return None, "Invalid email or password."

        # Fetch volunteer profile id if volunteer
        vol_prof = fetch_one(conn, "SELECT id FROM volunteer_profiles WHERE user_id = %s", (user["id"],))
        vol_id = vol_prof["id"] if vol_prof else None

        # Update last_login_at
        execute_query(conn, "UPDATE users SET last_login_at = %s WHERE id = %s", (now_iso(), user["id"]))

        token = create_session(user["id"], user["email"], user["role"], vol_id)
        return {
            "token": token,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "role": user["role"],
                "volunteer_profile_id": vol_id
            }
        }, None

def request_activation_otp(student_id: str, email: str):
    norm_sid = student_id.strip().upper()
    norm_email = email.strip().lower()
    ts = now_iso()

    with transaction() as conn:
        vol = fetch_one(conn, """
            SELECT vp.*, u.id as u_id, u.status as u_status
            FROM volunteer_profiles vp
            LEFT JOIN users u ON vp.user_id = u.id
            WHERE UPPER(vp.student_id) = %s AND LOWER(vp.email) = %s
        """, (norm_sid, norm_email))

        if not vol:
            # Generic success message to avoid user enumeration
            return True, "If the provided details match an authorized volunteer record, an activation OTP has been sent."

        # If user record doesn't exist yet, create a pending_activation user
        user_id = vol["u_id"]
        if not user_id:
            execute_query(conn, """
                INSERT INTO users (email, role, status, created_at, updated_at)
                VALUES (%s, 'volunteer', 'pending_activation', %s, %s)
            """, (vol["email"], ts, ts))
            new_u = fetch_one(conn, "SELECT id FROM users WHERE email = %s", (vol["email"],))
            user_id = new_u["id"]
            execute_query(conn, "UPDATE volunteer_profiles SET user_id = %s WHERE id = %s", (user_id, vol["id"]))

        # Generate 6-digit OTP
        raw_otp = f"{secrets.randbelow(900000) + 100000:06d}"
        hashed = hash_otp(raw_otp)
        expires = (datetime.now(timezone.utc) + timedelta(minutes=Config.OTP_EXPIRY_MINUTES)).isoformat()

        execute_query(conn, """
            INSERT INTO otp_challenges (user_id, volunteer_profile_id, purpose, otp_hash, expires_at, attempt_count, created_at)
            VALUES (%s, %s, 'activation', %s, %s, 0, %s)
        """, (user_id, vol["id"], hashed, expires, ts))

        # Explicitly documented development OTP adapter (does not log password or bypass auth)
        print(f"\n[DEV OTP ADAPTER] ========================================")
        print(f"Activation OTP for Student {vol['student_id']} ({vol['full_name']}): {raw_otp}")
        print(f"Expires at: {expires}")
        print(f"==========================================================\n")

        return True, "Activation OTP sent successfully."

def verify_activation_otp(student_id: str, email: str, otp: str):
    norm_sid = student_id.strip().upper()
    norm_email = email.strip().lower()
    input_hash = hash_otp(otp)
    ts = now_iso()

    with transaction() as conn:
        vol = fetch_one(conn, """
            SELECT vp.id as v_id, vp.user_id as u_id
            FROM volunteer_profiles vp
            WHERE UPPER(vp.student_id) = %s AND LOWER(vp.email) = %s
        """, (norm_sid, norm_email))

        if not vol:
            return False, "Invalid activation request.", None

        # Look up active challenge
        challenge = fetch_one(conn, """
            SELECT * FROM otp_challenges
            WHERE volunteer_profile_id = %s AND purpose = 'activation' AND consumed_at IS NULL
            ORDER BY id DESC LIMIT 1
        """, (vol["v_id"],))

        if not challenge:
            return False, "No active OTP found. Please request a new OTP.", None

        # Check attempt count
        if challenge["attempt_count"] >= Config.OTP_MAX_ATTEMPTS:
            return False, "Maximum OTP verification attempts exceeded. Please request a new OTP.", None

        # Check expiry
        if ts > challenge["expires_at"]:
            return False, "OTP has expired. Please request a new OTP.", None

        # Compare hashes
        if challenge["otp_hash"] != input_hash:
            execute_query(conn, "UPDATE otp_challenges SET attempt_count = attempt_count + 1 WHERE id = %s", (challenge["id"],))
            attempts_left = Config.OTP_MAX_ATTEMPTS - (challenge["attempt_count"] + 1)
            return False, f"Invalid OTP code. {attempts_left} attempts remaining.", None

        # Valid OTP! Generate an activation ticket token
        ticket = secrets.token_urlsafe(24)
        execute_query(conn, "UPDATE otp_challenges SET consumed_at = %s WHERE id = %s", (ts, challenge["id"]))
        return True, "OTP verified successfully.", ticket

def complete_activation(student_id: str, email: str, new_password: str):
    if len(new_password) < 6:
        return False, "Password must be at least 6 characters."

    norm_sid = student_id.strip().upper()
    norm_email = email.strip().lower()
    ts = now_iso()
    pwd_hash = generate_password_hash(new_password)

    with transaction() as conn:
        vol = fetch_one(conn, """
            SELECT vp.id as v_id, vp.user_id as u_id
            FROM volunteer_profiles vp
            WHERE UPPER(vp.student_id) = %s AND LOWER(vp.email) = %s
        """, (norm_sid, norm_email))

        if not vol or not vol["u_id"]:
            return False, "Volunteer account not found."

        execute_query(conn, """
            UPDATE users
            SET password_hash = %s, status = 'active', updated_at = %s
            WHERE id = %s
        """, (pwd_hash, ts, vol["u_id"]))

        # Audit log
        execute_query(conn, """
            INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, reason, created_at)
            VALUES (%s, 'VOLUNTEER_ACTIVATED', 'users', %s, 'Completed OTP activation and password setup', %s)
        """, (vol["u_id"], vol["u_id"], ts))

        return True, "Account successfully activated! You may now log in."
