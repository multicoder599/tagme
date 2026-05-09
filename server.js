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
app.set('trust proxy', 1);
connectDB();

// ==========================================
// 1. GLOBAL MIDDLEWARE & SECURITY
// ==========================================
app.use(cors({
    origin: 'https://tagme.buzz', 
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());

// Custom Sanitizer
app.use((req, res, next) => {
    const sanitize = (obj) => {
        if (obj instanceof Object) {
            for (let key in obj) {
                if (key.startsWith('$')) delete obj[key];
                else sanitize(obj[key]);
            }
        }
    };
    if (req.body) sanitize(req.body);
    if (req.query) sanitize(req.query);
    if (req.params) sanitize(req.params);
    next();
});

app.use(morgan('dev'));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300, 
    message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api', apiLimiter);

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==========================================
// 2. FILE UPLOAD CONFIG (MULTER)
// ==========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '-')}`)
});
const upload = multer({ 
    storage, 
    limits: { fileSize: 50 * 1024 * 1024 } 
});

// ==========================================
// 3. MONGOOSE MODELS
// ==========================================

const UserSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatar: { type: String, default: null },
    bio: { type: String, default: '' },
    firstPostDate: { type: Date, default: null }, // 24hr Free Logic
    preferences: { 
        alerts: { type: Boolean, default: true },
        dms: { type: Boolean, default: true },
        marketingNews: { type: Boolean, default: false }
    }
}, { timestamps: true });
const User = mongoose.model('User', UserSchema);

const CampaignSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    media: { type: [String], default: [] }, // Array for multiple images
    location: { type: String, default: 'all-kenya' },
    budget: { type: Number, default: 0 },
    // Extended status to include 'review'
    status: { type: String, enum: ['published', 'draft', 'scheduled', 'review'], default: 'review' },
    scheduledFor: { type: Date, default: null },
    views: { type: Number, default: 0 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [{ 
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        text: String,
        date: { type: Date, default: Date.now }
    }]
}, { timestamps: true });
const Campaign = mongoose.model('Campaign', CampaignSchema);

const MessageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    read: { type: Boolean, default: false }
}, { timestamps: true });
const Message = mongoose.model('Message', MessageSchema);

const NotificationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    isRead: { type: Boolean, default: false }
}, { timestamps: true });
const Notification = mongoose.model('Notification', NotificationSchema);

const OrderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    amount: { type: Number, required: true },
    isFree: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
    paymentMethod: { type: String, default: 'M-PESA' } 
}, { timestamps: true });
const Order = mongoose.model('Order', OrderSchema);

const FeedbackSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, required: true },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    screenshot: { type: String, default: null }
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

// --- AUTHENTICATION ---
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

// --- PROFILE & SETTINGS ---
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

app.put('/api/users/preferences', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const newPrefs = { ...user.preferences, ...req.body };
        await User.findByIdAndUpdate(req.user.id, { preferences: newPrefs });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update preferences' });
    }
});

app.put('/api/users/password', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!(await bcrypt.compare(req.body.currentPassword, user.password))) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(req.body.newPassword, salt);
        await user.save();
        res.json({ success: true, message: 'Password updated securely' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error updating password' });
    }
});

app.delete('/api/users/delete', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!(await bcrypt.compare(req.body.password, user.password))) {
            return res.status(400).json({ success: false, message: 'Authentication failed. Incorrect password.' });
        }
        await User.findByIdAndDelete(req.user.id);
        res.json({ success: true, message: 'Account deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error deleting account' });
    }
});

app.post('/api/users/feedback', protect, upload.single('screenshot'), async (req, res) => {
    try {
        const mediaPath = req.file ? `/uploads/${req.file.filename}` : null;
        await Feedback.create({
            user: req.user.id,
            type: req.body.type,
            subject: req.body.subject,
            description: req.body.description,
            screenshot: mediaPath
        });
        res.status(201).json({ success: true, message: 'Feedback submitted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to submit feedback' });
    }
});

// --- AI STUDIO ---
app.post('/api/ai/generate', protect, async (req, res) => {
    try {
        const { product, audience, tone, ageRange, gender } = req.body;
        const adCopy = await aiHelper.generateAdCopy(product, audience, tone, ageRange, gender);
        res.json({ success: true, result: adCopy });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- CAMPAIGNS & SCHEDULING ---
const processBilling = async (userId, budget, campaignId) => {
    const user = await User.findById(userId);
    const now = new Date();
    let isFree = false;

    // Trigger 24 Hour Free Logic based on FIRST post
    if (!user.firstPostDate) {
        user.firstPostDate = now;
        await user.save();
        isFree = true;
    } else {
        const timeDiffHours = Math.abs(now - user.firstPostDate) / 36e5;
        if (timeDiffHours <= 24) isFree = true;
    }

    await Order.create({
        user: userId,
        campaign: campaignId,
        amount: isFree ? 0 : budget,
        isFree: isFree,
        status: 'completed',
        paymentMethod: 'M-PESA'
    });
};

app.post('/api/campaigns', protect, upload.array('media', 4), async (req, res) => {
    try {
        const mediaPaths = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];
        const requestedStatus = req.body.status || 'review'; // Defaults to review from post.html
        
        const newCampaign = await Campaign.create({
            author: req.user.id,
            title: req.body.title,
            description: req.body.description,
            location: req.body.location || 'all-kenya',
            budget: req.body.budget,
            media: mediaPaths,
            status: requestedStatus
        });

        // Process Billing
        await processBilling(req.user.id, req.body.budget, newCampaign._id);

        // 5-MINUTE REVIEW DELAY LOGIC
        // If the user requested to publish (which sets status to 'review'), start the 5 min timer
        if (requestedStatus === 'review') {
            console.log(`[TagME] Campaign ${newCampaign._id} under review. Publishing in 5 mins.`);
            setTimeout(async () => {
                try {
                    await Campaign.findByIdAndUpdate(newCampaign._id, { status: 'published' });
                    console.log(`[TagME] Campaign ${newCampaign._id} successfully published after 5m review.`);
                } catch(err) {
                    console.error("Failed to auto-publish campaign after review:", err);
                }
            }, 5 * 60 * 1000); // 5 minutes in milliseconds
        }

        res.status(201).json({ success: true, message: 'Campaign Created', campaign: newCampaign });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create campaign' });
    }
});

app.post('/api/campaigns/schedule', protect, upload.array('media', 4), async (req, res) => {
    try {
        const mediaPaths = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];
        
        const scheduledDateStr = `${req.body.scheduleDate}T${req.body.scheduleTime}`;
        
        const newCampaign = await Campaign.create({
            author: req.user.id,
            title: req.body.title,
            description: req.body.description,
            location: req.body.location || 'all-kenya',
            budget: req.body.budget,
            media: mediaPaths,
            status: 'scheduled',
            scheduledFor: new Date(scheduledDateStr)
        });

        await processBilling(req.user.id, req.body.budget, newCampaign._id);
        res.status(201).json({ success: true, message: 'Campaign Scheduled', campaign: newCampaign });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to schedule campaign' });
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

// Added route for Deleting campaigns from content.html
app.delete('/api/campaigns/:id', protect, async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id);
        if(!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
        
        // Ensure only the author can delete it
        if(campaign.author.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this campaign' });
        }

        await Campaign.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Campaign deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete campaign' });
    }
});

// --- MESSAGING ---
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

// --- ORDERS ---
app.get('/api/orders', protect, async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user.id }).populate('campaign', 'title').sort({ createdAt: -1 });
        res.json({ success: true, orders });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch orders' });
    }
});

// ==========================================
// 6. SERVER INITIALIZATION
// ==========================================
const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
    console.log(`🚀 TagME Backend running securely on port ${PORT}`);
});