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
app.set('trust proxy', 1); // Add this line right here!
connectDB();

// ==========================================
// 1. GLOBAL MIDDLEWARE & SECURITY
// ==========================================
app.set('trust proxy', 1); 

// Simplify this block to avoid double headers
app.use(cors({
    origin: 'https://tagme.buzz', 
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());

// Custom Sanitizer to prevent NoSQL Injection
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
    max: 300, 
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
        cb(null, 'uploads/'); 
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '-')}`);
    }
});
const upload = multer({ 
    storage, 
    limits: { fileSize: 50 * 1024 * 1024 } 
});

// ==========================================
// 3. MONGOOSE MODELS (The Data Layer)
// ==========================================

// --- USER ---
const UserSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatar: { type: String, default: 'https://i.pravatar.cc/150' },
    bio: { type: String, default: '' },
}, { timestamps: true });
const User = mongoose.model('User', UserSchema);

// --- CAMPAIGN ---
const CampaignSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    media: { type: String, default: null },
    location: { type: String, default: 'ea' },
    budget: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 }
}, { timestamps: true });
const Campaign = mongoose.model('Campaign', CampaignSchema);

// --- MESSAGES (CHAT) ---
const MessageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    read: { type: Boolean, default: false }
}, { timestamps: true });
const Message = mongoose.model('Message', MessageSchema);

// --- NOTIFICATIONS ---
const NotificationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    link: { type: String, default: '/' }
}, { timestamps: true });
const Notification = mongoose.model('Notification', NotificationSchema);

// --- ORDERS & BILLING ---
const OrderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    paymentMethod: { type: String, default: 'M-PESA' } 
}, { timestamps: true });
const Order = mongoose.model('Order', OrderSchema);

// --- FEEDBACK ---
const FeedbackSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: { type: String, required: true }
}, { timestamps: true });
const Feedback = mongoose.model('Feedback', FeedbackSchema);

// ==========================================
// 4. AUTHENTICATION GATEKEEPER
// ==========================================
const protect = (req, res, next) => {
    let token = req.headers.authorization;
    if (token && token.startsWith('Bearer')) {
        try {
            const decoded = jwt.verify(token.split(' ')[1], process.env.JWT_SECRET);
            req.user = decoded; 
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

// --- A. AUTHENTICATION ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ success: false, message: 'User already exists' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({ firstName, lastName, email, password: hashedPassword });
        
        await Notification.create({ user: user._id, title: 'Welcome to TagME', body: 'Set up your profile to start creating campaigns!' });

        const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
        res.status(201).json({ success: true, token, user: { id: user._id, name: `${firstName} ${lastName}`, email, avatar: user.avatar } });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error during registration" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
        res.json({ success: true, token, user: { id: user._id, name: `${user.firstName} ${user.lastName}`, email: user.email, avatar: user.avatar } });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error during login" });
    }
});

// --- B. PROFILE ---
app.put('/api/profile', protect, upload.single('avatar'), async (req, res) => {
    try {
        const updates = { bio: req.body.bio, firstName: req.body.firstName, lastName: req.body.lastName };
        if (req.file) updates.avatar = `/uploads/${req.file.filename}`; 

        const updatedUser = await User.findByIdAndUpdate(req.user.id, updates, { new: true });
        res.json({ success: true, message: 'Profile updated', user: updatedUser });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- C. AI STUDIO ---
app.post('/api/ai/generate', protect, async (req, res) => {
    try {
        const { product, audience, tone } = req.body;
        const adCopy = await aiHelper.generateAdCopy(product, audience, tone);
        res.json({ success: true, result: adCopy });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- D. CAMPAIGNS ---
app.post('/api/campaigns', protect, upload.single('media'), async (req, res) => {
    try {
        const mediaPath = req.file ? `/uploads/${req.file.filename}` : null;
        const newCampaign = await Campaign.create({
            author: req.user.id,
            title: req.body.title,
            description: req.body.description,
            location: req.body.location,
            budget: req.body.budget,
            media: mediaPath
        });
        res.status(201).json({ success: true, message: 'Campaign Created', campaign: newCampaign });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create campaign' });
    }
});

app.get('/api/campaigns', protect, async (req, res) => {
    try {
        const campaigns = await Campaign.find()
            .populate('author', 'firstName lastName avatar')
            .sort({ createdAt: -1 }); 
        res.json({ success: true, campaigns });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch campaigns' });
    }
});

// --- E. MESSAGING (CHAT) ---
app.get('/api/chat', protect, async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [{ sender: req.user.id }, { recipient: req.user.id }]
        }).populate('sender recipient', 'firstName lastName avatar').sort({ createdAt: -1 });
        
        res.json({ success: true, messages });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch chat history' });
    }
});

app.post('/api/chat/send', protect, async (req, res) => {
    try {
        const { recipientId, message } = req.body;
        if (!recipientId || !message) return res.status(400).json({ success: false, message: 'Recipient and message required' });

        const newMsg = await Message.create({
            sender: req.user.id,
            recipient: recipientId,
            text: message
        });

        res.status(201).json({ success: true, message: 'Sent', data: newMsg });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to send message' });
    }
});

// --- F. NOTIFICATIONS ---
app.get('/api/notifications', protect, async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 });
        res.json({ success: true, notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
});

// --- G. PLANNER, ORDERS & BILLING ---
app.get('/api/orders', protect, async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user.id }).populate('campaign', 'title');
        res.json({ success: true, orders });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch orders' });
    }
});

app.get('/api/planner', protect, async (req, res) => {
    res.json({ success: true, message: 'Planner module active', events: [] });
});

app.get('/api/billing', protect, async (req, res) => {
    res.json({ success: true, balance: 0.00, currency: 'USD' });
});

// --- H. SETTINGS & FEEDBACK ---
app.put('/api/settings', protect, async (req, res) => {
    res.json({ success: true, message: 'Account settings updated securely' });
});

app.post('/api/feedback', protect, async (req, res) => {
    try {
        await Feedback.create({
            user: req.user.id,
            message: req.body.message
        });
        res.status(201).json({ success: true, message: 'Feedback submitted to admin team' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to submit feedback' });
    }
});

// ==========================================
// 6. SERVER INITIALIZATION
// ==========================================
const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
    console.log(`🚀 TagME Backend running securely on port ${PORT}`);
});