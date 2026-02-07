// Auth module
const Auth = (() => {
  const authScreen = document.getElementById('auth-screen');
  const appEl = document.getElementById('app');
  const form = document.getElementById('auth-form');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const nameInput = document.getElementById('auth-name');
  const inviteInput = document.getElementById('auth-invite');
  const nameGroup = document.getElementById('name-group');
  const inviteGroup = document.getElementById('invite-group');
  const authTitle = document.getElementById('auth-title');
  const toggleText = document.getElementById('auth-toggle-text');
  const toggleLink = document.getElementById('auth-toggle-link');
  const submitBtn = document.getElementById('auth-submit');
  const errorEl = document.getElementById('auth-error');
  const signOutBtn = document.getElementById('btn-signout');

  let isSignUp = false;
  let currentUser = null;
  let userData = null;

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('visible');
    setTimeout(() => errorEl.classList.remove('visible'), 5000);
  }

  function toggleMode() {
    isSignUp = !isSignUp;
    if (isSignUp) {
      authTitle.textContent = 'Create Account';
      submitBtn.textContent = 'Sign Up';
      toggleText.textContent = 'Already have an account?';
      toggleLink.textContent = 'Sign In';
      nameGroup.style.display = 'block';
      inviteGroup.style.display = 'block';
      passwordInput.setAttribute('autocomplete', 'new-password');
    } else {
      authTitle.textContent = 'Sign In';
      submitBtn.textContent = 'Sign In';
      toggleText.textContent = "Don't have an account?";
      toggleLink.textContent = 'Sign Up';
      nameGroup.style.display = 'none';
      inviteGroup.style.display = 'none';
      passwordInput.setAttribute('autocomplete', 'current-password');
    }
    errorEl.classList.remove('visible');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    submitBtn.disabled = true;

    try {
      if (isSignUp) {
        const name = nameInput.value.trim();
        const inviteCode = inviteInput.value.trim();
        if (!name) { showError('Please enter your name.'); submitBtn.disabled = false; return; }

        // Check invite code if provided
        let companyId = null;
        if (inviteCode) {
          const codeDoc = await db.collection('inviteCodes').doc(inviteCode).get();
          if (!codeDoc.exists || !codeDoc.data().active) {
            showError('Invalid invite code.');
            submitBtn.disabled = false;
            return;
          }
          companyId = codeDoc.data().companyId;
        }

        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(cred.user.uid).set({
          email,
          name,
          role: 'participant',
          companyId,
          challengeStartDate: new Date().toISOString().split('T')[0],
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } else {
        await auth.signInWithEmailAndPassword(email, password);
      }
    } catch (err) {
      const messages = {
        'auth/email-already-in-use': 'Email already registered. Try signing in.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/user-not-found': 'No account found. Try signing up.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/invalid-credential': 'Invalid email or password.'
      };
      showError(messages[err.code] || err.message);
    }
    submitBtn.disabled = false;
  }

  async function loadUserData(user) {
    const doc = await db.collection('users').doc(user.uid).get();
    if (doc.exists) {
      userData = { id: user.uid, ...doc.data() };
    }
    return userData;
  }

  function onAuthStateChanged(callback) {
    auth.onAuthStateChanged(async user => {
      currentUser = user;
      if (user) {
        await loadUserData(user);
        authScreen.style.display = 'none';
        appEl.style.display = 'block';
        callback(userData);
      } else {
        userData = null;
        authScreen.style.display = '';
        appEl.style.display = 'none';
        callback(null);
      }
    });
  }

  function signOut() {
    auth.signOut();
  }

  function getUser() { return userData; }
  function getUid() { return currentUser ? currentUser.uid : null; }

  // Password reset
  const forgotLink = document.getElementById('auth-forgot-link');
  const resetSent = document.getElementById('reset-sent');
  forgotLink.addEventListener('click', async e => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) { showError('Enter your email first.'); return; }
    try {
      await auth.sendPasswordResetEmail(email);
      resetSent.style.display = 'block';
      setTimeout(() => { resetSent.style.display = 'none'; }, 5000);
    } catch (err) {
      showError('Could not send reset email. Check the address.');
    }
  });

  // Event listeners
  toggleLink.addEventListener('click', e => { e.preventDefault(); toggleMode(); });
  form.addEventListener('submit', handleSubmit);
  signOutBtn.addEventListener('click', signOut);

  return { onAuthStateChanged, signOut, getUser, getUid };
})();
