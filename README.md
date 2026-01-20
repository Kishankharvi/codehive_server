# CodeHive 🐝

A real-time collaborative coding platform where teams can clone GitHub repositories, work together on code, and manage changes through a branch-based approval workflow.

![CodeHive Banner](https://img.shields.io/badge/CodeHive-Collaborative%20Coding-6366f1?style=for-the-badge)

## ✨ Features

- **🔐 Authentication**
  - Email/Password registration and login
  - GitHub OAuth integration
  - JWT-based secure authentication

- **📁 Project Management**
  - Create new projects from scratch
  - Clone existing GitHub repositories
  - Invite collaborators with role-based permissions

- **🌿 Branch-Based Workflow**
  - Create multiple branches per project
  - Work on features in isolated branches
  - Merge branches after approval

- **💻 Real-Time Code Editing**
  - Monaco Editor (VS Code's editor)
  - Live cursor tracking
  - Real-time code synchronization
  - Multi-user presence indicators

- **✅ Change Approval System**
  - Collaborators submit changes for review
  - Project owners approve or reject changes
  - Diff visualization for code changes
  - Auto-approve for project owners

- **👥 Collaboration Features**
  - See who's online in real-time
  - Live cursor positions
  - User presence indicators
  - Real-time notifications

## 🛠️ Tech Stack

### Backend
- **Node.js** + **Express** - Server framework
- **MongoDB** + **Mongoose** - Database
- **Socket.io** - Real-time communication
- **JWT** - Authentication
- **Passport** - GitHub OAuth
- **simple-git** - Git operations
- **diff** - Change tracking

### Frontend
- **React** - UI framework
- **React Router** - Navigation
- **Monaco Editor** - Code editor
- **Socket.io Client** - Real-time sync
- **Axios** - HTTP client
- **React Hot Toast** - Notifications

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB (v5 or higher)
- Git
- GitHub OAuth App (for GitHub login)

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd FSADv1
```

### 2. Backend Setup

```bash
cd server
npm install

# Copy environment variables
cp .env.example .env
```

Edit `.env` and configure:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/codehive
JWT_SECRET=your_super_secret_jwt_key
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:5000/api/auth/github/callback
SESSION_SECRET=your_session_secret
CLIENT_URL=http://localhost:3000
PROJECTS_PATH=./projects
```

### 3. Frontend Setup

```bash
cd ../client
npm install

# Copy environment variables
cp .env.example .env
```

The `.env` file should contain:
```env
REACT_APP_API_URL=http://localhost:5000
REACT_APP_SOCKET_URL=http://localhost:5000
```

### 4. GitHub OAuth Setup

1. Go to GitHub Settings → Developer Settings → OAuth Apps
2. Create a new OAuth App
3. Set Authorization callback URL to: `http://localhost:5000/api/auth/github/callback`
4. Copy Client ID and Client Secret to server `.env`

### 5. Start MongoDB

```bash
# If using MongoDB locally
mongod
```

Or use MongoDB Atlas for cloud database.

### 6. Run the Application

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd client
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## 📖 Usage Guide

### 1. Register/Login
- Create an account with email/password
- Or use "Continue with GitHub" for OAuth login

### 2. Create or Clone a Project
- **New Project**: Click "New Project" and provide a name
- **Clone from GitHub**: Click "Clone from GitHub" and paste repository URL

### 3. Invite Collaborators
- Open a project
- Click "Add Collaborator"
- Enter their username and assign a role (Read/Write/Admin)

### 4. Create Branches
- Select a base branch
- Click "New Branch"
- Enter branch name
- Work on features in isolation

### 5. Edit Code
- Select a file from the file explorer
- Start editing in the Monaco editor
- See other users' cursors in real-time
- Press Ctrl+S (Cmd+S) to save

### 6. Submit Changes (Collaborators)
- Make your edits
- Click "Submit Change"
- Wait for project owner approval

### 7. Review Changes (Project Owners)
- View pending changes
- Review diffs
- Approve or reject changes
- Merge branches when ready

## 🏗️ Project Structure

```
FSADv1/
├── server/
│   ├── config/
│   │   ├── database.js
│   │   └── passport.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Project.js
│   │   └── Change.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── projectRoutes.js
│   │   └── changeRoutes.js
│   ├── sockets/
│   │   └── socketHandler.js
│   ├── middleware/
│   │   └── authMiddleware.js
│   ├── server.js
│   └── package.json
│
└── client/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── components/
    │   │   ├── CodeEditor.jsx
    │   │   └── FileExplorer.jsx
    │   ├── context/
    │   │   └── AuthContext.jsx
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Register.jsx
    │   │   ├── Dashboard.jsx
    │   │   └── ProjectView.jsx
    │   ├── services/
    │   │   ├── api.js
    │   │   └── socketService.js
    │   ├── App.jsx
    │   ├── index.js
    │   └── index.css
    └── package.json
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `GET /api/auth/github` - GitHub OAuth
- `GET /api/auth/github/callback` - GitHub callback

### Projects
- `GET /api/projects` - Get user's projects
- `POST /api/projects` - Create new project
- `POST /api/projects/clone` - Clone from GitHub
- `GET /api/projects/:id` - Get project details
- `POST /api/projects/:id/collaborators` - Add collaborator
- `POST /api/projects/:id/branches` - Create branch
- `GET /api/projects/:id/files/:branch` - Get file tree
- `GET /api/projects/:id/files/:branch/*` - Get file content

### Changes
- `GET /api/changes/:projectId/:branch` - Get changes
- `POST /api/changes` - Submit change
- `POST /api/changes/:id/approve` - Approve change
- `POST /api/changes/:id/reject` - Reject change
- `POST /api/changes/:projectId/merge/:branch` - Merge branch

## 🔌 Socket Events

### Client → Server
- `join-project` - Join project room
- `code-change` - Broadcast code change
- `cursor-move` - Update cursor position
- `file-open` - Notify file opened
- `change-submitted` - Notify change submission
- `change-reviewed` - Notify change review

### Server → Client
- `user-joined` - User joined project
- `user-left` - User left project
- `code-update` - Code changed by another user
- `cursor-update` - Cursor position updated
- `file-opened` - File opened by another user
- `new-change` - New change submitted
- `change-status-updated` - Change approved/rejected

## 🎨 Design Features

- **Modern Dark Theme** - Easy on the eyes
- **Glassmorphism Effects** - Premium UI aesthetics
- **Gradient Accents** - Vibrant color scheme
- **Smooth Animations** - Polished user experience
- **Responsive Design** - Works on all devices

## 🔒 Security

- Passwords hashed with bcrypt
- JWT tokens for authentication
- Protected API routes
- Input validation
- CORS configuration
- Session management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🐛 Known Issues

- Large files may take time to load
- Real-time sync may have slight delay on slow connections
- File uploads not yet implemented

## 🚧 Future Enhancements

- [ ] File upload and creation
- [ ] Code execution environment
- [ ] Video/voice chat
- [ ] Code review comments
- [ ] Pull request system
- [ ] Deployment integration
- [ ] Terminal access
- [ ] Git history visualization

## 📧 Support

For issues and questions, please open an issue on GitHub.

---

**Built with ❤️ using the MERN Stack**
