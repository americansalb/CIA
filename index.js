require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.post('/api/validate-student', require('./api/validate-student'));
app.post('/api/validate-admin', require('./api/validate-admin'));
app.post('/api/upload-chunk', require('./api/upload-chunk'));
app.post('/api/upload-final', require('./api/upload-final'));
app.post('/api/create-session', require('./api/create-session'));
app.post('/api/join-proctor', require('./api/join-proctor'));
app.get('/api/session-status/:sessionId', require('./api/session-status'));
app.get('/api/recordings', require('./api/get-recordings'));
app.post('/api/update-grade', require('./api/update-grade'));

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

app.listen(PORT, () => {
  console.log(`CIA Assessment Server running on port ${PORT}`);
});
