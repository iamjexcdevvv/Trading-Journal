# Trading Journal

A full-stack trading journal application for tracking and analyzing trading performance with customizable strategies and tags.

## Features

- **Trade Logging**: Add, edit, and delete trades with detailed information
- **PnL Analysis**: Visualize profit/loss performance over time
- **Customizable Strategies**: Define and manage your trading strategies (Long/Short)
- **Customizable Tags**: Create and manage tags for categorizing trades
- **Calculator**: Built-in trading calculator for position sizing and risk management
- **Google OAuth**: Sign in with Google for easy authentication
- **Responsive Design**: Works on desktop and mobile devices
- **Real-time Data**: Automatic data refresh with loading states

## Tech Stack

### Frontend
- **Vue 3** - Progressive JavaScript framework
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **TanStack Vue Query** - Data fetching and caching
- **Vue Router** - Client-side routing
- **Lucide Vue Next** - Icon library

### Backend
- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **MongoDB** - NoSQL database
- **Mongoose** - MongoDB object modeling
- **Passport** - Authentication middleware
- **Passport Google OAuth2** - Google authentication
- **JWT** - JSON Web Tokens for authentication
- **Bcrypt** - Password hashing

## Prerequisites

- Node.js (v18 or higher)
- MongoDB (local instance or MongoDB Atlas)
- Google Developer Account (for OAuth)

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd vue-project
```

### 2. Backend Setup

Navigate to the backend directory:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

Create environment variables:

Create a `.env.development` file for local development:

```env
MONGODB_URI=mongodb://localhost:27017/trading-journal
JWT_SECRET=your-secret-key-here
BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

Create a `.env.production` file for production:

```env
MONGODB_URI=your-production-mongodb-uri
JWT_SECRET=your-production-secret-key
BACKEND_URL=https://your-backend-url.com
FRONTEND_URL=https://your-frontend-url.com
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 3. Frontend Setup

Navigate to the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Create environment variables:

Create a `.env.development` file:

```env
VITE_API_BASE_URL=http://localhost:3000
```

Create a `.env.production` file:

```env
VITE_SOCKET_URL=https://your-backend-url.com
```

Production REST requests use the frontend origin and Vercel proxies `/api/*` to the backend.

### 4. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable Google+ API
4. Go to Credentials → Create Credentials → OAuth client ID
5. Select "Web application"
6. Add authorized redirect URIs:
   - Development: `http://localhost:3000/api/auth/google/callback`
   - Production: `https://your-frontend-url.com/api/auth/google/callback`
7. Copy the Client ID and Client Secret to your environment variables

## Running the Application

### Development Mode

Start the backend (from the backend directory):

```bash
npm run dev
```

Or using nodemon for auto-restart:

```bash
nodemon index.js
```

Start the frontend (from the frontend directory):

```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend: http://localhost:3000

### Production Mode

Build the frontend:

```bash
cd frontend
npm run build
```

Start the backend:

```bash
cd backend
npm start
```

## Project Structure

```
vue-project/
├── backend/
│   ├── config/
│   │   └── passport.js          # Passport configuration
│   ├── controllers/
│   │   └── auth.js              # Authentication controllers
│   ├── models/
│   │   └── users.js             # User model
│   ├── routes/
│   │   ├── auth.js              # Authentication routes
│   │   ├── strategies.js        # Strategies routes
│   │   ├── tags.js              # Tags routes
│   │   └── trades.js            # Trades routes
│   ├── startups/
│   │   └── routes.js            # Route initialization
│   ├── utils/
│   │   └── token.js             # JWT token generation
│   ├── .env.development         # Development environment variables
│   ├── .env.production          # Production environment variables
│   ├── index.js                 # Backend entry point
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AddTradeModal.vue
│   │   │   ├── EditTradeModal.vue
│   │   │   ├── Loading.vue
│   │   │   ├── PnLAnalysis.vue
│   │   │   ├── StrategiesManager.vue
│   │   │   ├── TagsManager.vue
│   │   │   └── TradesList.vue
│   │   ├── composables/
│   │   │   ├── useAuth.js
│   │   │   ├── useStrategies.js
│   │   │   ├── useTags.js
│   │   │   └── useTrades.js
│   │   ├── router/
│   │   │   └── index.js         # Vue Router configuration
│   │   ├── utils/
│   │   │   └── api.js           # API fetch utility
│   │   ├── views/
│   │   │   ├── Calculator.vue
│   │   │   ├── Login.vue
│   │   │   ├── OAuthCallback.vue
│   │   │   ├── PnLAnalysis.vue
│   │   │   ├── Register.vue
│   │   │   ├── Settings.vue
│   │   │   └── TradeLogging.vue
│   │   ├── App.vue
│   │   └── main.js
│   ├── .env.development         # Development environment variables
│   ├── .env.production          # Production environment variables
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - Google OAuth callback

### Trades
- `GET /api/trades` - Get all trades
- `POST /api/trades` - Create a new trade
- `PUT /api/trades/:id` - Update a trade
- `DELETE /api/trades/:id` - Delete a trade

### Strategies
- `GET /api/strategies` - Get all strategies
- `POST /api/strategies` - Create a new strategy
- `PUT /api/strategies/:id` - Update a strategy
- `DELETE /api/strategies/:id` - Delete a strategy

### Tags
- `GET /api/tags` - Get all tags
- `POST /api/tags` - Create a new tag
- `PATCH /api/tags/:id` - Update a tag
- `DELETE /api/tags/:id` - Delete a tag

## Environment Variables

### Backend (.env.development / .env.production)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT token generation
- `BACKEND_URL` - Backend URL used by local OAuth callbacks
- `FRONTEND_URL` - Frontend URL for OAuth redirects
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

### Frontend (.env.development / .env.production)
- `VITE_API_BASE_URL` - Local development API URL
- `VITE_SOCKET_URL` - Direct backend URL for production Socket.IO connections

## Deployment

### Backend Deployment (Render/Heroku)

1. Push your code to your hosting platform
2. Set environment variables in the hosting platform's dashboard
3. The backend will start automatically

### Frontend Deployment (Vercel/Netlify)

1. Build the frontend: `npm run build`
2. Deploy the `dist` folder to your hosting platform
3. Set environment variables in the hosting platform's dashboard

## Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running locally or your MongoDB Atlas connection string is correct
- Check that the `MONGODB_URI` in your .env file is properly formatted

### OAuth Callback Errors
- Verify that the redirect URIs in Google Cloud Console match your `BACKEND_URL/api/auth/google/callback`
- Ensure `FRONTEND_URL` and `BACKEND_URL` are correctly set in environment variables

### CORS Issues
- The backend is configured to allow CORS from the frontend URL
- Ensure the `FRONTEND_URL` in backend .env matches your frontend URL

## License

This project is licensed under the MIT License.
