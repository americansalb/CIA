const redis = require('redis');

// Create Redis client
const client = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'redis-14555.c309.us-east-2-1.ec2.cloud.redislabs.com',
    port: process.env.REDIS_PORT || 14555
  },
  password: process.env.REDIS_PASSWORD
});

client.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

client.on('connect', () => {
  console.log('✓ Connected to Redis Cloud');
});

// Connect to Redis
let isConnected = false;
(async () => {
  try {
    await client.connect();
    isConnected = true;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    console.error('Sessions will not persist across server restarts');
  }
})();

// Helper functions for session management
const SESSION_PREFIX = 'session:';
const SESSION_EXPIRY = 10800; // 3 hours in seconds

/**
 * Store a session in Redis
 * @param {string} sessionId - Session identifier
 * @param {object} data - Session data
 */
async function setSession(sessionId, data) {
  if (!isConnected) return;
  try {
    await client.setEx(
      `${SESSION_PREFIX}${sessionId}`,
      SESSION_EXPIRY,
      JSON.stringify(data)
    );
  } catch (error) {
    console.error('Error setting session:', error);
  }
}

/**
 * Retrieve a session from Redis
 * @param {string} sessionId - Session identifier
 * @returns {object|null} Session data or null if not found
 */
async function getSession(sessionId) {
  if (!isConnected) return null;
  try {
    const data = await client.get(`${SESSION_PREFIX}${sessionId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

/**
 * Check if a session exists
 * @param {string} sessionId - Session identifier
 * @returns {boolean} True if session exists
 */
async function hasSession(sessionId) {
  if (!isConnected) return false;
  try {
    const exists = await client.exists(`${SESSION_PREFIX}${sessionId}`);
    return exists === 1;
  } catch (error) {
    console.error('Error checking session:', error);
    return false;
  }
}

/**
 * Delete a session from Redis
 * @param {string} sessionId - Session identifier
 */
async function deleteSession(sessionId) {
  if (!isConnected) return;
  try {
    await client.del(`${SESSION_PREFIX}${sessionId}`);
  } catch (error) {
    console.error('Error deleting session:', error);
  }
}

/**
 * Get all active sessions
 * @returns {array} Array of all session objects
 */
async function getAllSessions() {
  if (!isConnected) return [];
  try {
    const keys = await client.keys(`${SESSION_PREFIX}*`);
    const sessions = [];

    for (const key of keys) {
      const data = await client.get(key);
      if (data) {
        sessions.push(JSON.parse(data));
      }
    }

    return sessions;
  } catch (error) {
    console.error('Error getting all sessions:', error);
    return [];
  }
}

/**
 * Update specific fields in a session (without replacing entire object)
 * @param {string} sessionId - Session identifier
 * @param {object} updates - Fields to update
 */
async function updateSession(sessionId, updates) {
  if (!isConnected) return;
  try {
    const existing = await getSession(sessionId);
    if (existing) {
      await setSession(sessionId, { ...existing, ...updates });
    }
  } catch (error) {
    console.error('Error updating session:', error);
  }
}

// Practice attempt logging
const PRACTICE_PREFIX = 'practice:';
const PRACTICE_LIST_KEY = 'practice_attempts';
const PRACTICE_EXPIRY = 604800; // 7 days in seconds

/**
 * Log a practice mode attempt
 * @param {object} attemptData - Practice attempt data
 */
async function logPracticeAttempt(attemptData) {
  if (!isConnected) return;
  try {
    const attempt = {
      ...attemptData,
      timestamp: new Date().toISOString(),
      id: `practice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    // Store individual attempt with expiry
    await client.setEx(
      `${PRACTICE_PREFIX}${attempt.id}`,
      PRACTICE_EXPIRY,
      JSON.stringify(attempt)
    );

    // Also add to list for easy retrieval
    await client.lPush(PRACTICE_LIST_KEY, JSON.stringify(attempt));
    // Trim list to last 1000 attempts
    await client.lTrim(PRACTICE_LIST_KEY, 0, 999);

    return attempt;
  } catch (error) {
    console.error('Error logging practice attempt:', error);
    return null;
  }
}

/**
 * Get all practice attempts
 * @param {number} limit - Maximum number of attempts to return
 * @returns {array} Array of practice attempts
 */
async function getPracticeAttempts(limit = 100) {
  if (!isConnected) return [];
  try {
    const attempts = await client.lRange(PRACTICE_LIST_KEY, 0, limit - 1);
    return attempts.map(a => JSON.parse(a));
  } catch (error) {
    console.error('Error getting practice attempts:', error);
    return [];
  }
}

module.exports = {
  client,
  setSession,
  getSession,
  hasSession,
  deleteSession,
  getAllSessions,
  updateSession,
  logPracticeAttempt,
  getPracticeAttempts
};
