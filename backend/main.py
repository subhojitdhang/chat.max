import os
import json
import sqlite3
import random
import shutil
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "chat_app.db"
UPLOAD_DIR = "frontend/uploads"

# Temporary live cache to track valid login OTPs (Email -> Code)
otp_store: Dict[str, str] = {}

if os.path.exists(UPLOAD_DIR):
    shutil.rmtree(UPLOAD_DIR)
os.makedirs(UPLOAD_DIR, exist_ok=True)

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            max_uses INTEGER NOT NULL,
            uses_left INTEGER NOT NULL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_uid TEXT NOT NULL,
            friend_uid TEXT NOT NULL,
            UNIQUE(user_uid, friend_uid)
        )
    """)
    
    # Seed the specific custom Admin Email
    cursor.execute("SELECT * FROM users WHERE email='subhojitgaming6842@gmail.com'")
    if not cursor.fetchone():
        cursor.execute("INSERT INTO users (uid, email, username, display_name, is_admin) VALUES ('88888888', 'subhojitgaming6842@gmail.com', 'admin', 'Subho Admin', 1)")
        
    cursor.execute("SELECT * FROM invites WHERE code='ALPHA2026'")
    if not cursor.fetchone():
        cursor.execute("INSERT INTO invites (code, max_uses, uses_left) VALUES ('ALPHA2026', 10, 10)")
        
    conn.commit()
    conn.close()

init_db()

def generate_unique_uid():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    while True:
        uid = str(random.randint(10000000, 99999999))
        cursor.execute("SELECT id FROM users WHERE uid = ?", (uid,))
        if not cursor.fetchone():
            conn.close()
            return uid

class SignupRequest(BaseModel):
    email: str
    username: str
    display_name: str
    invite_code: str

class OtpRequest(BaseModel):
    email: str

class VerifyRequest(BaseModel):
    email: str
    otp_code: str

class FriendRequest(BaseModel):
    user_uid: str
    search_key: str

class InviteRequest(BaseModel):
    admin_email: str
    code: str
    uses: int

# --- API ENDPOINTS ---

@app.post("/api/signup")
def signup(data: SignupRequest):
    username = data.username.strip()
    email = data.email.strip().lower()
    
    if " " in username:
        raise HTTPException(status_code=400, detail="Spaces are not allowed in usernames!")
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="This username is already taken!")
        
    cursor.execute("SELECT uses_left FROM invites WHERE code = ?", (data.invite_code.strip(),))
    invite = cursor.fetchone()
    if not invite or invite[0] <= 0:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid or expired invite code!")
        
    try:
        user_uid = generate_unique_uid()
        cursor.execute("INSERT INTO users (uid, email, username, display_name, is_admin) VALUES (?, ?, ?, ?, 0)", 
                       (user_uid, email, username, data.display_name.strip()))
        cursor.execute("UPDATE invites SET uses_left = uses_left - 1 WHERE code = ?", (data.invite_code.strip(),))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Email is already registered!")
        
    conn.close()
    return {"message": "Account created successfully!"}

# Step 1 of Login: Check email and generate OTP
@app.post("/api/login/request-otp")
def request_otp(data: OtpRequest):
    email = data.email.strip().lower()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email.")
    
    # Generate 6-digit verification pin
    otp = str(random.randint(100000, 999999))
    otp_store[email] = otp
    
    # Prints directly to your terminal console for easy testing copy-paste
    print("\n" + "="*40)
    print(f" SECURITY VERIFICATION CODE FOR {email}: {otp} ")
    print("="*40 + "\n")
    
    return {"message": "Verification code generated! Please inspect your terminal console."}

# Step 2 of Login: Validate OTP code and authenticate session
@app.post("/api/login/verify-otp")
def verify_otp(data: VerifyRequest):
    email = data.email.strip().lower()
    provided_code = data.otp_code.strip()
    
    if email not in otp_store or otp_store[email] != provided_code:
        raise HTTPException(status_code=400, detail="Invalid or expired verification pin.")
        
    # Clear OTP after use
    otp_store.pop(email, None)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT uid, email, username, display_name, is_admin FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    conn.close()
    
    return {
        "user": {
            "uid": user[0],
            "email": user[1],
            "username": user[2],
            "display_name": user[3],
            "is_admin": int(user[4])
        }
    }

@app.post("/api/friends/add")
def add_friend(data: FriendRequest):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT uid, display_name FROM users WHERE uid = ? OR username = ?", (data.search_key, data.search_key))
    friend = cursor.fetchone()
    
    if not friend:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found.")
        
    friend_uid, friend_name = friend
    if friend_uid == data.user_uid:
        conn.close()
        raise HTTPException(status_code=400, detail="You cannot add yourself!")
        
    try:
        cursor.execute("INSERT INTO friends (user_uid, friend_uid) VALUES (?, ?)", (data.user_uid, friend_uid))
        cursor.execute("INSERT INTO friends (user_uid, friend_uid) VALUES (?, ?)", (friend_uid, data.user_uid))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return {"message": f"{friend_name} is already your friend!"}
        
    conn.close()
    return {"message": f"Successfully added {friend_name}!"}

@app.get("/api/friends/{user_uid}")
def get_friends(user_uid: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT users.uid, users.display_name 
        FROM friends 
        JOIN users ON friends.friend_uid = users.uid 
        WHERE friends.user_uid = ?
    """, (user_uid,))
    rows = cursor.fetchall()
    conn.close()
    return [{"uid": r[0], "display_name": r[1]} for r in rows]

@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...)):
    # Extract extension securely
    ext = file.filename.split(".")[-1] if "." in file.filename else "png"
    file_id = f"{int(time.time())}_{random.randint(1000, 9999)}.{ext}"
    
    # Ensure folder path layout matches mounting rules
    file_path = os.path.join(UPLOAD_DIR, file_id)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Return the exact path mounted under static middleware
    return {"url": f"/static/uploads/{file_id}"}

@app.get("/api/admin/users")
def admin_get_users(email: str = Query(...)):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT is_admin FROM users WHERE email = ?", (email.strip().lower(),))
    user = cursor.fetchone()
    if not user or user[0] != 1:
        conn.close()
        raise HTTPException(status_code=403, detail="Access Denied.")
        
    cursor.execute("SELECT display_name, username, email, uid FROM users")
    users = cursor.fetchall()
    conn.close()
    return [{"display_name": u[0], "username": u[1], "email": u[2], "uid": u[3]} for u in users]

@app.post("/api/admin/invite")
def admin_create_invite(data: InviteRequest):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT is_admin FROM users WHERE email = ?", (data.admin_email.strip().lower(),))
    user = cursor.fetchone()
    if not user or user[0] != 1:
        conn.close()
        raise HTTPException(status_code=403, detail="Access Denied.")
        
    try:
        cursor.execute("INSERT INTO invites (code, max_uses, uses_left) VALUES (?, ?, ?)", (data.code.upper().strip(), data.uses, data.uses))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Code already exists.")
        
    conn.close()
    return {"message": f"Successfully created code: {data.code.upper()}"}

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, uid: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[uid] = websocket

    def disconnect(self, uid: str):
        if uid in self.active_connections:
            del self.active_connections[uid]

    async def broadcast_global(self, message: str):
        for connection in list(self.active_connections.values()):
            try:
                await connection.send_text(message)
            except Exception:
                pass

    async def send_private(self, sender_uid: str, recipient_uid: str, message: str):
        if recipient_uid in self.active_connections:
            try:
                await self.active_connections[recipient_uid].send_text(message)
            except Exception:
                pass
        if sender_uid in self.active_connections:
            try:
                await self.active_connections[sender_uid].send_text(message)
            except Exception:
                pass

manager = ConnectionManager()

@app.websocket("/ws/chat/{user_uid}")
async def websocket_endpoint(websocket: WebSocket, user_uid: str):
    await manager.connect(user_uid, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            parsed_msg = json.loads(data)
            
            if parsed_msg.get("type") == "ping":
                continue
            
            sender_name = parsed_msg.get('sender_name')
            text = parsed_msg.get('text')
            recipient_uid = parsed_msg.get('recipient_uid')
            image_url = parsed_msg.get('image_url')
            
            outbound_data = json.dumps({
                "sender": sender_name,
                "text": text,
                "sender_uid": user_uid,
                "recipient_uid": recipient_uid,
                "image_url": image_url
            })
            
            if recipient_uid:
                await manager.send_private(user_uid, recipient_uid, outbound_data)
            else:
                await manager.broadcast_global(outbound_data)
                
    except WebSocketDisconnect:
        manager.disconnect(user_uid)

if os.path.exists("frontend"):
    app.mount("/static", StaticFiles(directory="frontend"), name="static")
    app.mount("/js", StaticFiles(directory="frontend/js"), name="js")

# TO THIS:
@app.get("/")
@app.get("/index.html")
def read_index():
    return FileResponse("frontend/index.html")

# FIND AND UPDATE THE LOGIN ROUTE TO THIS:
@app.get("/login")
@app.get("/login.html")
def read_login():
    return FileResponse("frontend/login.html")

# UPDATE THIS SECTION:
@app.get("/signup")
@app.get("/signup.html")
def read_signup():
    return FileResponse("frontend/signup.html")

@app.get("/admin")
@app.get("/admin.html")
def read_admin():
    return FileResponse("frontend/admin.html")