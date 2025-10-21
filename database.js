/**
 * MongoDB Connection Module for WebSocket Server
 * Handles database connections and operations
 */

const { MongoClient, ServerApiVersion } = require('mongodb');

// MongoDB connection string from environment variable
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'naba-ali';

if (!uri) {
  console.error('⚠️  Warning: MONGODB_URI not found in environment variables');
  console.error('   Chat messages will not be persisted to database');
  console.error('   Create a .env file with MONGODB_URI to enable database storage');
}

// MongoDB client configuration
const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

let client;
let clientPromise;
let isConnected = false;

/**
 * Connect to MongoDB
 */
async function connectToDatabase() {
  if (!uri) {
    return { connected: false, database: null, error: 'No MongoDB URI provided' };
  }

  try {
    if (!clientPromise) {
      client = new MongoClient(uri, options);
      clientPromise = client.connect();
    }

    const connectedClient = await clientPromise;
    const database = connectedClient.db(dbName);
    isConnected = true;

    console.log('✅ Connected to MongoDB database:', dbName);
    
    return { connected: true, database, error: null };
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    isConnected = false;
    return { connected: false, database: null, error: error.message };
  }
}

/**
 * Get a specific collection
 */
async function getCollection(collectionName) {
  try {
    const { database, connected } = await connectToDatabase();
    
    if (!connected || !database) {
      return null;
    }

    return database.collection(collectionName);
  } catch (error) {
    console.error(`❌ Failed to get collection ${collectionName}:`, error.message);
    return null;
  }
}

/**
 * Save a message to database
 */
async function saveMessage(messageData) {
  try {
    const messages = await getCollection('chatMessages');
    
    if (!messages) {
      console.warn('⚠️  Database not available, message not saved');
      return { success: false, error: 'Database not available' };
    }

    const message = {
      conversationId: messageData.conversationId,
      senderId: messageData.senderId,
      senderName: messageData.senderName,
      senderRole: messageData.senderRole || 'user',
      message: messageData.message,
      timestamp: messageData.timestamp || new Date(),
      isRead: false
    };

    const result = await messages.insertOne(message);

    // Update conversation last message
    const conversations = await getCollection('chatConversations');
    if (conversations) {
      await conversations.updateOne(
        { userId: messageData.conversationId },
        { 
          $set: { 
            lastMessage: messageData.message.substring(0, 100),
            lastMessageTime: message.timestamp
          },
          $inc: { unreadCount: messageData.senderRole === 'admin' ? 0 : 1 }
        }
      );
    }

    console.log(`💾 Message saved to database: ${result.insertedId}`);
    
    return { 
      success: true, 
      messageId: result.insertedId,
      message: { ...message, _id: result.insertedId }
    };
  } catch (error) {
    console.error('❌ Failed to save message:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Mark messages as read
 */
async function markMessagesAsRead(conversationId, senderRole = 'user') {
  try {
    const messages = await getCollection('chatMessages');
    
    if (!messages) {
      return { success: false, error: 'Database not available' };
    }

    // Mark all messages in conversation as read (except sender's own messages)
    const result = await messages.updateMany(
      { 
        conversationId,
        senderRole: { $ne: senderRole },
        isRead: false
      },
      { $set: { isRead: true } }
    );

    // Reset unread count in conversation
    const conversations = await getCollection('chatConversations');
    if (conversations) {
      await conversations.updateOne(
        { userId: conversationId },
        { $set: { unreadCount: 0 } }
      );
    }

    console.log(`✓ Marked ${result.modifiedCount} messages as read in ${conversationId}`);
    
    return { success: true, count: result.modifiedCount };
  } catch (error) {
    console.error('❌ Failed to mark messages as read:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get conversation messages
 */
async function getConversationMessages(conversationId, limit = 100) {
  try {
    const messages = await getCollection('chatMessages');
    
    if (!messages) {
      return { success: false, messages: [], error: 'Database not available' };
    }

    const messageList = await messages
      .find({ conversationId })
      .sort({ timestamp: 1 })
      .limit(limit)
      .toArray();

    return { success: true, messages: messageList };
  } catch (error) {
    console.error('❌ Failed to fetch messages:', error.message);
    return { success: false, messages: [], error: error.message };
  }
}

/**
 * Update user presence in database
 */
async function updateUserPresence(userId, online, role = 'user') {
  try {
    const conversations = await getCollection('chatConversations');
    
    if (!conversations) {
      return { success: false };
    }

    await conversations.updateOne(
      { userId },
      { 
        $set: { 
          isOnline: online,
          lastSeen: new Date()
        }
      }
    );

    return { success: true };
  } catch (error) {
    console.error('❌ Failed to update user presence:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Check if database is connected
 */
function isDatabaseConnected() {
  return isConnected && !!uri;
}

/**
 * Graceful shutdown
 */
async function closeDatabase() {
  try {
    if (client) {
      await client.close();
      console.log('✅ MongoDB connection closed');
    }
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error.message);
  }
}

module.exports = {
  connectToDatabase,
  getCollection,
  saveMessage,
  markMessagesAsRead,
  getConversationMessages,
  updateUserPresence,
  isDatabaseConnected,
  closeDatabase
};
