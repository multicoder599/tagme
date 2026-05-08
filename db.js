const mongoose = require('mongoose');
require('dotenv').config();

/**
 * TagME Database Connector
 * Establishes a secure connection to MongoDB using Mongoose.
 */
const connectDB = async () => {
    try {
        // Mongoose 6+ no longer requires strict options like useNewUrlParser
        const conn = await mongoose.connect(process.env.MONGO_URI);
        
        console.log(`✅ MongoDB Securely Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Database Connection Failed: ${error.message}`);
        
        // If the database doesn't connect, the server shouldn't run.
        // process.exit(1) forcefully stops the Node.js process.
        process.exit(1); 
    }
};

module.exports = connectDB;