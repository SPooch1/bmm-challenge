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
  // While a sign-up is writing the user doc (and claiming a cohort seat), the
  // auth listener waits for it instead of creating a default doc of its own.
  let signupPending = null;

  const SEATS_FULL_MSG = 'This cohort is full. Please contact your HR contact about joining.';
  // Where this sign-up came from (?src=book on the link in the book). Stored on the
  // user doc as `source` and counted once in the owner's funnel (funnel.js).
  const signupSource = typeof Funnel !== 'undefined' ? Funnel.readSourceFromUrl() : '';
  const seatsFull = d => d && typeof d.maxSeats === 'number' && d.maxSeats > 0 && (d.seatsUsed || 0) >= d.maxSeats;

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
        const inviteCode = inviteInput.value.trim().toUpperCase();
        if (!name) { showError('Please enter your name.'); submitBtn.disabled = false; return; }

        // Check invite code if provided
        let companyId = null;
        let cohortStart = null;
        if (inviteCode) {
          const codeDoc = await db.collection('inviteCodes').doc(inviteCode).get();
          if (!codeDoc.exists || !codeDoc.data().active) {
            showError('Invalid invite code.');
            submitBtn.disabled = false;
            return;
          }
          if (seatsFull(codeDoc.data())) {
            showError(SEATS_FULL_MSG);
            submitBtn.disabled = false;
            return;
          }
          companyId = codeDoc.data().companyId;
          cohortStart = codeDoc.data().challengeStartDate || null; // synchronized cohort start
        }

        let finishSignup;
        signupPending = new Promise(resolve => { finishSignup = resolve; });
        try {
          const cred = await auth.createUserWithEmailAndPassword(email, password);
          const profile = {
            email,
            name,
            role: 'participant',
            companyId,
            privacyV: 2, // post-split doc shape: admin-readable profile, no wellness data
            challengeStartDate: cohortStart || new Date().toISOString().split('T')[0],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          };
          if (signupSource) profile.source = signupSource;
          if (!inviteCode) {
            await db.collection('users').doc(cred.user.uid).set(profile);
          } else {
            // Seat cap: the user doc and the seat count move together in one batch.
            // The rules refuse the batch when seatsUsed would pass maxSeats.
            profile.inviteCode = inviteCode;
            const batch = db.batch();
            batch.set(db.collection('users').doc(cred.user.uid), profile);
            batch.update(db.collection('inviteCodes').doc(inviteCode), { seatsUsed: firebase.firestore.FieldValue.increment(1) });
            try {
              await batch.commit();
            } catch (seatErr) {
              // Most likely the last seat went while this form was open. Remove the
              // half-made login so the person can try again once a seat opens.
              await cred.user.delete().catch(() => auth.signOut());
              const fresh = await db.collection('inviteCodes').doc(inviteCode).get().catch(() => null);
              showError(fresh && fresh.exists && seatsFull(fresh.data()) ? SEATS_FULL_MSG : 'Could not join with that invite code. Please try again.');
              submitBtn.disabled = false;
              return;
            }
          }
          // Counted after the user doc exists; never blocks the sign-up
          if (typeof Funnel !== 'undefined') { Funnel.signedUp(signupSource); Funnel.clearSource(); }
        } finally {
          finishSignup();
          signupPending = null;
        }
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
    } else {
      // Doc missing — create it with defaults so app.js doesn't crash on userData.challengeStartDate
      const defaults = {
        email: user.email || '',
        name: user.displayName || '',
        role: 'participant',
        companyId: null,
        privacyV: 2,
        challengeStartDate: new Date().toISOString().split('T')[0],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection('users').doc(user.uid).set(defaults);
      userData = { id: user.uid, ...defaults };
    }
    return userData;
  }

  function onAuthStateChanged(callback) {
    auth.onAuthStateChanged(async user => {
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) loadingScreen.style.display = 'none';

      if (user && signupPending) {
        await signupPending;
        // A refused seat claim deletes the new login: nothing to load.
        if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
      }
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

  // Join link: ?code=ABC123 prefills the invite code and opens sign-up
  (function applyInviteFromUrl() {
    const code = (new URLSearchParams(window.location.search).get('code') || '').trim().toUpperCase();
    if (code) {
      if (!isSignUp) toggleMode();
      inviteInput.value = code;
    }
  })();

  // Book link: ?src=book opens sign-up with a short note for readers
  (function applyBookBridge() {
    const note = document.getElementById('auth-source-note');
    if (!note) return;
    if (signupSource === 'book') {
      note.innerHTML = '<strong>Reading the book?</strong> Each day in the book has a matching day here. Create a free account and leave the invite code blank.';
      note.style.display = 'block';
      if (!isSignUp && !auth.currentUser) toggleMode();
    } else if (signupSource === 'talk' || signupSource === 'guide') {
      note.innerHTML = '<strong>Welcome.</strong> Create a free account and leave the invite code blank unless your employer gave you one.';
      note.style.display = 'block';
    }
  })();

  return { onAuthStateChanged, signOut, getUser, getUid };
})();
