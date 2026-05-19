# 🚀 skyzonee WebSocket Server

Real-time WebSocket server for skyzonee e-commerce chat system. Handles real-time communication between customers (users/guests) and admins using Socket.io.

## 📋 Features

✅ **Real-time Communication** - Instant messaging between users and admins  
✅ **Presence Tracking** - Know who's online and when they were last seen  
✅ **Typing Indicators** - See when someone is typing  
✅ **Message Status** - Delivered and read receipts  
✅ **Admin Notifications** - Admins get notified of new user messages  
✅ **Health Monitoring** - Built-in health check and stats endpoints  
✅ **CORS Support** - Configured for local development and production  
✅ **Auto-reconnection** - Built-in reconnection support  
✅ **Error Handling** - Comprehensive error handling and logging  
✅ **Graceful Shutdown** - Proper cleanup on server shutdown  

## 🛠️ Technology Stack

- **Node.js** (>= 18.0.0)
- **Express.js** (^4.18.2)
- **Socket.io** (^4.8.1)
- **Nodemon** (^3.0.1) - Development only

## 📦 Installation

### 1. Clone or Download

```bash
cd skyzonee-websocket-server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the example environment file:

```bash
copy .env.example .env
```

Edit `.env` if you need to change the port or environment:

```env
PORT=3001
NODE_ENV=development
```

### 4. Start the Server

**Development mode (with auto-restart):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

## 🌐 Server Endpoints

### HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Server information and status |
| `/health` | GET | Health check with connection stats |
| `/stats` | GET | Detailed server statistics |

### WebSocket Connection

```javascript
const socket = io('http://localhost:3001', {
  transports: ['websocket', 'polling']
});
```

## 📡 Socket Events

### Client → Server Events

#### 1. Join Room
```javascript
socket.emit('join', userId, role);
// userId: string - User's unique ID
// role: 'user' | 'admin'
```

#### 2. Send Message
```javascript
socket.emit('send-message', {
  conversationId: 'conv-123',
  message: 'Hello!',
  senderId: 'user-123',
  senderName: 'John Doe',
  senderRole: 'user'
});
```

#### 3. Typing Indicators
```javascript
// User typing
socket.emit('typing', {
  conversationId: 'conv-123',
  userName: 'John Doe'
});

// User stopped typing
socket.emit('stop-typing', {
  conversationId: 'conv-123'
});

// Admin typing
socket.emit('admin-typing', {
  conversationId: 'conv-123',
  adminName: 'Support Agent'
});

// Admin stopped typing
socket.emit('admin-stop-typing', {
  conversationId: 'conv-123'
});
```

#### 4. Message Status
```javascript
// Message delivered
socket.emit('message-delivered', {
  messageId: 'msg-123',
  conversationId: 'conv-123'
});

// Message read
socket.emit('message-read', {
  messageId: 'msg-123',
  conversationId: 'conv-123'
});
```

### Server → Client Events

#### 1. Connection Confirmed
```javascript
socket.on('joined', (data) => {
  // data: { userId, role, socketId, timestamp }
});
```

#### 2. New Message
```javascript
socket.on('new-message', (data) => {
  // data: { conversationId, message, senderId, senderName, senderRole, timestamp }
});
```

#### 3. Admin Notifications
```javascript
socket.on('new-user-message', (data) => {
  // Received by admins only
  // data: { conversationId, message, senderId, senderName, senderRole, timestamp }
});
```

#### 4. Typing Indicators
```javascript
socket.on('user-typing', (data) => {
  // data: { conversationId, userName, timestamp }
});

socket.on('user-stop-typing', (data) => {
  // data: { conversationId, timestamp }
});

socket.on('admin-typing', (data) => {
  // data: { conversationId, adminName, timestamp }
});

socket.on('admin-stop-typing', (data) => {
  // data: { conversationId, timestamp }
});
```

#### 5. Admin Status
```javascript
socket.on('admin-status', (data) => {
  // data: { available: boolean, count: number, timestamp }
});
```

#### 6. User Presence
```javascript
socket.on('user-presence', (data) => {
  // Received by admins only
  // data: { userId, online: boolean, role, timestamp, lastSeen? }
});
```

#### 7. Message Status
```javascript
socket.on('message-status', (data) => {
  // data: { messageId, conversationId, status: 'delivered' | 'read', timestamp }
});
```

## 🧪 Testing the Server

### 1. Check if Server is Running
```bash
curl http://localhost:3001
```

### 2. Health Check
```bash
curl http://localhost:3001/health
```

### 3. View Stats
```bash
curl http://localhost:3001/stats
```

### 4. Test WebSocket Connection

Create a simple HTML file to test:

```html
<!DOCTYPE html>
<html>
<head>
  <title>WebSocket Test</title>
  <script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
</head>
<body>
  <h1>WebSocket Test</h1>
  <div id="status">Connecting...</div>
  
  <script>
    const socket = io('http://localhost:3001');
    
    socket.on('connect', () => {
      document.getElementById('status').textContent = 'Connected!';
      console.log('Connected:', socket.id);
      
      // Join as a user
      socket.emit('join', 'test-user-123', 'user');
    });
    
    socket.on('joined', (data) => {
      console.log('Joined successfully:', data);
    });
    
    socket.on('disconnect', () => {
      document.getElementById('status').textContent = 'Disconnected';
    });
  </script>
</body>
</html>
```

## 🔧 Configuration

### CORS Origins

The server is configured to accept connections from:

- `http://localhost:3000` (Local Next.js development)
- `http://127.0.0.1:3000` (Alternative localhost)
- `https://skyzonee.com` (Production)
- `https://www.skyzonee.com` (Production with www)
- `https://*.vercel.app` (All Vercel deployments)

To add more origins, edit the CORS configuration in `server.js`:

```javascript
const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:3000',
      'https://your-domain.com'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});
```

### Port Configuration

Change the port in `.env`:

```env
PORT=3001
```

Or set it as an environment variable:

```bash
# Windows (CMD)
set PORT=3002 && npm start

# Windows (PowerShell)
$env:PORT=3002; npm start

# Linux/Mac
PORT=3002 npm start
```

## 📊 Monitoring

### Health Check Response
```json
{
  "status": "ok",
  "service": "skyzonee-websocket-server",
  "connections": 5,
  "adminsOnline": 2,
  "usersOnline": 3,
  "uptime": 3600,
  "memory": {
    "used": 45,
    "total": 128,
    "unit": "MB"
  },
  "timestamp": "2025-10-20T12:00:00.000Z"
}
```

### Stats Response
```json
{
  "totalConnections": 5,
  "adminsOnline": 2,
  "usersOnline": 3,
  "totalUsers": 10,
  "uptime": 3600,
  "memory": {
    "rss": 120,
    "heapUsed": 45,
    "heapTotal": 128,
    "external": 2,
    "unit": "MB"
  },
  "dataStores": {
    "onlineAdminsCount": 2,
    "userSocketMapCount": 5,
    "userPresenceCount": 10
  },
  "timestamp": "2025-10-20T12:00:00.000Z"
}
```

## 🚀 Deployment

### Option 1: Railway

1. Install Railway CLI:
```bash
npm install -g @railway/cli
```

2. Login to Railway:
```bash
railway login
```

3. Initialize and deploy:
```bash
railway init
railway up
```

4. Set environment variables:
```bash
railway variables set PORT=3001
railway variables set NODE_ENV=production
```

### Option 2: Render

1. Create a new Web Service on [Render](https://render.com)
2. Connect your repository
3. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment Variables:** 
     - `PORT=3001`
     - `NODE_ENV=production`

### Option 3: Heroku

1. Install Heroku CLI
2. Login:
```bash
heroku login
```

3. Create app:
```bash
heroku create skyzonee-websocket
```

4. Set environment variables:
```bash
heroku config:set NODE_ENV=production
```

5. Deploy:
```bash
git push heroku main
```

## 🔒 Security Best Practices

1. **Use HTTPS in Production** - Always use secure connections
2. **Validate Input** - All socket events validate required fields
3. **Rate Limiting** - Consider adding rate limiting for production
4. **Authentication** - Implement proper authentication for users
5. **Monitor Logs** - Set up log monitoring for production

## 🐛 Troubleshooting

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::3001
```

**Solution:** Change the port in `.env` or kill the process using the port:

```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :3001
kill -9 <PID>
```

### CORS Errors
```
Access to XMLHttpRequest has been blocked by CORS policy
```

**Solution:** Add your frontend URL to the CORS origins in `server.js`.

### Connection Timeout
```
WebSocket connection failed
```

**Solution:** 
- Check if server is running: `curl http://localhost:3001/health`


## 📝 Logs

The server logs all important events:

- ✅ Connection established
- 👤 User joined
- 👨‍💼 Admin joined
- 💬 Message sent
- 🔔 Admins notified
- ⌨️ Typing indicators
- ✓ Message status updates
- ❌ Disconnections
- ⚠️ Errors

## 🤝 Integration with Next.js

In your Next.js app, set the WebSocket URL in `.env.local`:

```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

For production:
```env
NEXT_PUBLIC_SOCKET_URL=https://your-websocket-server.com
```

## 📄 License

MIT License - feel free to use this for your projects!

## 👥 Support

For issues or questions:
- Check the logs in the terminal
- Use the `/health` endpoint to check server status
- Review the Socket.io documentation: https://socket.io/docs/v4/

---

**Version:** 1.0.0  
**Created:** October 20, 2025  
**Status:** Production Ready ✅
