const { createHash, randomBytes } = require("crypto");
const User = require("../models/User");
const { runInTransaction } = require("../utils/transaction");
const {
  disconnectUserSessions,
  revokeAllSessions,
} = require("./authService");

const PASSWORD_RESET_TTL_MS = 30 * 60_000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60_000;

function createToken() {
  return randomBytes(32).toString("hex");
}

function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function isOpaqueToken(token) {
  return typeof token === "string" && /^[a-f0-9]{64}$/i.test(token);
}

async function issuePasswordReset(user) {
  const token = createToken();
  user.passwordResetTokenHash = hashToken(token);
  user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await user.save({ validateBeforeSave: false });
  return token;
}

async function resetPasswordWithToken(token, password) {
  if (!isOpaqueToken(token)) return null;
  const user = await runInTransaction(async (session) => {
    const candidate = await User.findOne({
      passwordResetTokenHash: hashToken(token),
      passwordResetExpiresAt: { $gt: new Date() },
    })
      .select(
        "+tokenVersion +passwordResetTokenHash +passwordResetExpiresAt +emailChangeTokenHash +emailChangeExpiresAt"
      )
      .session(session);
    if (!candidate) return null;

    candidate.password = password;
    candidate.tokenVersion = Number(candidate.tokenVersion || 0) + 1;
    candidate.passwordResetTokenHash = undefined;
    candidate.passwordResetExpiresAt = undefined;
    candidate.pendingEmail = undefined;
    candidate.emailChangeTokenHash = undefined;
    candidate.emailChangeExpiresAt = undefined;
    await candidate.save({ session });
    await revokeAllSessions(candidate._id, { session, disconnect: false });
    return candidate;
  });
  if (user) disconnectUserSessions(user._id);
  return user;
}

async function issueEmailVerification(user) {
  const token = createToken();
  user.emailVerificationTokenHash = hashToken(token);
  user.emailVerificationExpiresAt = new Date(
    Date.now() + EMAIL_VERIFICATION_TTL_MS
  );
  await user.save({ validateBeforeSave: false });
  return token;
}

async function issueEmailChange(user, pendingEmail) {
  const normalizedEmail = String(pendingEmail || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Pending email is required");
  const token = createToken();
  user.pendingEmail = normalizedEmail;
  user.emailChangeTokenHash = hashToken(token);
  user.emailChangeExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
  await user.save({ validateBeforeSave: false });
  return token;
}

async function consumeEmailVerification(token) {
  if (!isOpaqueToken(token)) return null;
  return User.findOneAndUpdate(
    {
      emailVerificationTokenHash: hashToken(token),
      emailVerificationExpiresAt: { $gt: new Date() },
    },
    {
      $set: { emailVerifiedAt: new Date() },
      $unset: {
        emailVerificationTokenHash: 1,
        emailVerificationExpiresAt: 1,
      },
    },
    { returnDocument: "after" }
  );
}

async function consumeEmailChange(token) {
  if (!isOpaqueToken(token)) return null;
  const tokenHash = hashToken(token);
  const now = new Date();
  const candidate = await User.findOne({
    emailChangeTokenHash: tokenHash,
    emailChangeExpiresAt: { $gt: now },
    pendingEmail: { $type: "string" },
  }).select("+emailChangeTokenHash +emailChangeExpiresAt +tokenVersion");
  if (!candidate?.pendingEmail) return null;

  try {
    return await User.findOneAndUpdate(
      {
        _id: candidate._id,
        emailChangeTokenHash: tokenHash,
        emailChangeExpiresAt: { $gt: new Date() },
        pendingEmail: candidate.pendingEmail,
      },
      {
        $set: {
          email: candidate.pendingEmail,
          emailVerifiedAt: new Date(),
        },
        $inc: { tokenVersion: 1 },
        $unset: {
          pendingEmail: 1,
          emailChangeTokenHash: 1,
          emailChangeExpiresAt: 1,
          emailVerificationTokenHash: 1,
          emailVerificationExpiresAt: 1,
          passwordResetTokenHash: 1,
          passwordResetExpiresAt: 1,
        },
      },
      { returnDocument: "after", runValidators: true }
    );
  } catch (error) {
    if (error?.code === 11000) {
      const conflict = new Error("Email đã được sử dụng");
      conflict.code = "EMAIL_ALREADY_USED";
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}

module.exports = {
  consumeEmailChange,
  consumeEmailVerification,
  issueEmailChange,
  issueEmailVerification,
  issuePasswordReset,
  isOpaqueToken,
  resetPasswordWithToken,
};
