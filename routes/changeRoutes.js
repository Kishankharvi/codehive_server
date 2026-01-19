const express = require('express');
const router = express.Router();
const Change = require('../models/Change');
const Project = require('../models/Project');
const authMiddleware = require('../middleware/authMiddleware');
const diff = require('diff');
const fs = require('fs').promises;
const path = require('path');

// Get changes for a project/branch
router.get('/:projectId/:branch', authMiddleware, async (req, res) => {
    try {
        const { projectId, branch } = req.params;
        const { status } = req.query;

        const project = await Project.findById(projectId);

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check access
        const hasAccess = project.owner.equals(req.user._id) ||
            project.collaborators.some(c => c.user.equals(req.user._id));

        if (!hasAccess) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const query = { project: projectId, branch };
        if (status) {
            query.status = status;
        }

        const changes = await Change.find(query)
            .populate('author', 'username email avatar')
            .populate('reviewedBy', 'username email avatar')
            .sort({ createdAt: -1 });

        res.json({ changes });
    } catch (error) {
        console.error('Get changes error:', error);
        res.status(500).json({ message: 'Server error fetching changes' });
    }
});

// Submit a change
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { projectId, branch, filePath, changeType, newContent } = req.body;

        if (!projectId || !branch || !filePath || !changeType) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const project = await Project.findById(projectId);

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check if user is collaborator or owner
        const isOwner = project.owner.equals(req.user._id);
        const isCollaborator = project.collaborators.some(c => c.user.equals(req.user._id));

        if (!isOwner && !isCollaborator) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Get old content
        let oldContent = '';
        const fullPath = path.join(
            process.env.PROJECTS_PATH || './projects',
            projectId,
            branch,
            filePath
        );

        try {
            if (changeType !== 'create') {
                oldContent = await fs.readFile(fullPath, 'utf-8');
            }
        } catch (error) {
            // File might not exist for create operation
        }

        // Generate diff
        const diffResult = diff.createPatch(filePath, oldContent, newContent || '', '', '');

        // Create change record
        const change = new Change({
            project: projectId,
            branch,
            author: req.user._id,
            filePath,
            changeType,
            oldContent,
            newContent: newContent || '',
            diff: diffResult,
            status: isOwner ? 'approved' : 'pending' // Auto-approve owner's changes
        });

        await change.save();

        // If owner, apply change immediately
        if (isOwner) {
            await applyChange(projectId, branch, filePath, changeType, newContent);
            change.reviewedBy = req.user._id;
            change.reviewedAt = new Date();
            await change.save();
        }

        await change.populate('author', 'username email avatar');

        res.status(201).json({ change });
    } catch (error) {
        console.error('Submit change error:', error);
        res.status(500).json({ message: 'Server error submitting change' });
    }
});

// Approve a change
router.post('/:changeId/approve', authMiddleware, async (req, res) => {
    try {
        const change = await Change.findById(req.params.changeId)
            .populate('project');

        if (!change) {
            return res.status(404).json({ message: 'Change not found' });
        }

        const project = await Project.findById(change.project);

        // Only owner can approve
        if (!project.owner.equals(req.user._id)) {
            return res.status(403).json({ message: 'Only project owner can approve changes' });
        }

        if (change.status !== 'pending') {
            return res.status(400).json({ message: 'Change is not pending' });
        }

        // Apply the change
        await applyChange(
            project._id.toString(),
            change.branch,
            change.filePath,
            change.changeType,
            change.newContent
        );

        // Update change status
        change.status = 'approved';
        change.reviewedBy = req.user._id;
        change.reviewedAt = new Date();
        change.reviewComment = req.body.comment || '';

        await change.save();
        await change.populate('author', 'username email avatar');
        await change.populate('reviewedBy', 'username email avatar');

        res.json({ change });
    } catch (error) {
        console.error('Approve change error:', error);
        res.status(500).json({ message: 'Server error approving change' });
    }
});

// Reject a change
router.post('/:changeId/reject', authMiddleware, async (req, res) => {
    try {
        const change = await Change.findById(req.params.changeId)
            .populate('project');

        if (!change) {
            return res.status(404).json({ message: 'Change not found' });
        }

        const project = await Project.findById(change.project);

        // Only owner can reject
        if (!project.owner.equals(req.user._id)) {
            return res.status(403).json({ message: 'Only project owner can reject changes' });
        }

        if (change.status !== 'pending') {
            return res.status(400).json({ message: 'Change is not pending' });
        }

        // Update change status
        change.status = 'rejected';
        change.reviewedBy = req.user._id;
        change.reviewedAt = new Date();
        change.reviewComment = req.body.comment || '';

        await change.save();
        await change.populate('author', 'username email avatar');
        await change.populate('reviewedBy', 'username email avatar');

        res.json({ change });
    } catch (error) {
        console.error('Reject change error:', error);
        res.status(500).json({ message: 'Server error rejecting change' });
    }
});

// Merge branch
router.post('/:projectId/merge/:branch', authMiddleware, async (req, res) => {
    try {
        const { projectId, branch } = req.params;
        const { targetBranch = 'main' } = req.body;

        const project = await Project.findById(projectId);

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Only owner can merge
        if (!project.owner.equals(req.user._id)) {
            return res.status(403).json({ message: 'Only project owner can merge branches' });
        }

        // Check for pending changes
        const pendingChanges = await Change.countDocuments({
            project: projectId,
            branch,
            status: 'pending'
        });

        if (pendingChanges > 0) {
            return res.status(400).json({
                message: 'Cannot merge branch with pending changes. Please review all changes first.'
            });
        }

        // Copy all files from source branch to target branch
        const projectPath = path.join(process.env.PROJECTS_PATH || './projects', projectId);
        const sourcePath = path.join(projectPath, branch);
        const targetPath = path.join(projectPath, targetBranch);

        const copyDir = async (src, dest) => {
            const entries = await fs.readdir(src, { withFileTypes: true });

            for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);

                if (entry.isDirectory()) {
                    await fs.mkdir(destPath, { recursive: true });
                    await copyDir(srcPath, destPath);
                } else {
                    await fs.copyFile(srcPath, destPath);
                }
            }
        };

        await copyDir(sourcePath, targetPath);

        // Update branch status
        const branchIndex = project.branches.findIndex(b => b.name === branch);
        if (branchIndex !== -1) {
            project.branches[branchIndex].status = 'merged';
            project.branches[branchIndex].mergedAt = new Date();
            await project.save();
        }

        res.json({ message: 'Branch merged successfully', project });
    } catch (error) {
        console.error('Merge branch error:', error);
        res.status(500).json({ message: 'Server error merging branch' });
    }
});

// Helper function to apply changes to file system
async function applyChange(projectId, branch, filePath, changeType, newContent) {
    const fullPath = path.join(
        process.env.PROJECTS_PATH || './projects',
        projectId,
        branch,
        filePath
    );

    try {
        if (changeType === 'delete') {
            await fs.unlink(fullPath);
        } else {
            // Ensure directory exists
            const dir = path.dirname(fullPath);
            await fs.mkdir(dir, { recursive: true });

            // Write file
            await fs.writeFile(fullPath, newContent || '', 'utf-8');
        }
    } catch (error) {
        console.error('Apply change error:', error);
        throw error;
    }
}

module.exports = router;
