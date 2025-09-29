const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');

class OAuthService {
  constructor() {
    this.initializeStrategies();
  }

  initializeStrategies() {
    // Google OAuth Strategy
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback"
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user already exists with Google ID
        let user = await User.findOne({ googleId: profile.id });
        
        if (user) {
          return done(null, user);
        }

        // Check if user exists with same email
        user = await User.findOne({ email: profile.emails[0].value });
        
        if (user) {
          // Link Google account to existing user
          user.googleId = profile.id;
          user.isEmailVerified = true;
          await user.save();
          return done(null, user);
        }

        // Create new user
        user = new User({
          googleId: profile.id,
          email: profile.emails[0].value,
          username: `google_${profile.id}`,
          firstName: profile.name.givenName,
          lastName: profile.name.familyName,
          avatar: profile.photos[0]?.value,
          isEmailVerified: true
        });

        await user.save();
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    }));

    // Facebook OAuth Strategy
    passport.use(new FacebookStrategy({
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: "/api/auth/facebook/callback",
      profileFields: ['id', 'emails', 'name', 'picture']
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user already exists with Facebook ID
        let user = await User.findOne({ facebookId: profile.id });
        
        if (user) {
          return done(null, user);
        }

        // Check if user exists with same email
        user = await User.findOne({ email: profile.emails[0].value });
        
        if (user) {
          // Link Facebook account to existing user
          user.facebookId = profile.id;
          user.isEmailVerified = true;
          await user.save();
          return done(null, user);
        }

        // Create new user
        user = new User({
          facebookId: profile.id,
          email: profile.emails[0].value,
          username: `facebook_${profile.id}`,
          firstName: profile.name.givenName,
          lastName: profile.name.familyName,
          avatar: profile.photos[0]?.value,
          isEmailVerified: true
        });

        await user.save();
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    }));

    passport.serializeUser((user, done) => {
      done(null, user._id);
    });

    passport.deserializeUser(async (id, done) => {
      try {
        const user = await User.findById(id);
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    });
  }

  getGoogleAuthURL() {
    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    const options = {
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      client_id: process.env.GOOGLE_CLIENT_ID,
      access_type: 'offline',
      response_type: 'code',
      prompt: 'consent',
      scope: [
        'openid',
        'profile',
        'email'
      ].join(' ')
    };

    const qs = new URLSearchParams(options);
    return `${rootUrl}?${qs.toString()}`;
  }
}

module.exports = new OAuthService();