const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Use a local MongoDB connection for development
    // You can change this to MongoDB Atlas URL later
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tourist-safety-db', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`❌ FATAL ERROR: Database connection failed: ${err.message}`);
    // Exit process with failure since we no longer support memory fallback
    process.exit(1);
  }
};

module.exports = connectDB;
