document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const chatMessages = document.getElementById("chat-messages")
  const usernameContainer = document.getElementById("username-container")
  const messageContainer = document.getElementById("message-container")
  const usernameInput = document.getElementById("username-input")
  const usernameSubmit = document.getElementById("username-submit")
  const messageInput = document.getElementById("message-input")
  const sendButton = document.getElementById("send-button")
  const connectionStatus = document.getElementById("connection-status")
  const usersOnline = document.getElementById("users-online")
  const typingIndicator = document.getElementById("typing-indicator")

  // Variables
  let socket
  let username = ""
  let isConnected = false
  let reconnectAttempts = 0
  let reconnectTimeout
  let typingTimeout
  const onlineUsers = new Set()

  // Track sent messages to avoid duplicates
  const sentMessages = new Set()

  // WebSocket URL
  const wsUrl = "wss://ibx8i058uk.execute-api.ap-south-1.amazonaws.com/production/"

  // Connect to WebSocket
  function connectWebSocket() {
    if (socket && socket.readyState !== WebSocket.CLOSED) return

    updateConnectionStatus("connecting")

    socket = new WebSocket(wsUrl)

    socket.onopen = () => {
      console.log("WebSocket connection established")
      isConnected = true
      reconnectAttempts = 0
      updateConnectionStatus("connected")

      if (username) {
        sendUserJoinMessage()
        enableMessageInput()
      }
    }

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleIncomingMessage(data)
      } catch (error) {
        console.error("Error parsing message:", error)
        addSystemMessage("Error processing message")
      }
    }

    socket.onclose = (event) => {
      console.log("WebSocket connection closed:", event.code, event.reason)
      isConnected = false
      updateConnectionStatus("disconnected")
      disableMessageInput()

      // Attempt to reconnect with exponential backoff
      if (reconnectAttempts < 5) {
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000)
        addSystemMessage(`Connection lost. Reconnecting in ${delay / 1000} seconds...`)

        reconnectTimeout = setTimeout(() => {
          reconnectAttempts++
          connectWebSocket()
        }, delay)
      } else {
        addSystemMessage("Could not reconnect. Please refresh the page.")
      }
    }

    socket.onerror = (error) => {
      console.error("WebSocket error:", error)
      addSystemMessage("Connection error occurred")
    }
  }

  // Update connection status UI
  function updateConnectionStatus(status) {
    connectionStatus.className = status
    connectionStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1)
  }

  // Enable message input
  function enableMessageInput() {
    messageInput.disabled = false
    sendButton.disabled = false
    messageInput.focus()
  }

  // Disable message input
  function disableMessageInput() {
    messageInput.disabled = true
    sendButton.disabled = true
  }

  // Handle incoming messages
  function handleIncomingMessage(data) {
    if (data.type === "user_joined") {
      addSystemMessage(`${data.username} joined the chat`)
      onlineUsers.add(data.username)
      updateOnlineUsersCount()
    } else if (data.type === "user_left") {
      addSystemMessage(`${data.username} left the chat`)
      onlineUsers.delete(data.username)
      updateOnlineUsersCount()
    } else if (data.type === "typing") {
      showTypingIndicator(data.username)
    } else if (data.message) {
      // Check if this message is from the current user
      const isSentByMe = data.username === username

      // Only display messages from others - your own messages are already displayed when sent
      if (!isSentByMe) {
        addChatMessage(data.message, false)
      }
    }
  }

  // Add system message
  function addSystemMessage(message) {
    const systemMessage = document.createElement("div")
    systemMessage.className = "system-message"
    systemMessage.textContent = message
    chatMessages.appendChild(systemMessage)
    scrollToBottom()
  }

  // Add chat message
  function addChatMessage(message, isSent = false) {
    const messageElement = document.createElement("div")
    messageElement.className = `message ${isSent ? "sent" : "received"}`

    const contentElement = document.createElement("div")
    contentElement.className = "content"
    contentElement.textContent = message

    const timeElement = document.createElement("div")
    timeElement.className = "time"
    timeElement.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

    messageElement.appendChild(contentElement)
    messageElement.appendChild(timeElement)

    chatMessages.appendChild(messageElement)
    scrollToBottom()
  }

  // Scroll chat to bottom
  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight
  }

  // Show typing indicator
  function showTypingIndicator(user) {
    if (user === username) return

    typingIndicator.textContent = `${user} is typing...`
    typingIndicator.classList.remove("hidden")

    clearTimeout(typingTimeout)
    typingTimeout = setTimeout(() => {
      typingIndicator.classList.add("hidden")
    }, 3000)
  }

  // Update online users count
  function updateOnlineUsersCount() {
    usersOnline.textContent = `Users online: ${onlineUsers.size}`
  }

  // Send user join message
  function sendUserJoinMessage() {
    if (!isConnected) return

    const message = {
      action: "sendmessage",
      type: "user_joined",
      username: username,
    }

    socket.send(JSON.stringify(message))
    onlineUsers.add(username)
    updateOnlineUsersCount()
  }

  // Send chat message
  function sendChatMessage() {
    const message = messageInput.value.trim()
    if (!message || !isConnected) return

    const messageData = {
      action: "sendmessage",
      message: message,
      username: username,
      timestamp: new Date().toISOString(),
    }

    // Add message locally first to ensure it appears immediately
    addChatMessage(message, true)

    // Then send it to the server
    socket.send(JSON.stringify(messageData))
    messageInput.value = ""
  }

  // Send typing indicator
  function sendTypingIndicator() {
    if (!isConnected) return

    const typingData = {
      action: "sendmessage",
      type: "typing",
      username: username,
    }

    socket.send(JSON.stringify(typingData))
  }

  // Event Listeners
  usernameSubmit.addEventListener("click", () => {
    const name = usernameInput.value.trim()
    if (name) {
      username = name
      usernameContainer.classList.add("hidden")
      messageContainer.classList.remove("hidden")
      addSystemMessage(`Welcome, ${username}!`)
      connectWebSocket()
    }
  })

  usernameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      usernameSubmit.click()
    }
  })

  sendButton.addEventListener("click", sendChatMessage)

  messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      sendChatMessage()
    } else {
      // Debounce typing indicator
      clearTimeout(typingTimeout)
      typingTimeout = setTimeout(sendTypingIndicator, 300)
    }
  })

  // Handle page visibility changes
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !isConnected) {
      connectWebSocket()
    }
  })

  // Handle page unload
  window.addEventListener("beforeunload", () => {
    if (isConnected && username) {
      const leaveMessage = {
        action: "sendmessage",
        type: "user_left",
        username: username,
      }
      socket.send(JSON.stringify(leaveMessage))
    }
  })

  // Initialize
  usernameInput.focus()
})
