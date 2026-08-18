const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { createServer } = require('http');
require('dotenv').config();

// Import database connection and routes
const connectDB = require('./config/database');
const authRoutes = require('./routes/auth');
const verificationRoutes = require('./routes/verification');
const tripRoutes = require('./routes/trip');
const locationRoutes = require('./routes/location');
const zoneRoutes = require('./routes/zone');
const incidentRoutes = require('./routes/incident');
const dashboardRoutes = require('./routes/dashboard');
const ledgerRoutes = require('./routes/ledger');
const SocketHandler = require('./socket/socketHandler');
const offlineWatcher = require('./services/offlineWatcher');
const { auth } = require('./middleware/auth');
const User = require('./models/User');
const Alert = require('./models/Alert');

const app = express();
const PORT = process.env.PORT || 5000;

// Create HTTP server for Socket.IO
const server = createServer(app);

// Initialize Socket.IO
const socketHandler = new SocketHandler(server);
// Make the socket handler available to route handlers (req.app.get('socketHandler'))
app.set('socketHandler', socketHandler);

// Connect to database
connectDB();

// Middleware - Configure helmet to allow Socket.IO CDN
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'",
        process.env.WS_URL || "ws://localhost:5000",
        process.env.WSS_URL || "wss://localhost:5000",
        process.env.API_BASE_URL || "http://localhost:5000"
      ]
    }
  }
}));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (for monitoring dashboard)
app.use(express.static(require('path').join(__dirname, 'public')));

// Basic route
app.get('/', (req, res) => {
  res.json({
    message: 'Smart Tourist Safety System API',
    version: '1.0.0',
    status: 'running'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api', verificationRoutes);
// New feature routes (Trip management, Location/Geofence/Offline sync, Zones,
// unified Incidents, Authority Dashboard aggregates, Tamper-evident Ledger)
app.use('/api/trip', tripRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/zone', zoneRoutes);
app.use('/api/incident', incidentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ledger', ledgerRoutes);

// Socket.IO stats endpoint
app.get('/api/socket/stats', (req, res) => {
  res.json(socketHandler.getStats());
});

// Alert statistics endpoint
app.get('/api/alerts/stats', (req, res) => {
  const stats = socketHandler.getAlertStats();
  res.json({
    success: true,
    stats: {
      totalAlerts: stats.totalAlerts || 0,
      activeAlerts: stats.activeAlerts || 0,
      resolvedAlerts: stats.resolvedAlerts || 0,
      lastAlert: stats.lastAlert || null
    }
  });
});

// Get all emergency alerts (for admin)
app.get('/api/alerts/emergency', (req, res) => {
  const alerts = socketHandler.getEmergencyAlerts();
  res.json({
    success: true,
    alerts: alerts || []
  });
});

// Resolve an alert (for admin)
app.post('/api/alerts/:alertId/resolve', (req, res) => {
  const { alertId } = req.params;
  const resolved = socketHandler.resolveAlert(alertId);
  
  if (resolved) {
    res.json({
      success: true,
      message: 'Alert resolved successfully'
    });
  } else {
    res.status(404).json({
      success: false,
      message: 'Alert not found'
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    socketStats: socketHandler.getStats()
  });
});

// Safe API Routes
app.post('/api/location/update', auth, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    await User.findByIdAndUpdate(req.user._id, {
      lastLocation: {
        type: 'Point',
        coordinates: [longitude, latitude],
        timestamp: new Date()
      }
    });
    res.json({ success: true, message: 'Location updated' });
  } catch (err) {
    console.error('Error updating location:', err);
    res.status(500).json({ success: false, message: 'Failed to update location' });
  }
});

app.post('/api/emergency/alert', auth, async (req, res) => {
  try {
    const { type, location, message } = req.body;
    const alert = await Alert.create({
      tourist: req.user._id,
      type: type || 'panic',
      location: {
        type: 'Point',
        coordinates: [location.longitude, location.latitude]
      },
      message
    });
    
    // Broadcast to admins via socket
    socketHandler.broadcastToAdmins('emergency_alert', {
      alertId: alert._id,
      userId: req.user._id,
      digitalId: req.user.digitalId,
      type: 'EMERGENCY',
      emergencyType: type || 'panic',
      location,
      timestamp: alert.createdAt,
      status: 'ACTIVE',
      message: message || 'Emergency alert triggered'
    });

    res.status(201).json({ success: true, alertId: alert._id });
  } catch (err) {
    console.error('Error triggering alert:', err);
    res.status(500).json({ success: false, message: 'Failed to trigger alert' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server with Socket.IO running on port ${PORT}`);
  console.log(`📱 Smart Tourist Safety System API`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server ready for real-time connections`);

  // Module 9: automatic "location updates stopped" detection - a background
  // watcher, not something an administrator has to trigger.
  offlineWatcher.start(socketHandler);
});

module.exports = app;
