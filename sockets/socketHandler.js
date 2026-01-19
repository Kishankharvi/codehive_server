const Project = require('../models/Project');
const Change = require('../models/Change');
const User = require('../models/User');
const fs = require('fs').promises;
const path = require('path');

class SocketHandler {
    constructor(io) {
        this.io = io;
        this.activeUsers = new Map(); // projectId -> Set of socket IDs
        this.userCursors = new Map(); // socketId -> cursor position
        this.socketToUser = new Map(); // socketId -> user info
    }

    initialize() {
        this.io.on('connection', (socket) => {
            console.log('User connected:', socket.id);

            // Join project room
            socket.on('join-project', async ({ projectId, userId, branch }) => {
                try {
                    const user = await User.findById(userId).select('username email avatar');
                    const project = await Project.findById(projectId);

                    if (!project) {
                        socket.emit('error', { message: 'Project not found' });
                        return;
                    }

                    // Check access
                    const hasAccess = project.owner.equals(userId) ||
                        project.collaborators.some(c => c.user.equals(userId));

                    if (!hasAccess) {
                        socket.emit('error', { message: 'Access denied' });
                        return;
                    }

                    const roomId = `${projectId}-${branch}`;
                    socket.join(roomId);

                    // Track active user
                    if (!this.activeUsers.has(roomId)) {
                        this.activeUsers.set(roomId, new Set());
                    }
                    this.activeUsers.get(roomId).add(socket.id);

                    // Store user info
                    this.socketToUser.set(socket.id, {
                        userId,
                        username: user.username,
                        avatar: user.avatar,
                        projectId,
                        branch,
                        roomId
                    });

                    // Notify others
                    const activeUsersList = this.getActiveUsersInRoom(roomId);
                    this.io.to(roomId).emit('user-joined', {
                        user: {
                            id: userId,
                            username: user.username,
                            avatar: user.avatar,
                            socketId: socket.id
                        },
                        activeUsers: activeUsersList
                    });

                    console.log(`User ${user.username} joined project ${projectId}, branch ${branch}`);
                } catch (error) {
                    console.error('Join project error:', error);
                    socket.emit('error', { message: 'Failed to join project' });
                }
            });

            // Handle code changes
            socket.on('code-change', async ({ projectId, branch, filePath, content, cursorPosition }) => {
                try {
                    const userInfo = this.socketToUser.get(socket.id);
                    if (!userInfo) return;

                    const roomId = `${projectId}-${branch}`;

                    // Broadcast to others in the room (excluding sender)
                    socket.to(roomId).emit('code-update', {
                        filePath,
                        content,
                        userId: userInfo.userId,
                        username: userInfo.username,
                        cursorPosition
                    });

                    // Update cursor position
                    this.userCursors.set(socket.id, {
                        filePath,
                        position: cursorPosition,
                        userId: userInfo.userId,
                        username: userInfo.username
                    });

                    // Broadcast cursor update
                    socket.to(roomId).emit('cursor-update', {
                        userId: userInfo.userId,
                        username: userInfo.username,
                        filePath,
                        position: cursorPosition
                    });
                } catch (error) {
                    console.error('Code change error:', error);
                }
            });

            // Handle cursor movement
            socket.on('cursor-move', ({ projectId, branch, filePath, position }) => {
                try {
                    const userInfo = this.socketToUser.get(socket.id);
                    if (!userInfo) return;

                    const roomId = `${projectId}-${branch}`;

                    this.userCursors.set(socket.id, {
                        filePath,
                        position,
                        userId: userInfo.userId,
                        username: userInfo.username
                    });

                    socket.to(roomId).emit('cursor-update', {
                        userId: userInfo.userId,
                        username: userInfo.username,
                        avatar: userInfo.avatar,
                        filePath,
                        position
                    });
                } catch (error) {
                    console.error('Cursor move error:', error);
                }
            });

            // Handle file open
            socket.on('file-open', ({ projectId, branch, filePath }) => {
                try {
                    const userInfo = this.socketToUser.get(socket.id);
                    if (!userInfo) return;

                    const roomId = `${projectId}-${branch}`;

                    socket.to(roomId).emit('file-opened', {
                        userId: userInfo.userId,
                        username: userInfo.username,
                        filePath
                    });
                } catch (error) {
                    console.error('File open error:', error);
                }
            });

            // Handle change submission
            socket.on('change-submitted', async ({ projectId, branch, changeId }) => {
                try {
                    const roomId = `${projectId}-${branch}`;

                    const change = await Change.findById(changeId)
                        .populate('author', 'username email avatar');

                    this.io.to(roomId).emit('new-change', { change });
                } catch (error) {
                    console.error('Change submitted error:', error);
                }
            });

            // Handle change approval/rejection
            socket.on('change-reviewed', async ({ projectId, branch, changeId, status }) => {
                try {
                    const roomId = `${projectId}-${branch}`;

                    const change = await Change.findById(changeId)
                        .populate('author', 'username email avatar')
                        .populate('reviewedBy', 'username email avatar');

                    this.io.to(roomId).emit('change-status-updated', { change, status });
                } catch (error) {
                    console.error('Change reviewed error:', error);
                }
            });

            // Handle disconnect
            socket.on('disconnect', () => {
                try {
                    const userInfo = this.socketToUser.get(socket.id);

                    if (userInfo) {
                        const { roomId, userId, username } = userInfo;

                        // Remove from active users
                        if (this.activeUsers.has(roomId)) {
                            this.activeUsers.get(roomId).delete(socket.id);

                            if (this.activeUsers.get(roomId).size === 0) {
                                this.activeUsers.delete(roomId);
                            }
                        }

                        // Remove cursor
                        this.userCursors.delete(socket.id);

                        // Notify others
                        const activeUsersList = this.getActiveUsersInRoom(roomId);
                        this.io.to(roomId).emit('user-left', {
                            userId,
                            username,
                            activeUsers: activeUsersList
                        });

                        this.socketToUser.delete(socket.id);
                    }

                    console.log('User disconnected:', socket.id);
                } catch (error) {
                    console.error('Disconnect error:', error);
                }
            });
        });
    }

    getActiveUsersInRoom(roomId) {
        const socketIds = this.activeUsers.get(roomId) || new Set();
        const users = [];

        for (const socketId of socketIds) {
            const userInfo = this.socketToUser.get(socketId);
            if (userInfo) {
                users.push({
                    id: userInfo.userId,
                    username: userInfo.username,
                    avatar: userInfo.avatar,
                    socketId
                });
            }
        }

        return users;
    }
}

module.exports = SocketHandler;
