const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');

module.exports = function (passport) {
    passport.use(
        new GitHubStrategy(
            {
                clientID: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET,
                callbackURL: process.env.GITHUB_CALLBACK_URL
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    // Check if user exists
                    let user = await User.findOne({ githubId: profile.id });

                    if (user) {
                        // Update access token
                        user.githubAccessToken = accessToken;
                        await user.save();
                        return done(null, user);
                    }

                    // Create new user
                    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : `${profile.username}@github.com`;

                    user = new User({
                        username: profile.username,
                        email,
                        githubId: profile.id,
                        githubUsername: profile.username,
                        githubAccessToken: accessToken,
                        avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : ''
                    });

                    await user.save();
                    done(null, user);
                } catch (error) {
                    console.error('GitHub strategy error:', error);
                    done(error, null);
                }
            }
        )
    );

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (error) {
            done(error, null);
        }
    });
};
