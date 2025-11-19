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
const activeSessions = new Map(); // Track active test sessions

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Student joins with session info
  socket.on('join-session', ({ sessionId, email, role }) => {
    console.log(`${role} joined session:`, sessionId, email);

    socket.join(sessionId);
    socket.sessionId = sessionId;
    socket.email = email;
    socket.role = role; // 'student' or 'admin'

    // Track active session
    if (role === 'student') {
      if (!activeSessions.has(sessionId)) {
        activeSessions.set(sessionId, {
          sessionId,
          email,
          connectedAt: new Date(),
          studentSocketId: socket.id,
        });
      }

      // Notify all admins about active sessions
      io.emit('active-sessions', Array.from(activeSessions.values()));
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

    // Notify student that admin is monitoring
    const session = activeSessions.get(sessionId);
    if (session && session.studentSocketId) {
      io.to(session.studentSocketId).emit('admin-monitoring', {
        adminSocketId: socket.id,
      });
    }
  });

  // Session progress updates (current segment, time, etc)
  socket.on('session-update', (data) => {
    const session = activeSessions.get(socket.sessionId);
    if (session) {
      session.currentSegment = data.currentSegment;
      session.totalSegments = data.totalSegments;
      session.elapsedTime = data.elapsedTime;

      // Broadcast update to admins
      io.emit('session-progress', {
        sessionId: socket.sessionId,
        ...data,
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

    // Remove from active sessions if student
    if (socket.role === 'student' && socket.sessionId) {
      activeSessions.delete(socket.sessionId);
      io.emit('active-sessions', Array.from(activeSessions.values()));
    }
  });
});

server.listen(PORT, () => {
  console.log(`CIA Assessment Server running on port ${PORT}`);
  console.log(`WebSocket server ready for live monitoring`);
});
