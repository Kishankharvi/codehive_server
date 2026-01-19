const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    collaborators: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        role: {
            type: String,
            enum: ['read', 'write', 'admin'],
            default: 'write'
        },
        addedAt: {
            type: Date,
            default: Date.now
        }
    }],
    githubRepo: {
        url: String,
        owner: String,
        name: String,
        clonedAt: Date
    },
    branches: [{
        name: {
            type: String,
            required: true
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        baseBranch: {
            type: String,
            default: 'main'
        },
        status: {
            type: String,
            enum: ['active', 'merged', 'rejected'],
            default: 'active'
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        mergedAt: Date
    }],
    mainBranch: {
        type: String,
        default: 'main'
    },
    fileStructure: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },
    settings: {
        allowPublicAccess: {
            type: Boolean,
            default: false
        },
        requireApproval: {
            type: Boolean,
            default: true
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
projectSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Project', projectSchema);
