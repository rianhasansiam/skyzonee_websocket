/**
 * ========================================
 * skyzonee WebSocket Server
 * ========================================
 * Real-time chat server for skyzonee e-commerce platform
 * Handles communication between customers and admins
 * 
 * Technology: Express.js + Socket.io + MongoDB
 * Port: 3001 (configurable)
 * Version: 2.0.0
 * ========================================
 */

require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { 
  connectToDatabase, 
  saveMessage, 
  markMessagesAsRead,
  getConversationMessages,
  updateUserPresence,
  isDatabaseConnected,
  closeDatabase
} = require('./database');

// ========================================
// CONFIGURATION
// ========================================

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ========================================
// EXPRESS APP SETUP
// ========================================

const app = express();
const httpServer = createServer(app);

// ========================================
// SOCKET.IO SETUP WITH CORS
// ========================================

const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://skyzonee.com',
      'https://www.skyzonee.com',
      /https:\/\/.*\.vercel\.app$/  // All Vercel deployments
    ],
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Additional Socket.io configuration for better performance
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e6,
  transports: ['websocket', 'polling']
});

// ========================================
// IN-MEMORY DATA STORES
// ========================================

/**
 * Store online admin socket IDs
 * @type {Set<string>}
 */
const onlineAdmins = new Set();

/**
 * Map user IDs to their socket IDs
 * @type {Map<string, string>}
 */
const userSocketMap = new Map();

/**
 * Track user presence and last seen
 * @type {Map<string, {online: boolean, lastSeen: Date, role: string, socketId: string}>}
 */
const userPresence = new Map();

// Cleanup interval to prevent memory leaks
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const MAX_IDLE_TIME = 24 * 60 * 60 * 1000; // 24 hours

setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [userId, presence] of userPresence.entries()) {
    if (!presence.online && (now - presence.lastSeen.getTime() > MAX_IDLE_TIME)) {
      userPresence.delete(userId);
      userSocketMap.delete(userId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} stale user presence records`);
  }
}, CLEANUP_INTERVAL);

// ========================================
// EXPRESS MIDDLEWARE
// ========================================

app.use(express.json());

// Basic logging middleware
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path}`);
  next();
});

// ========================================
// REST API ENDPOINTS
// ========================================

/**
 * Root endpoint - Server information
 */
app.get('/', (req, res) => {
  res.json({
    message: 'skyzonee WebSocket Server',
    status: 'running',
    version: '2.0.0',
    environment: NODE_ENV,
    endpoints: {
      health: '/health',
      stats: '/stats',
      websocket: `ws://localhost:${PORT}`
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  const connections = io.engine.clientsCount;
  const adminsOnline = onlineAdmins.size;
  const usersOnline = Array.from(userPresence.values()).filter(u => u.online && u.role === 'user').length;
  const dbConnected = isDatabaseConnected();

  res.json({
    status: 'ok',
    service: 'skyzonee-websocket-server',
    connections,
    adminsOnline,
    usersOnline,
    database: dbConnected ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB'
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * Stats endpoint - Detailed statistics
 */
app.get('/stats', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const connections = io.engine.clientsCount;
  const adminsOnline = onlineAdmins.size;
  const usersOnline = Array.from(userPresence.values()).filter(u => u.online && u.role === 'user').length;

  res.json({
    totalConnections: connections,
    adminsOnline,
    usersOnline,
    totalUsers: userPresence.size,
    uptime: Math.floor(process.uptime()),
    memory: {
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
      unit: 'MB'
    },
    dataStores: {
      onlineAdminsCount: onlineAdmins.size,
      userSocketMapCount: userSocketMap.size,
      userPresenceCount: userPresence.size
    },
    timestamp: new Date().toISOString()
  });
});

// ========================================
// SOCKET.IO EVENT HANDLERS
// ========================================

io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  /**
   * JOIN EVENT - User joins their room
   * @param {string} userId - User's unique ID
   * @param {string} role - User's role ('user' or 'admin')
   */
  socket.on('join', async (userId, role = 'user') => {
    try {
      // Validate input
      if (!userId) {
        console.error('❌ Join failed: userId is required');
        socket.emit('error', { message: 'userId is required' });
        return;
      }

      // Join user to their personal room
      socket.join(userId);
      
      // Store user-socket mapping
      userSocketMap.set(userId, socket.id);
      
      // Update user presence
      userPresence.set(userId, {
        online: true,
        lastSeen: new Date(),
        role,
        socketId: socket.id
      });

      // Update presence in database
      await updateUserPresence(userId, true, role);

      // Handle role-specific logic
      if (role === 'admin') {
        onlineAdmins.add(socket.id);
        console.log(`👨‍💼 Admin joined: ${userId} (${onlineAdmins.size} admins online)`);
        
        // Notify all clients about admin status
        io.emit('admin-status', {
          available: onlineAdmins.size > 0,
          count: onlineAdmins.size,
          timestamp: new Date()
        });
      } else {
        console.log(`👤 User joined: ${userId} (role: ${role})`);
        
        // Send current admin status to the newly joined user
        socket.emit('admin-status', {
          available: onlineAdmins.size > 0,
          count: onlineAdmins.size,
          timestamp: new Date()
        });
        
        // Notify admins about user presence
        onlineAdmins.forEach(adminSocketId => {
          io.to(adminSocketId).emit('user-presence', {
            userId,
            online: true,
            role,
            timestamp: new Date()
          });
        });
      }

      // Confirm join to the client
      socket.emit('joined', {
        userId,
        role,
        socketId: socket.id,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('❌ Error in join event:', error);
      socket.emit('error', { message: 'Failed to join', error: error.message });
    }
  });

  /**
   * SEND-MESSAGE EVENT - Send a message to a conversation
   * @param {Object} data - Message data
   * @param {string} data.conversationId - Conversation ID
   * @param {string} data.message - Message content
   * @param {string} data.senderId - Sender's ID
   * @param {string} data.senderName - Sender's name
   * @param {string} data.senderRole - Sender's role
   */
  socket.on('send-message', async (data) => {
    try {
      const { conversationId, message, senderId, senderName, senderRole } = data;

      // Validate required fields
      if (!conversationId || !message || !senderId) {
        console.error('❌ Send message failed: Missing required fields');
        socket.emit('error', { message: 'Missing required fields' });
        return;
      }

      const messageData = {
        conversationId,
        message,
        senderId,
        senderName,
        senderRole,
        timestamp: new Date()
      };

      // Save message to MongoDB
      const saveResult = await saveMessage(messageData);
      
      if (saveResult.success) {
        // Send the saved message with database ID
        const savedMessage = saveResult.message;
        
        // Broadcast message to conversation room
        io.to(conversationId).emit('new-message', savedMessage);
        
        console.log(`💬 Message sent & saved: ${senderName} → ${conversationId}`);

        // If sender is a user (not admin), notify all admins
        if (senderRole !== 'admin') {
          let notifiedCount = 0;
          onlineAdmins.forEach(adminSocketId => {
            io.to(adminSocketId).emit('new-user-message', savedMessage);
            notifiedCount++;
          });
          
          if (notifiedCount > 0) {
            console.log(`🔔 Notified ${notifiedCount} admin(s) of new user message`);
          }
        }
        
        // Confirm to sender
        socket.emit('message-sent', {
          success: true,
          messageId: saveResult.messageId,
          timestamp: savedMessage.timestamp
        });
      } else {
        console.error('❌ Failed to save message to database:', saveResult.error);
        
        // Still broadcast message even if DB save fails (fallback)
        io.to(conversationId).emit('new-message', messageData);
        
        socket.emit('message-sent', {
          success: false,
          error: 'Message delivered but not saved to database',
          timestamp: messageData.timestamp
        });
      }

    } catch (error) {
      console.error('❌ Error in send-message event:', error);
      socket.emit('error', { message: 'Failed to send message', error: error.message });
    }
  });

  /**
   * TYPING EVENT - User is typing
   * @param {Object} data - Typing data
   * @param {string} data.conversationId - Conversation ID
   * @param {string} data.userName - User's name
   */
  socket.on('typing', (data) => {
    try {
      const { conversationId, userName } = data;

      if (!conversationId) {
        return;
      }

      // Notify all admins that user is typing
      onlineAdmins.forEach(adminSocketId => {
        io.to(adminSocketId).emit('user-typing', {
          conversationId,
          userName,
          timestamp: new Date()
        });
      });

      console.log(`⌨️  User typing: ${userName} in ${conversationId}`);

    } catch (error) {
      console.error('❌ Error in typing event:', error);
    }
  });

  /**
   * STOP-TYPING EVENT - User stopped typing
   * @param {Object} data - Stop typing data
   * @param {string} data.conversationId - Conversation ID
   */
  socket.on('stop-typing', (data) => {
    try {
      const { conversationId } = data;

      if (!conversationId) {
        return;
      }

      // Notify all admins that user stopped typing
      onlineAdmins.forEach(adminSocketId => {
        io.to(adminSocketId).emit('user-stop-typing', {
          conversationId,
          timestamp: new Date()
        });
      });

    } catch (error) {
      console.error('❌ Error in stop-typing event:', error);
    }
  });

  /**
   * ADMIN-TYPING EVENT - Admin is typing
   * @param {Object} data - Typing data
   * @param {string} data.conversationId - Conversation ID
   * @param {string} data.adminName - Admin's name
   */
  socket.on('admin-typing', (data) => {
    try {
      const { conversationId, adminName } = data;

      if (!conversationId) {
        return;
      }

      // Notify users in conversation room that admin is typing
      io.to(conversationId).emit('admin-typing', {
        conversationId,
        adminName,
        timestamp: new Date()
      });

      console.log(`⌨️  Admin typing: ${adminName} in ${conversationId}`);

    } catch (error) {
      console.error('❌ Error in admin-typing event:', error);
    }
  });

  /**
   * ADMIN-STOP-TYPING EVENT - Admin stopped typing
   * @param {Object} data - Stop typing data
   * @param {string} data.conversationId - Conversation ID
   */
  socket.on('admin-stop-typing', (data) => {
    try {
      const { conversationId } = data;

      if (!conversationId) {
        return;
      }

      // Notify users in conversation room that admin stopped typing
      io.to(conversationId).emit('admin-stop-typing', {
        conversationId,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('❌ Error in admin-stop-typing event:', error);
    }
  });

  /**
   * MESSAGE-DELIVERED EVENT - Message was delivered
   * @param {Object} data - Delivery data
   * @param {string} data.messageId - Message ID
   * @param {string} data.conversationId - Conversation ID
   */
  socket.on('message-delivered', (data) => {
    try {
      const { messageId, conversationId } = data;

      if (!messageId || !conversationId) {
        return;
      }

      // Notify admins about message delivery status
      onlineAdmins.forEach(adminSocketId => {
        io.to(adminSocketId).emit('message-status', {
          messageId,
          conversationId,
          status: 'delivered',
          timestamp: new Date()
        });
      });

      console.log(`✓ Message delivered: ${messageId}`);

    } catch (error) {
      console.error('❌ Error in message-delivered event:', error);
    }
  });

  /**
   * MESSAGE-READ EVENT - Message was read
   * @param {Object} data - Read data
   * @param {string} data.messageId - Message ID
   * @param {string} data.conversationId - Conversation ID
   */
  socket.on('message-read', async (data) => {
    try {
      const { messageId, conversationId } = data;

      if (!conversationId) {
        return;
      }

      // Mark messages as read in database
      await markMessagesAsRead(conversationId, 'user');

      // Notify conversation room about message read status
      io.to(conversationId).emit('message-status', {
        messageId,
        conversationId,
        status: 'read',
        timestamp: new Date()
      });

      console.log(`✓✓ Messages marked as read in: ${conversationId}`);

    } catch (error) {
      console.error('❌ Error in message-read event:', error);
    }
  });

  /**
   * DISCONNECT EVENT - User disconnects
   */
  socket.on('disconnect', async () => {
    try {
      console.log(`❌ User disconnected: ${socket.id}`);

      // Check if disconnected user was an admin
      if (onlineAdmins.has(socket.id)) {
        onlineAdmins.delete(socket.id);
        console.log(`👨‍💼 Admin disconnected (${onlineAdmins.size} admins remaining)`);
        
        // Notify all clients about admin status change
        io.emit('admin-status', {
          available: onlineAdmins.size > 0,
          count: onlineAdmins.size,
          timestamp: new Date()
        });
      }

      // Find and clean up user data
      let disconnectedUserId = null;
      let disconnectedUserRole = null;

      // Find user ID by socket ID
      for (const [userId, socketId] of userSocketMap.entries()) {
        if (socketId === socket.id) {
          disconnectedUserId = userId;
          const presence = userPresence.get(userId);
          if (presence) {
            disconnectedUserRole = presence.role;
          }
          break;
        }
      }

      // Clean up data structures
      if (disconnectedUserId) {
        userSocketMap.delete(disconnectedUserId);
        
        // Update presence
        const presence = userPresence.get(disconnectedUserId);
        if (presence) {
          userPresence.set(disconnectedUserId, {
            ...presence,
            online: false,
            lastSeen: new Date()
          });
        }

        // Update presence in database
        await updateUserPresence(disconnectedUserId, false, disconnectedUserRole);

        // Notify admins if a user disconnected
        if (disconnectedUserRole === 'user') {
          onlineAdmins.forEach(adminSocketId => {
            io.to(adminSocketId).emit('user-presence', {
              userId: disconnectedUserId,
              online: false,
              lastSeen: new Date(),
              timestamp: new Date()
            });
          });
        }

        console.log(`🧹 Cleaned up data for user: ${disconnectedUserId}`);
      }

    } catch (error) {
      console.error('❌ Error in disconnect event:', error);
    }
  });

  /**
   * ERROR EVENT - Handle socket errors
   */
  socket.on('error', (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error);
  });
});

// ========================================
// ERROR HANDLING
// ========================================

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Don't exit in production, but log the error
  if (NODE_ENV !== 'production') {
    process.exit(1);
  }
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Don't exit in production, but log the error
  if (NODE_ENV !== 'production') {
    process.exit(1);
  }
});

/**
 * Graceful shutdown on SIGTERM
 */
process.on('SIGTERM', async () => {
  console.log('\n⚠️  SIGTERM received, shutting down gracefully...');
  
  // Close database connection
  await closeDatabase();
  
  // Close server
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    
    // Close all socket connections
    io.close(() => {
      console.log('✅ WebSocket server closed');
      console.log('👋 Server shutdown complete');
      process.exit(0);
    });
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

/**
 * Graceful shutdown on SIGINT (Ctrl+C)
 */
process.on('SIGINT', async () => {
  console.log('\n⚠️  SIGINT received, shutting down gracefully...');
  
  // Close database connection
  await closeDatabase();
  
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    
    io.close(() => {
      console.log('✅ WebSocket server closed');
      console.log('👋 Server shutdown complete');
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

// ========================================
// START SERVER
// ========================================

// Initialize database connection first
connectToDatabase().then(({ connected, error }) => {
  if (connected) {
    console.log('✅ MongoDB connected successfully');
  } else {
    console.warn('⚠️  MongoDB connection failed:', error);
    console.warn('   Server will run without database persistence');
  }

  // Start HTTP server
  httpServer.listen(PORT, () => {
    console.log('\n');
    console.log('╔════════════════════════════════════════════╗');
    console.log('║                                            ║');
    console.log('║     🚀 skyzonee WebSocket Server 🚀      ║');
    console.log('║                                            ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');
    console.log(`✅ Server Status:    RUNNING`);
    console.log(`🌐 Environment:     ${NODE_ENV.toUpperCase()}`);
    console.log(`📡 Port:            ${PORT}`);
    console.log(`🔗 HTTP Endpoint:   http://localhost:${PORT}`);
    console.log(`⚡ WebSocket:       ws://localhost:${PORT}`);
    console.log(`💚 Health Check:    http://localhost:${PORT}/health`);
    console.log(`📊 Stats:           http://localhost:${PORT}/stats`);
    console.log(`💾 Database:        ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
    console.log('');
    console.log('════════════════════════════════════════════');
    console.log('📝 Listening for WebSocket connections...');
    console.log('════════════════════════════════════════════');
    console.log('');
  });
}).catch(error => {
  console.error('❌ Failed to initialize server:', error);
  process.exit(1);
});

// ========================================
// EXPORTS (for testing)
// ========================================

module.exports = { app, httpServer, io };
