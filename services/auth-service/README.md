# Auth Service - Authentication & User Management

A comprehensive authentication and user management microservice built with Node.js, Express, and MongoDB.

## Features

### Authentication
- JWT-based authentication with refresh tokens
- OAuth integration (Google, Facebook)
- Password hashing with bcrypt
- Session management with device tracking
- Rate limiting and security middleware

### User Management
- User registration and login
- Profile management
- Password reset functionality
- Email verification
- Two-factor authentication support
- Account locking after failed attempts

### KYC (Know Your Customer)
- Document upload and verification
- Admin review workflow
- Compliance checks (sanctions, PEP, AML)
- Risk scoring
- Status tracking

### Security Features
- Input validation and sanitization
- Rate limiting
- Helmet security headers
- CORS configuration
- XSS protection
- MongoDB injection prevention
- Encryption for sensitive data

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT, Passport.js
- **File Upload**: Multer
- **Image Processing**: Sharp
- **Validation**: Joi, express-validator
- **Security**: Helmet, bcrypt, rate limiting

## Environment Variables

```env
# Server
PORT=3001
NODE_ENV=production

# Database
MONGODB_URI=mongodb://localhost:27017/auth-service

# JWT
JWT_SECRET=your-jwt-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Encryption
ENCRYPTION_KEY=your-32-byte-encryption-key

# OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback

FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret

# Frontend
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Email (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/logout` - Logout current session
- `POST /api/auth/logout-all` - Logout all sessions
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `GET /api/auth/google` - Google OAuth
- `GET /api/auth/facebook` - Facebook OAuth

### User Management
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `POST /api/users/change-password` - Change password
- `POST /api/users/upload-avatar` - Upload avatar
- `GET /api/users/sessions` - Get active sessions
- `DELETE /api/users/sessions/:sessionId` - Revoke session
- `DELETE /api/users/account` - Delete account

### KYC
- `POST /api/kyc/submit` - Submit KYC documents
- `GET /api/kyc/status` - Get KYC status
- `GET /api/kyc/admin/all` - Get all KYCs (admin)
- `PUT /api/kyc/admin/review/:kycId` - Review KYC (admin)

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Start MongoDB
5. Run the service: `npm start` (production) or `npm run dev` (development)

## Docker Deployment

```bash
# Build image
docker build -t auth-service .

# Run container
docker run -d \
  --name auth-service \
  -p 3001:3001 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017/auth-service \
  auth-service
```

## Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Security Considerations

1. **Environment Variables**: Never commit sensitive environment variables
2. **Rate Limiting**: Configured for different endpoint types
3. **Input Validation**: All inputs are validated and sanitized
4. **Password Security**: Bcrypt with salt rounds 12
5. **JWT Security**: Short-lived access tokens with refresh token rotation
6. **File Upload**: Restricted file types and sizes
7. **Session Management**: Automatic cleanup and device tracking

## Monitoring

- Health check endpoint: `GET /health`
- Request logging with Morgan
- Error tracking and handling
- Performance monitoring ready

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details
```

## Error Handler Middleware (src/middleware/errorHandler.js)
```javascript
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;

  // Mongoose bad ObjectId
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = 'Resource not found';
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = 400;
    message = 'Duplicate field value entered';
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(val => val.message).join(', ');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack
  });
};

module.exports = { notFound, errorHandler };