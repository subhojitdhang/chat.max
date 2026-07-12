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
    if (isGuest === "1") {
        if (friendActionPanel) friendActionPanel.style.display = "none";
        if (lblFriendTitle) lblFriendTitle.style.display = "none";
    }
    
    if ((isAdmin === "1" || isAdmin == 1) && lnkAdminPanel) {
        lnkAdminPanel.style.display = "block";
    }

    // --- IN-APP TOAST NOTIFICATION ENGINE ---
    function showNotification(senderName, textMessage) {
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            container.style.position = "fixed";
            container.style.top = "20px";
            container.style.right = "20px";
            container.style.zIndex = "9999";
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        toast.style.background = "#2c2f33";
        toast.style.color = "#ffffff";
        toast.style.padding = "12px 20px";
        toast.style.marginBottom = "10px";
        toast.style.borderRadius = "8px";
        toast.style.boxShadow = "0 4px 15px rgba(0,0,0,0.3)";
        toast.style.borderLeft = "4px solid #7289da";
        toast.style.fontFamily = "sans-serif";
        toast.style.minWidth = "200px";
        toast.style.transition = "all 0.3s ease";
        toast.style.opacity = "0";
        toast.style.transform = "translateX(50px)";

        toast.innerHTML = `
            <div style="font-weight: bold; font-size: 13px; color: #7289da; margin-bottom: 3px;">💬 New Message</div>
            <div style="font-size: 14px;"><strong style="color: #fff;">${senderName}:</strong> ${textMessage || "Sent an image"}</div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "1";
            toast.style.transform = "translateX(0)";
        }, 50);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(50px)";
            setTimeout(() => toast.remove(), 300);
        }, 4000);
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
                    
                    item.style.display = "flex";
                    item.style.justifyContent = "space-between";
                    item.style.alignItems = "center";
                    
                    if (activeTargetUid === f.uid) item.className += " active";
                 
                    item.innerHTML = `
                        <div>
                            <span>👤 ${f.display_name}</span> 
                            <span class="uid-badge">${f.uid}</span>
                        </div>
                        <button class="btn-delete-friend" style="background: none; border: none; color: #ff4d4d; cursor: pointer; font-size: 14px; padding: 4px 8px;">❌</button>
                    `;
          
                    item.addEventListener("click", () => {
                        document.querySelectorAll(".channel-item").forEach(c => c.classList.remove("active"));
                        item.classList.add("active");
         
                        activeChatType = "private";
                        activeTargetUid = f.uid;
                        if (lblChatHeader) lblChatHeader.innerText = `💬 Direct: ${f.display_name}`;
                        if (chatScrollArea) chatScrollArea.innerHTML = ""; 
                    });

                    const deleteBtn = item.querySelector(".btn-delete-friend");
                    if (deleteBtn) {
                        deleteBtn.addEventListener("click", (event) => {
                            event.stopPropagation();
                            deleteFriend(f.uid);
                        });
                    }
                    
                    friendContainer.appendChild(item);
                });
            }
        } catch (e) { 
            console.error("Error setting up friend profiles", e);
        }
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
            } catch (err) { 
                alert("Failed to communicate with friend system."); 
            }
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
                } else { 
                    alert("Failed to host file attachment."); 
                }
            } catch (err) { 
                alert("File upload dropped."); 
            }
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
    initTypingIndicator();
    let heartbeatInterval;

    chatSocket.onopen = () => {
        console.log("Secure channel connection established!");
        heartbeatInterval = setInterval(() => {
            if (chatSocket.readyState === WebSocket.OPEN) {
                chatSocket.send(JSON.stringify({ type: "ping" }));
            }
        }, 30000);
    };

    chatSocket.onclose = () => {
        console.log("Connection lost.");
        clearInterval(heartbeatInterval);
    };

    chatSocket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === "typing") {
            const indicator = document.getElementById('typing-indicator');
            if (indicator) {
                if (payload.status === true) {
                    indicator.innerText = `${payload.sender} is typing...`;
                } else {
                    indicator.innerText = "";
                }
            }
            return;
        }
        
        // Fix message visibility rules & track alerts accurately by sender name
        if (activeChatType === "global" && !payload.recipient_uid) {
            displayMessage(payload.sender, payload.text, payload.image_url);
        } else if (payload.recipient_uid) {
            // Private message handling logic
            if ((payload.sender_uid === userUid && payload.recipient_uid === activeTargetUid) ||
                (payload.sender_uid === activeTargetUid && payload.recipient_uid === userUid)) {
                displayMessage(payload.sender, payload.text, payload.image_url);
            } else {
                // If a PM comes in from someone else, notify without hiding it permanently
                if (payload.sender !== username) {
                    showNotification(payload.sender, payload.text);
                }
            }
        } else if (activeChatType !== "global" && !payload.recipient_uid) {
            // Global message alert when user is inside a PM room
            if (payload.sender !== username) {
                showNotification(`${payload.sender} (Global)`, payload.text);
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

    // GLOBAL DISCONNECT CONTROLLER
    const btnDisconnect = document.getElementById("btnDisconnect");
    if (btnDisconnect) {
        btnDisconnect.addEventListener("click", () => {
            sessionStorage.clear();
            window.location.href = "/login";
        });
    }

    loadFriendSidebar();

    // --- DEBBUGGING TYPING INDICATOR ---
    function initTypingIndicator() {
        console.log("Checkpoint 1: Typing indicator function initialized.");
        let typingTimeout;
        const msgInputBox = document.getElementById('txtMessageInput'); 

        if (msgInputBox) {
            msgInputBox.addEventListener('input', () => {
                if (typeof chatSocket === 'undefined' || !chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
                    return; 
                }

                chatSocket.send(JSON.stringify({
                    "type": "typing",
                    "status": true,
                    "sender_name": typeof username !== 'undefined' ? username : "Someone" 
                }));

                clearTimeout(typingTimeout);

                typingTimeout = setTimeout(() => {
                    if (typeof chatSocket === 'undefined' || !chatSocket || chatSocket.readyState !== WebSocket.OPEN) return;
                    
                    chatSocket.send(JSON.stringify({
                        "type": "typing",
                        "status": false,
                        "sender_name": typeof username !== 'undefined' ? username : "Someone"
                    }));
                }, 2000);
            });
        } else {
            console.log("Checkpoint 2 ERROR: HTML input element 'txtMessageInput' was not found!");
        }
    }
});

async function deleteFriend(friendUid) {
    const userUid = sessionStorage.getItem("user_uid");
    
    if (!confirm("Are you sure you want to remove this friend?")) {
        return;
    }

    try {
        const response = await fetch(`${window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" ? "http://127.0.0.1:8000" : window.location.origin}/api/friends/delete`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                user_uid: userUid,
                friend_uid: friendUid
            })
        });
        const result = await response.json();

        if (response.ok) {
            alert(result.message);
            window.location.reload();
        } else {
            alert("Error: " + result.detail);
        }
    } catch (error) {
        console.error("Failed to delete friend:", error);
    }
}