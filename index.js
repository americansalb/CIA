require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.get('/api/health', require('./api/health'));
app.post('/api/validate-student', require('./api/validate-student'));
app.post('/api/validate-admin', require('./api/validate-admin'));
app.post('/api/upload-chunk', require('./api/upload-chunk'));
app.post('/api/upload-final', require('./api/upload-final'));
app.post('/api/create-session', require('./api/create-session'));
app.post('/api/join-proctor', require('./api/join-proctor'));
app.post('/api/confirm-proctor', require('./api/confirm-proctor'));
app.get('/api/session-status/:sessionId', require('./api/session-status'));
app.get('/api/recordings', require('./api/get-recordings'));
app.get('/api/session-chunks', require('./api/get-session-chunks'));
app.get('/api/stream-chunk', require('./api/stream-chunk'));
app.post('/api/update-grade', require('./api/update-grade'));
app.get('/api/tests', require('./api/get-tests'));
app.get('/api/test-config', require('./api/get-test-config'));
app.post('/api/save-test', require('./api/save-test'));
app.post('/api/split-and-upload', require('./api/split-and-upload'));
app.post('/api/save-emergency-state', require('./api/save-emergency-state'));

// Serve main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve proctor join page
app.get('/proctor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'proctor.html'));
});

// Socket.io for live monitoring and WebRTC signaling
const { setSession, getSession, hasSession, deleteSession, getAllSessions, updateSession } = require('./utils/redis-client');

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Student joins with session info
  socket.on('join-session', async ({ sessionId, email, role }) => {
    console.log(`${role} joined session:`, sessionId, email);

    socket.join(sessionId);
    socket.sessionId = sessionId;
    socket.email = email;
    socket.role = role; // 'student', 'proctor', or 'admin'

    // Track active session
    if (role === 'student') {
      const exists = await hasSession(sessionId);
      if (!exists) {
        await setSession(sessionId, {
          sessionId,
          email,
          connectedAt: new Date().toISOString(),
          studentSocketId: socket.id,
        });
      }

      // Notify all admins about active sessions
      const sessions = await getAllSessions();
      io.emit('active-sessions', sessions);
    }

    // If admin joins, send them current active sessions immediately
    if (role === 'admin') {
      const sessions = await getAllSessions();
      socket.emit('active-sessions', sessions);
    }
  });

  // WebRTC Signaling - relay signals between peers
  socket.on('signal', ({ sessionId, targetSocketId, signal, deviceType }) => {
    console.log(`Relaying signal for session ${sessionId}, device ${deviceType}`);

    // Forward signal to target socket (admin or student)
    if (targetSocketId) {
      io.to(targetSocketId).emit('signal', {
        sessionId,
        fromSocketId: socket.id,
        signal,
        deviceType,
        email: socket.email,
      });
    } else {
      // Broadcast to all in room (for initial connection)
      socket.to(sessionId).emit('signal', {
        sessionId,
        fromSocketId: socket.id,
        signal,
        deviceType,
        email: socket.email,
      });
    }
  });

  // Admin requests to monitor a student
  socket.on('monitor-student', ({ sessionId }) => {
    console.log(`Admin ${socket.id} monitoring session ${sessionId}`);
    socket.join(sessionId);

    // Notify all devices in this session (student + proctor) that admin is monitoring
    // This triggers both to send their WebRTC streams
    socket.to(sessionId).emit('admin-monitoring', {
      adminSocketId: socket.id,
    });
  });

  // Session progress updates (current segment, time, etc)
  socket.on('session-update', async (data) => {
    const session = await getSession(socket.sessionId);
    if (session) {
      await updateSession(socket.sessionId, {
        currentSegment: data.currentSegment,
        totalSegments: data.totalSegments,
        elapsedTime: data.elapsedTime
      });

      // Broadcast update to admins
      io.emit('session-progress', {
        sessionId: socket.sessionId,
        ...data,
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);

    // Remove from active sessions if student
    if (socket.role === 'student' && socket.sessionId) {
      await deleteSession(socket.sessionId);
      const sessions = await getAllSessions();
      io.emit('active-sessions', sessions);
    }
  });
});

server.listen(PORT, () => {
  console.log(`CIA Assessment Server running on port ${PORT}`);
  console.log(`WebSocket server ready for live monitoring`);
});
