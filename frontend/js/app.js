document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" ? "http://127.0.0.1:8000" : window.location.origin;
    const WS_BASE = window.location.protocol === "https:" ? `wss://${window.location.host}` : `ws://${window.location.hostname}:8000`;

    // Extract Session Credentials
    const userUid = sessionStorage.getItem("user_uid");
    const username = sessionStorage.getItem("user_name");
    const displayProfileName = sessionStorage.getItem("user_display");
    const isAdmin = sessionStorage.getItem("is_admin");
    const isGuest = sessionStorage.getItem("is_guest");

    // Guard Gate Validation
    if (!userUid || !username) {
        window.location.href = "/login";
        return;
    }

    // UI Panel Bindings (Safely check if elements exist)
    if (document.getElementById("lblDisplayName")) {
        document.getElementById("lblDisplayName").innerText = displayProfileName || username;
    }
    if (document.getElementById("lblSubHeader")) {
        document.getElementById("lblSubHeader").innerText = `ID: ${userUid}`;
    }

    const friendActionPanel = document.getElementById("friendActionPanel");
    const lblFriendTitle = document.getElementById("lblFriendTitle");
    const friendContainer = document.getElementById("friendContainer");
    const lnkAdminPanel = document.getElementById("lnkAdminPanel");
    const chatScrollArea = document.getElementById("chatScrollArea");
    const lblChatHeader = document.getElementById("lblChatHeader");

    // Form inputs
    const txtFriendSearch = document.getElementById("txtFriendSearch");
    const btnAddFriend = document.getElementById("btnAddFriend");
    const btnGlobalRoom = document.getElementById("btnGlobalRoom");
    const frmTransmitter = document.getElementById("frmTransmitter");
    const txtMessageInput = document.getElementById("txtMessageInput");
    
    // File inputs
    const fileImageInput = document.getElementById("fileImageInput");
    const btnTriggerFile = document.getElementById("btnTriggerFile");
    const imgPreviewContainer = document.getElementById("imgPreviewContainer");
    const lblPreviewName = document.getElementById("lblPreviewName");
    const btnRemoveAttachment = document.getElementById("btnRemoveAttachment");

    // State Variables
    let activeChatType = "global"; 
    let activeTargetUid = null;
    let stagedImageUrl = null;

    // Apply visibility parameters safely based on role type
    //  THE FIX:
if (isGuest === "1") {
    if (friendActionPanel) friendActionPanel.style.display = "none";
    if (lblFriendTitle) lblFriendTitle.style.display = "none";
}
    
    // CRITICAL FIX: Ensure string "1" or number 1 match correctly for admin dashboard button visibility
    if ((isAdmin === "1" || isAdmin == 1) && lnkAdminPanel) {
        lnkAdminPanel.style.display = "block";
    }

    // --- RENDER MESSAGE BUBBLE VIA LIVE FEED ---
    function displayMessage(sender, text, imageUrl = null) {
        if (!chatScrollArea) return;
        const row = document.createElement("div");
        row.className = "msg-row";
        
        const meta = document.createElement("div");
        meta.className = "msg-meta";
        meta.innerText = sender;
        row.appendChild(meta);

        if (text) {
            const body = document.createElement("div");
            body.className = "msg-body";
            body.innerText = text;
            row.appendChild(body);
        }

        if (imageUrl) {
            const img = document.createElement("img");
            img.className = "msg-image";
            img.src = imageUrl;
            row.appendChild(img);
        }

        chatScrollArea.appendChild(row);
        chatScrollArea.scrollTop = chatScrollArea.scrollHeight;
    }

    // --- SOCIAL MANAGEMENT (ADD FRIENDS) ---
    async function loadFriendSidebar() {
        if (isGuest === "1" || !friendContainer) return;
        try {
            const res = await fetch(`${API_BASE}/api/friends/${userUid}`);
            if (res.ok) {
                const friends = await res.json();
                friendContainer.innerHTML = "";
                friends.forEach(f => {
                    const item = document.createElement("div");
                    item.className = "channel-item";
                    if (activeTargetUid === f.uid) item.className += " active";
                    
                    item.innerHTML = `<span>👤 ${f.display_name}</span> <span class="uid-badge">${f.uid}</span>`;
                    item.addEventListener("click", () => {
                        document.querySelectorAll(".channel-item").forEach(c => c.classList.remove("active"));
                        item.classList.add("active");
                        activeChatType = "private";
                        activeTargetUid = f.uid;
                        if (lblChatHeader) lblChatHeader.innerText = `🔒 Direct: ${f.display_name}`;
                        if (chatScrollArea) chatScrollArea.innerHTML = ""; 
                    });
                    friendContainer.appendChild(item);
                });
            }
        } catch (e) { console.error("Error setting up friend profiles", e); }
    }

    if (btnAddFriend && txtFriendSearch) {
        btnAddFriend.addEventListener("click", async () => {
            const key = txtFriendSearch.value.trim();
            if (!key) return;

            try {
                const res = await fetch(`${API_BASE}/api/friends/add`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_uid: userUid, search_key: key })
                });
                const data = await res.json();
                alert(data.message);
                txtFriendSearch.value = "";
                loadFriendSidebar();
            } catch (err) { alert("Failed to communicate with friend system."); }
        });
    }

    if (btnGlobalRoom) {
        btnGlobalRoom.addEventListener("click", () => {
            document.querySelectorAll(".channel-item").forEach(c => c.classList.remove("active"));
            btnGlobalRoom.classList.add("active");
            activeChatType = "global";
            activeTargetUid = null;
            if (lblChatHeader) lblChatHeader.innerText = "🌐 Public Network Core";
            if (chatScrollArea) chatScrollArea.innerHTML = ""; 
        });
    }

    // --- SINGLE IMAGE HANDLING SUITE ---
    if (btnTriggerFile) btnTriggerFile.addEventListener("click", () => fileImageInput.click());

    if (fileImageInput) {
        fileImageInput.addEventListener("change", async () => {
            if (fileImageInput.files.length === 0) return;
            const file = fileImageInput.files[0];
            
            const formData = new FormData();
            formData.append("file", file);

            try {
                const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: formData });
                const data = await res.json();
                if (res.ok) {
                    stagedImageUrl = data.url;
                    if (lblPreviewName) lblPreviewName.innerText = file.name;
                    if (imgPreviewContainer) imgPreviewContainer.style.display = "flex";
                } else { alert("Failed to host file attachment."); }
            } catch (err) { alert("File upload dropped."); }
        });
    }

    if (btnRemoveAttachment) {
        btnRemoveAttachment.addEventListener("click", () => {
            stagedImageUrl = null;
            if (fileImageInput) fileImageInput.value = "";
            if (imgPreviewContainer) imgPreviewContainer.style.display = "none";
        });
    }

    // --- SOCKET MANAGEMENT ENGINE ---
    const chatSocket = new WebSocket(`${WS_BASE}/ws/chat/${userUid}`);

    // Keep the connection alive on the cloud server
let heartbeatInterval;

socket.onopen = () => {
    console.log("Secure channel connection established!");
    
    // Send a tiny ping every 30 seconds to prevent Render from cutting the line
    heartbeatInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
        }
    }, 30000); 
};

socket.onclose = () => {
    console.log("Connection lost.");
    // Clear the interval if the socket closes normally
    clearInterval(heartbeatInterval);
};

    chatSocket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        // 🔽 PASTE THIS EXACTLY HERE 🔽
    if (data.type === "typing") {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            if (data.status === true) {
                indicator.innerText = `${data.sender} is typing...`;
            } else {
                indicator.innerText = "";
            }
        }
        return; // Stops here so it doesn't try to build a blank message box
    }
        
        if (activeChatType === "global" && !payload.recipient_uid) {
            displayMessage(payload.sender, payload.text, payload.image_url);
        } else if (activeChatType === "private" && payload.recipient_uid) {
            if ((payload.sender_uid === userUid && payload.recipient_uid === activeTargetUid) ||
                (payload.sender_uid === activeTargetUid && payload.recipient_uid === userUid)) {
                displayMessage(payload.sender, payload.text, payload.image_url);
            }
        }
    };

    if (frmTransmitter) {
        frmTransmitter.addEventListener("submit", (e) => {
            e.preventDefault();
            if (!txtMessageInput) return;
            const msgText = txtMessageInput.value.trim();
            if (!msgText && !stagedImageUrl) return;

            if (chatSocket.readyState === WebSocket.OPEN) {
                chatSocket.send(JSON.stringify({
                    sender_name: username,
                    text: msgText,
                    recipient_uid: activeTargetUid,
                    image_url: stagedImageUrl
                }));

                txtMessageInput.value = "";
                stagedImageUrl = null;
                if (fileImageInput) fileImageInput.value = "";
                if (imgPreviewContainer) imgPreviewContainer.style.display = "none";
            } else {
                alert("Secure channel connection is down.");
            }
        });
    }

    // GLOBAL DISCONNECT CONTROLLER (Ensures it hooks up perfectly no matter what)
    const btnDisconnect = document.getElementById("btnDisconnect");
    if (btnDisconnect) {
        btnDisconnect.addEventListener("click", () => {
            sessionStorage.clear();
            window.location.href = "/login";
        });
    }

    loadFriendSidebar();
});

// --- TYPING INDICATOR SENDING LOGIC ---
let typingTimeout;
const msgInputBox = document.getElementById('txtMessageInput'); 

if (msgInputBox) {
    msgInputBox.addEventListener('input', () => {
        // Send "typing" status to backend
        socket.send(JSON.stringify({
            "type": "typing",
            "status": true,
            "sender_name": typeof myUsername !== 'undefined' ? myUsername : "Someone" 
        }));

        clearTimeout(typingTimeout);

        // Automatically stop typing after 2 seconds of stillness
        typingTimeout = setTimeout(() => {
            socket.send(JSON.stringify({
                "type": "typing",
                "status": false,
                "sender_name": typeof myUsername !== 'undefined' ? myUsername : "Someone"
            }));
        }, 2000);
    });
}