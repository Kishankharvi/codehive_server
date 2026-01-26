const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

// Create new project
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Project name is required' });
        }

        // Create project
        const project = new Project({
            name,
            description,
            owner: req.user._id,
            branches: [{
                name: 'main',
                createdBy: req.user._id,
                baseBranch: null
            }]
        });

        await project.save();

        // Update user's owned projects
        await User.findByIdAndUpdate(req.user._id, {
            $push: { ownedProjects: project._id }
        });

        // Create project directory
        const projectPath = path.join(process.env.PROJECTS_PATH || './projects', project._id.toString());
        await fs.mkdir(projectPath, { recursive: true });
        await fs.mkdir(path.join(projectPath, 'main'), { recursive: true });

        res.status(201).json({ project });
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ message: 'Server error creating project' });
    }
});

// Clone from GitHub
router.post('/clone', authMiddleware, async (req, res) => {
    try {
        const { repoUrl, name, description } = req.body;

        if (!repoUrl) {
            return res.status(400).json({ message: 'Repository URL is required' });
        }

        // Parse GitHub URL
        const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
        if (!urlMatch) {
            return res.status(400).json({ message: 'Invalid GitHub repository URL' });
        }

        const [, repoOwner, repoName] = urlMatch;

        // Create project
        const project = new Project({
            name: name || repoName,
            description,
            owner: req.user._id,
            githubRepo: {
                url: repoUrl,
                owner: repoOwner,
                name: repoName,
                clonedAt: new Date()
            },
            branches: [{
                name: 'main',
                createdBy: req.user._id,
                baseBranch: null
            }]
        });

        await project.save();

        // Update user's owned projects
        await User.findByIdAndUpdate(req.user._id, {
            $push: { ownedProjects: project._id }
        });

        // Clone repository
        const projectPath = path.join(process.env.PROJECTS_PATH || './projects', project._id.toString());
        const mainBranchPath = path.join(projectPath, 'main');

        try {
            await fs.mkdir(projectPath, { recursive: true });

            const git = simpleGit();
            await git.clone(repoUrl, mainBranchPath);

            res.status(201).json({ project });
        } catch (gitError) {
            // Cleanup on git error
            await Project.findByIdAndDelete(project._id);
            await User.findByIdAndUpdate(req.user._id, {
                $pull: { ownedProjects: project._id }
            });

            throw gitError;
        }
    } catch (error) {
        console.error('Clone project error:', error);
        res.status(500).json({ message: 'Server error cloning repository' });
    }
});

// Get user's projects
router.get('/', authMiddleware, async (req, res) => {
    try {
        const ownedProjects = await Project.find({ owner: req.user._id })
            .populate('owner', 'username email avatar')
            .populate('collaborators.user', 'username email avatar');

        const collaboratingProjects = await Project.find({
            'collaborators.user': req.user._id
        })
            .populate('owner', 'username email avatar')
            .populate('collaborators.user', 'username email avatar');

        res.json({
            ownedProjects,
            collaboratingProjects
        });
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({ message: 'Server error fetching projects' });
    }
});

// Get single project
router.get('/:projectId', authMiddleware, async (req, res) => {
    try {
        const project = await Project.findById(req.params.projectId)
            .populate('owner', 'username email avatar')
            .populate('collaborators.user', 'username email avatar')
            .populate('branches.createdBy', 'username email avatar');

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check access
        const hasAccess = project.owner._id.equals(req.user._id) ||
            project.collaborators.some(c => c.user._id.equals(req.user._id));

        if (!hasAccess) {
            return res.status(403).json({ message: 'Access denied' });
        }

        res.json({ project });
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({ message: 'Server error fetching project' });
    }
});

// Add collaborator
router.post('/:projectId/collaborators', authMiddleware, async (req, res) => {
    try {
        const { username, role = 'write' } = req.body;
        console.log(`[Server] Adding collaborator: ${username} to project ${req.params.projectId} with role ${role}`);

        const project = await Project.findById(req.params.projectId);

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check if user is owner
        if (!project.owner.equals(req.user._id)) {
            return res.status(403).json({ message: 'Only project owner can add collaborators' });
        }

        // Find user to add
        const userToAdd = await User.findOne({ username });
        if (!userToAdd) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if already collaborator
        if (project.collaborators.some(c => c.user.equals(userToAdd._id))) {
            return res.status(400).json({ message: 'User is already a collaborator' });
        }

        // Add collaborator
        project.collaborators.push({
            user: userToAdd._id,
            role
        });

        await project.save();

        // Update user's collaborating projects
        await User.findByIdAndUpdate(userToAdd._id, {
            $push: { collaboratingProjects: project._id }
        });

        await project.populate('collaborators.user', 'username email avatar');

        res.json({ project });
    } catch (error) {
        console.error('Add collaborator error:', error);
        res.status(500).json({ message: 'Server error adding collaborator' });
    }
});

// Create new branch
router.post('/:projectId/branches', authMiddleware, async (req, res) => {
    try {
        const { branchName, baseBranch = 'main' } = req.body;

        if (!branchName) {
            return res.status(400).json({ message: 'Branch name is required' });
        }

        const project = await Project.findById(req.params.projectId);

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check access
        const hasAccess = project.owner.equals(req.user._id) ||
            project.collaborators.some(c => c.user.equals(req.user._id));

        if (!hasAccess) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Check if branch already exists
        if (project.branches.some(b => b.name === branchName)) {
            return res.status(400).json({ message: 'Branch already exists' });
        }

        // Create branch
        project.branches.push({
            name: branchName,
            createdBy: req.user._id,
            baseBranch
        });

        await project.save();

        // Copy files from base branch
        const projectPath = path.join(process.env.PROJECTS_PATH || './projects', project._id.toString());
        const basePath = path.join(projectPath, baseBranch);
        const newBranchPath = path.join(projectPath, branchName);

        await fs.mkdir(newBranchPath, { recursive: true });

        // Copy files recursively
        const copyDir = async (src, dest) => {
            try {
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
            } catch (error) {
                // Base branch might be empty
                console.log('Copy dir warning:', error.message);
            }
        };

        await copyDir(basePath, newBranchPath);

        await project.populate('branches.createdBy', 'username email avatar');

        res.status(201).json({ project });
    } catch (error) {
        console.error('Create branch error:', error);
        res.status(500).json({ message: 'Server error creating branch' });
    }
});

// Get file tree for a branch
router.get('/:projectId/files/:branch', authMiddleware, async (req, res) => {
    try {
        const { projectId, branch } = req.params;

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

        const projectPath = path.join(process.env.PROJECTS_PATH || './projects', projectId, branch);

        const buildFileTree = async (dirPath, relativePath = '') => {
            try {
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                const tree = [];

                for (const entry of entries) {
                    if (entry.name.startsWith('.')) continue; // Skip hidden files

                    const fullPath = path.join(dirPath, entry.name);
                    const relPath = path.join(relativePath, entry.name);

                    if (entry.isDirectory()) {
                        tree.push({
                            name: entry.name,
                            path: relPath,
                            type: 'directory',
                            children: await buildFileTree(fullPath, relPath)
                        });
                    } else {
                        const stats = await fs.stat(fullPath);
                        tree.push({
                            name: entry.name,
                            path: relPath,
                            type: 'file',
                            size: stats.size
                        });
                    }
                }

                return tree;
            } catch (error) {
                return [];
            }
        };

        const fileTree = await buildFileTree(projectPath);

        res.json({ fileTree });
    } catch (error) {
        console.error('Get file tree error:', error);
        res.status(500).json({ message: 'Server error fetching file tree' });
    }
});

// Get file content
router.get('/:projectId/files/:branch/*', authMiddleware, async (req, res) => {
    try {
        const { projectId, branch } = req.params;
        const filePath = req.params[0];

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

        const fullPath = path.join(process.env.PROJECTS_PATH || './projects', projectId, branch, filePath);

        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            res.json({ content, path: filePath });
        } catch (error) {
            res.status(404).json({ message: 'File not found' });
        }
    } catch (error) {
        console.error('Get file content error:', error);
        res.status(500).json({ message: 'Server error fetching file' });
    }
});

// Create new file
router.post('/:projectId/files/:branch/create', authMiddleware, async (req, res) => {
    try {
        const { projectId, branch } = req.params;
        const { filePath, content = '' } = req.body;

        if (!filePath) {
            return res.status(400).json({ message: 'File path is required' });
        }

        const project = await Project.findById(projectId);

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check write access
        const isOwner = project.owner.equals(req.user._id);
        const hasWriteAccess = project.collaborators.some(c =>
            c.user.equals(req.user._id) && (c.role === 'write' || c.role === 'admin')
        );

        if (!isOwner && !hasWriteAccess) {
            return res.status(403).json({ message: 'Write access denied' });
        }

        const fullPath = path.join(process.env.PROJECTS_PATH || './projects', projectId, branch, filePath);

        // Check if file already exists
        try {
            await fs.access(fullPath);
            return res.status(400).json({ message: 'File already exists' });
        } catch {
            // File doesn't exist, proceed to create
        }

        // Ensure directory exists
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });

        // Create file
        await fs.writeFile(fullPath, content, 'utf-8');

        res.status(201).json({ message: 'File created successfully', path: filePath });
    } catch (error) {
        console.error('Create file error:', error);
        res.status(500).json({ message: 'Server error creating file' });
    }
});

// Delete file or directory
router.delete('/:projectId/files/:branch/*', authMiddleware, async (req, res) => {
    try {
        const { projectId, branch } = req.params;
        const filePath = req.params[0];

        if (!filePath) {
            return res.status(400).json({ message: 'File path is required' });
        }

        const project = await Project.findById(projectId);

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check write access
        const isOwner = project.owner.equals(req.user._id);
        const hasWriteAccess = project.collaborators.some(c =>
            c.user.equals(req.user._id) && (c.role === 'write' || c.role === 'admin')
        );

        if (!isOwner && !hasWriteAccess) {
            return res.status(403).json({ message: 'Write access denied' });
        }

        const fullPath = path.join(process.env.PROJECTS_PATH || './projects', projectId, branch, filePath);

        // Check if path exists
        try {
            const stats = await fs.stat(fullPath);

            if (stats.isDirectory()) {
                // Delete directory recursively
                await fs.rm(fullPath, { recursive: true, force: true });
            } else {
                // Delete file
                await fs.unlink(fullPath);
            }

            res.json({ message: 'Deleted successfully', path: filePath });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({ message: 'File or directory not found' });
            }
            throw error;
        }
    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ message: 'Server error deleting file' });
    }
});

// Rename file or directory
router.put('/:projectId/files/:branch/rename', authMiddleware, async (req, res) => {
    try {
        const { projectId, branch } = req.params;
        const { oldPath, newPath } = req.body;

        if (!oldPath || !newPath) {
            return res.status(400).json({ message: 'Both old and new paths are required' });
        }

        const project = await Project.findById(projectId);

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check write access
        const isOwner = project.owner.equals(req.user._id);
        const hasWriteAccess = project.collaborators.some(c =>
            c.user.equals(req.user._id) && (c.role === 'write' || c.role === 'admin')
        );

        if (!isOwner && !hasWriteAccess) {
            return res.status(403).json({ message: 'Write access denied' });
        }

        const basePath = path.join(process.env.PROJECTS_PATH || './projects', projectId, branch);
        const oldFullPath = path.join(basePath, oldPath);
        const newFullPath = path.join(basePath, newPath);

        // Check if old path exists
        try {
            await fs.access(oldFullPath);
        } catch {
            return res.status(404).json({ message: 'File or directory not found' });
        }

        // Check if new path already exists
        try {
            await fs.access(newFullPath);
            return res.status(400).json({ message: 'Destination already exists' });
        } catch {
            // New path doesn't exist, proceed
        }

        // Ensure destination directory exists
        const newDir = path.dirname(newFullPath);
        await fs.mkdir(newDir, { recursive: true });

        // Rename
        await fs.rename(oldFullPath, newFullPath);

        res.json({ message: 'Renamed successfully', oldPath, newPath });
    } catch (error) {
        console.error('Rename file error:', error);
        res.status(500).json({ message: 'Server error renaming file' });
    }
});

// Create new directory
router.post('/:projectId/directories/:branch/create', authMiddleware, async (req, res) => {
    try {
        const { projectId, branch } = req.params;
        const { dirPath } = req.body;

        if (!dirPath) {
            return res.status(400).json({ message: 'Directory path is required' });
        }

        const project = await Project.findById(projectId);

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check write access
        const isOwner = project.owner.equals(req.user._id);
        const hasWriteAccess = project.collaborators.some(c =>
            c.user.equals(req.user._id) && (c.role === 'write' || c.role === 'admin')
        );

        if (!isOwner && !hasWriteAccess) {
            return res.status(403).json({ message: 'Write access denied' });
        }

        const fullPath = path.join(process.env.PROJECTS_PATH || './projects', projectId, branch, dirPath);

        // Check if directory already exists
        try {
            await fs.access(fullPath);
            return res.status(400).json({ message: 'Directory already exists' });
        } catch {
            // Directory doesn't exist, proceed
        }

        // Create directory
        await fs.mkdir(fullPath, { recursive: true });

        res.status(201).json({ message: 'Directory created successfully', path: dirPath });
    } catch (error) {
        console.error('Create directory error:', error);
        res.status(500).json({ message: 'Server error creating directory' });
    }
});

module.exports = router;

