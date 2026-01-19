const mongoose = require('mongoose');

const changeSchema = new mongoose.Schema({
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true
    },
    branch: {
        type: String,
        required: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    filePath: {
        type: String,
        required: true
    },
    changeType: {
        type: String,
        enum: ['create', 'modify', 'delete', 'rename'],
        required: true
    },
    oldContent: {
        type: String,
        default: ''
    },
    newContent: {
        type: String,
        default: ''
    },
    diff: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: Date,
    reviewComment: String,
    metadata: {
        lineNumber: Number,
        characterCount: Number,
        language: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index for faster queries
changeSchema.index({ project: 1, branch: 1, status: 1 });
changeSchema.index({ author: 1, status: 1 });

module.exports = mongoose.model('Change', changeSchema);
