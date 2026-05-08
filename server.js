const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const dotenv = require('dotenv');

// Import your custom files
const connectDB = require('./db');
const aiHelper = require('./ai-helper');

// Load Env
dotenv.config();

// Initialize App & Database
const app = express();
connectDB();

// ==========================================
// 1. GLOBAL MIDDLEWARE & SECURITY
// ==========================================
app.use(helmet({ crossOriginResourcePolicy: false })); // Secures HTTP headers 
app.use(cors({
    origin: [
        'https://tagme.buzz', 
        'https://www.tagme.buzz', 
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // OPTIONS is required for secure preflight requests
    credentials: true
}));
app.use(express.json()); // Parses incoming JSON

// Custom Sanitizer to prevent NoSQL Injection (Replaces the buggy express-mongo-sanitize)
app.use((req, res, next) => {
    const sanitize = (obj) => {
        if (obj instanceof Object) {
            for (let key in obj) {
                if (key.startsWith('$')) {
                    delete obj[key];
                } else {
                    sanitize(obj[key]);
                }
            }
        }
    };
    if (req.body) sanitize(req.body);
    if (req.query) sanitize(req.query);
    if (req.params) sanitize(req.params);
    next();
});

app.use(morgan('dev')); // Logs API requests to your terminal

// Rate Limiting (Protects against brute force and DDoS)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Limit each IP to 200 requests per window
    message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api', apiLimiter);

// Serve static files (Allows frontend to view uploaded images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==========================================
// 2. FILE UPLOAD CONFIG (MULTER)
// ==========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Make sure to create an 'uploads' folder in your backend!
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '-')}`);
    }
});
const upload = multer({ 
    storage, 
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max for videos/images
});

// ==========================================
// 3. MONGOOSE MODELS (Inline for Flat Structure)
// ==========================================
const UserSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatar: { type: String, default: 'https://i.pravatar.cc/150' },
    bio: { type: String, default: '' },
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

// ==========================================
// 4. AUTHENTICATION GATEKEEPER (Middleware)
// ==========================================
// Any route that uses 'protect' will require a valid JWT to access
const protect = (req, res, next) => {
    let token = req.headers.authorization;
    if (token && token.startsWith('Bearer')) {
        try {
            const decoded = jwt.verify(token.split(' ')[1], process.env.JWT_SECRET);
            req.user = decoded; // Attaches { id, email } to the request
            next();
        } catch (error) {
            res.status(401).json({ success: false, message: 'Token failed, unauthorized' });
        }
    } else {
        res.status(401).json({ success: false, message: 'No token provided, unauthorized' });
    }
};

// ==========================================
// 5. API ROUTES
// ==========================================

// --- A. AUTHENTICATION ROUTES ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;
        
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ success: false, message: 'User already exists' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({ firstName, lastName, email, password: hashedPassword });
        
        const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
        
        res.status(201).json({ success: true, token, user: { id: user._id, name: `${firstName} ${lastName}`, email, avatar: user.avatar } });
    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ success: false, message: "Server error during registration" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // 1. Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // 2. Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // 3. Success
        const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
        res.json({ success: true, token, user: { id: user._id, name: `${user.firstName} ${user.lastName}`, email: user.email, avatar: user.avatar } });
        
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: "Server error during login" });
    }
});

// --- B. PROFILE ROUTES ---
// Uses Multer 'upload.single' to handle profile picture changes
app.put('/api/profile', protect, upload.single('avatar'), async (req, res) => {
    try {
        const updates = { bio: req.body.bio, firstName: req.body.firstName, lastName: req.body.lastName };
        if (req.file) updates.avatar = `/uploads/${req.file.filename}`; // Save path to DB

        const updatedUser = await User.findByIdAndUpdate(req.user.id, updates, { new: true });
        res.json({ success: true, message: 'Profile updated', user: updatedUser });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- C. AI STUDIO ROUTES (Uses ai-helper.js) ---
app.post('/api/ai/generate', protect, async (req, res) => {
    try {
        const { product, audience, tone } = req.body;
        const adCopy = await aiHelper.generateAdCopy(product, audience, tone);
        res.json({ success: true, result: adCopy });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- D. CONTENT & POSTING (CAMPAIGNS) ---
// Uploading a new Ad with an image/video
app.post('/api/campaigns', protect, upload.single('media'), async (req, res) => {
    // Here you will save to a Mongoose 'Ad' or 'Campaign' model later
    const mediaPath = req.file ? `/uploads/${req.file.filename}` : null;
    res.status(201).json({ success: true, message: 'Campaign Created', data: { ...req.body, media: mediaPath } });
});

app.get('/api/campaigns', protect, async (req, res) => {
    res.json({ success: true, message: 'Fetching all user campaigns/drafts' });
});

// --- E. MESSAGING (CHAT) ---
app.get('/api/chat', protect, async (req, res) => {
    res.json({ success: true, message: 'Fetching user inbox and conversations' });
});
app.post('/api/chat/send', protect, async (req, res) => {
    res.json({ success: true, message: 'Message sent successfully' });
});

// --- F. NOTIFICATIONS ---
app.get('/api/notifications', protect, async (req, res) => {
    res.json({ success: true, message: 'Fetching unread notifications' });
});

// --- G. PLANNER, ORDERS & BILLING ---
app.get('/api/planner', protect, async (req, res) => {
    res.json({ success: true, message: 'Fetching scheduled calendar events' });
});
app.get('/api/orders', protect, async (req, res) => {
    res.json({ success: true, message: 'Fetching ad purchases and active orders' });
});
app.get('/api/billing', protect, async (req, res) => {
    res.json({ success: true, message: 'Fetching payment methods and invoices' });
});

// --- H. SETTINGS, HELP & FEEDBACK ---
app.put('/api/settings', protect, async (req, res) => {
    res.json({ success: true, message: 'Account settings updated securely' });
});
app.post('/api/feedback', protect, async (req, res) => {
    res.json({ success: true, message: 'Feedback submitted to admin team' });
});

// ==========================================
// 6. SERVER INITIALIZATION
// ==========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 TagME Backend running securely on port ${PORT}`);
});